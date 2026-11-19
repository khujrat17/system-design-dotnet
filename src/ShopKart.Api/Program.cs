// ShopKart.Api: system design concepts using only features built into ASP.NET Core.
// No external infrastructure needed. See ShopKart.Api.http to call every endpoint.

using System.Collections.Concurrent;
using System.Threading.Channels;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using ShopKart.Api;

var builder = WebApplication.CreateBuilder(args);

// ---- Data + queue ---------------------------------------------------------
builder.Services.AddSingleton<Store>();
builder.Services.AddSingleton(Channel.CreateBounded<OrderPlaced>(new BoundedChannelOptions(10_000)
{
    FullMode = BoundedChannelFullMode.Wait          // backpressure instead of unbounded memory growth
}));
builder.Services.AddHostedService<OrderEventsWorker>();
builder.Services.AddSingleton<ConcurrentDictionary<string, Lazy<OrderResult>>>();   // idempotency store

// ---- Caching (concept 5) ---------------------------------------------------
// IMemoryCache is per instance. With several instances use IDistributedCache + Redis,
// or HybridCache (Microsoft.Extensions.Caching.Hybrid) which adds stampede protection.
builder.Services.AddMemoryCache();
builder.Services.AddOutputCache(o => o.AddPolicy("catalog", p => p.Expire(TimeSpan.FromSeconds(30))));

// ---- Rate limiting (concept 19) --------------------------------------------
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, _) =>
    {
        ctx.HttpContext.Response.Headers.RetryAfter = "1";
        return ValueTask.CompletedTask;
    };
    o.AddPolicy("search", http => RateLimitPartition.GetTokenBucketLimiter(
        partitionKey: http.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 5,                                   // burst
            TokensPerPeriod = 1,
            ReplenishmentPeriod = TimeSpan.FromSeconds(1),    // then 1 request/second
            QueueLimit = 0,
            AutoReplenishment = true
        }));
});

// ---- Resilience: server-side request timeouts (concept 20) -----------------
builder.Services.AddRequestTimeouts();

// ---- Health checks for the load balancer (concept 4) -----------------------
builder.Services.AddHealthChecks()
    .AddCheck("store", () => HealthCheckResult.Healthy("in-memory store reachable"), tags: ["ready"]);

// ---- Horizontal scaling (concept 3) ----------------------------------------
// With more than one instance, persist Data Protection keys centrally, e.g.
// builder.Services.AddDataProtection().PersistKeysToStackExchangeRedis(...)  (package needed)

var app = builder.Build();

// ---- Correlation ID: the poor man's tracing (concept 22) -------------------
app.Use(async (ctx, next) =>
{
    var id = ctx.Request.Headers["X-Correlation-Id"].FirstOrDefault() ?? Guid.NewGuid().ToString("n");
    ctx.Response.Headers["X-Correlation-Id"] = id;
    using (app.Logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = id }))
        await next(ctx);
});

app.UseRateLimiter();
app.UseRequestTimeouts();
app.UseOutputCache();

// Liveness: process is up. Does NOT check dependencies, so a DB blip doesn't restart every instance.
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
// Readiness: can this instance serve traffic right now?
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = c => c.Tags.Contains("ready") });

app.MapGet("/", () => Results.Text(
    "ShopKart.Api is running. Open ShopKart.Api.http in Visual Studio / VS Code / Rider to try each concept."));

// ---- Cache-aside on product reads (concept 5) -----------------------------
app.MapGet("/products/{id:int}", async (int id, Store store, IMemoryCache cache, CancellationToken ct) =>
{
    var key = $"product:{id}";
    var fromCache = cache.TryGetValue(key, out Product? product);
    if (!fromCache)
    {
        product = await store.GetProductAsync(id, ct);                    // miss -> "DB"
        if (product is null) return Results.NotFound();
        cache.Set(key, product, TimeSpan.FromMinutes(5));                  // populate with TTL
    }
    return Results.Ok(new { product, servedFrom = fromCache ? "cache" : "database", totalDbReads = store.DbReads });
});

// Write + invalidate: delete the key so the next read fetches fresh data
app.MapPut("/products/{id:int}/price", (int id, [FromBody] decimal price, Store store, IMemoryCache cache) =>
{
    if (!store.UpdatePrice(id, price)) return Results.NotFound();
    cache.Remove($"product:{id}");
    return Results.NoContent();
});

// ---- Output caching: whole response cached for 30 s (concept 5/6) ----------
app.MapGet("/catalog", (Store store) => Results.Ok(new { generatedAt = DateTime.UtcNow, products = store.AllProducts() }))
   .CacheOutput("catalog");

// ---- Rate-limited search (concept 19) -------------------------------------
app.MapGet("/search", (string q, Store store) => Results.Ok(store.Search(q)))
   .RequireRateLimiting("search");

// ---- Place order: idempotency + atomic stock + queue (concepts 21, 12, 15) --
app.MapPost("/orders", async (
    PlaceOrderRequest req,
    [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
    Store store,
    ConcurrentDictionary<string, Lazy<OrderResult>> idempotency,
    Channel<OrderPlaced> queue,
    CancellationToken ct) =>
{
    if (string.IsNullOrWhiteSpace(idempotencyKey))
        return Results.BadRequest(new { error = "Send an Idempotency-Key header (a new GUID per logical order)." });
    if (req.Quantity is < 1 or > 10)
        return Results.BadRequest(new { error = "Quantity must be between 1 and 10." });

    // GetOrAdd + Lazy: concurrent duplicates with the same key run the work ONCE.
    // In SQL: a table with a unique index on the key, written in the same transaction as the order.
    var lazy = idempotency.GetOrAdd(idempotencyKey, _ => new Lazy<OrderResult>(() =>
    {
        if (!store.TryReserveStock(req.ProductId, req.Quantity, out var unitPrice))
            return new OrderResult(StatusCodes.Status409Conflict, new { error = "Out of stock" });

        var order = store.AddOrder(req.ProductId, req.Quantity, unitPrice * req.Quantity, req.CustomerId);
        // In production: write this event to an outbox table in the same transaction (concept 13).
        queue.Writer.TryWrite(new OrderPlaced(order.Id, order.CustomerId, order.Total));
        return new OrderResult(StatusCodes.Status201Created, order);
    }));

    var replay = lazy.IsValueCreated;
    var result = lazy.Value;
    await Task.CompletedTask;
    return Results.Json(new { replayed = replay, result = result.Body }, statusCode: result.StatusCode);
});

// ---- Keyset (cursor) pagination (concept 14) --------------------------------
app.MapGet("/orders", (Store store, long? after, int? limit) =>
{
    var size = Math.Clamp(limit ?? 20, 1, 100);
    var page = store.OrdersAfter(after ?? 0, size);
    return Results.Ok(new { items = page, next = page.Count == size ? page[^1].Id : (long?)null });
});

// ---- Server-side timeout (concept 20) ---------------------------------------
// Note: request timeouts are not enforced while a debugger is attached. Run without debugging to see the 504.
app.MapGet("/slow-report", async (CancellationToken ct) =>
{
    await Task.Delay(TimeSpan.FromSeconds(10), ct);          // a report that would hang a thread
    return Results.Ok("finished");
}).WithRequestTimeout(TimeSpan.FromSeconds(2));

app.Run();
