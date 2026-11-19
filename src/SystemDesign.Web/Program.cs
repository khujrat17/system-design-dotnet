// System Design Lab: a browser UI over the 26 concept demos.
// Each demo is the same C# class the console app runs; here its output is captured and drawn in the page.

using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using SystemDesign.Concepts;

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
builder.Services.AddResponseCompression(o => o.EnableForHttps = true);
builder.Services.AddHealthChecks();

// The lab practises what it teaches (concept 19): running demos costs CPU, so limit it per client
// and cap how many run at once across the whole server.
var runsPerMinute = builder.Configuration.GetValue("Lab:RunsPerMinutePerClient", 30);
var maxConcurrentRuns = builder.Configuration.GetValue("Lab:MaxConcurrentRuns", 4);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (ctx, _) =>
    {
        if (ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retry))
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)retry.TotalSeconds).ToString();
        return ValueTask.CompletedTask;
    };
    o.AddPolicy("runs", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = runsPerMinute, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        ctx.Request.Path.StartsWithSegments("/api/demos") && HttpMethods.IsPost(ctx.Request.Method)
            ? RateLimitPartition.GetConcurrencyLimiter("all-runs", _ => new ConcurrencyLimiterOptions { PermitLimit = maxConcurrentRuns, QueueLimit = 20 })
            : RateLimitPartition.GetNoLimiter("other"));
});

var app = builder.Build();

var demoTypes = typeof(IDemo).Assembly.GetTypes()
    .Where(t => typeof(IDemo).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false })
    .Select(t => (Type: t, Info: (IDemo)Activator.CreateInstance(t)!))
    .OrderBy(d => d.Info.Number)
    .ToDictionary(d => d.Info.Number, d => d.Type);

// Some demos keep static state (a deny-list, counters), so the same demo never runs twice at the same time.
var demoLocks = new ConcurrentDictionary<int, SemaphoreSlim>();
var runTimeout = TimeSpan.FromSeconds(builder.Configuration.GetValue("Lab:RunTimeoutSeconds", 30));

var resources = Assembly.GetExecutingAssembly();
string? ReadResource(string name)
{
    using var s = resources.GetManifestResourceStream(name);
    if (s is null) return null;
    using var r = new StreamReader(s, Encoding.UTF8);
    return r.ReadToEnd();
}

string? SourceOf(Type t) => ReadResource($"demos/{t.Name}.cs");

string SummaryOf(string? source)
{
    if (source is null) return "";
    var m = Regex.Match(source, @"///\s*<summary>(.*?)</summary>", RegexOptions.Singleline);
    return m.Success ? Regex.Replace(m.Groups[1].Value.Replace("///", ""), @"\s+", " ").Trim() : "";
}

// Course text (theory, trade-offs, interview tips, game scenes) lives in docs/system-design-course.html.
// Reuse it as data so there is one source of truth: slice out the TRACKS / C / PIECES / SCENES declarations.
var courseScript = BuildCourseScript(ReadResource("course.html"));
var demoList = demoTypes.Select(kv =>
{
    var d = (IDemo)Activator.CreateInstance(kv.Value)!;
    return new DemoInfo(d.Number, d.Track, d.Title, kv.Value.Name + ".cs", SummaryOf(SourceOf(kv.Value)));
}).ToList();

app.UseResponseCompression();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    // Revalidate (cheap 304 via ETag) so a new deploy never mixes an old app.js with a new index.html.
    OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache"
});
app.UseRateLimiter();

app.MapHealthChecks("/health");

app.MapGet("/api/site", (IConfiguration cfg) => new
{
    RepositoryUrl = cfg["Site:RepositoryUrl"] ?? "",
    Version = typeof(IDemo).Assembly.GetName().Version?.ToString(3) ?? "1.0.0"
});

app.MapGet("/api/demos", () => demoList);

app.MapPost("/api/demos/{n:int}/run", async (int n, CancellationToken aborted) =>
{
    if (!demoTypes.TryGetValue(n, out var type)) return Results.NotFound();
    var gate = demoLocks.GetOrAdd(n, _ => new SemaphoreSlim(1, 1));
    if (!await gate.WaitAsync(runTimeout, aborted)) return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    try
    {
        var demo = (IDemo)Activator.CreateInstance(type)!;   // fresh instance per run
        var sw = Stopwatch.StartNew();
        var run = Out.CaptureAsync(demo.RunAsync);
        if (await Task.WhenAny(run, Task.Delay(runTimeout, aborted)) != run)
            return Results.Problem($"Demo {n} took longer than {runTimeout.TotalSeconds:N0} s.", statusCode: StatusCodes.Status504GatewayTimeout);
        return Results.Ok(new { demo.Number, demo.Title, DurationMs = sw.Elapsed.TotalMilliseconds, Entries = await run });
    }
    finally { gate.Release(); }
}).RequireRateLimiting("runs");

app.MapGet("/api/demos/{n:int}/source", (int n) =>
    demoTypes.TryGetValue(n, out var type) && SourceOf(type) is { } src
        ? Results.Text(src, "text/plain; charset=utf-8")
        : Results.NotFound());

app.MapGet("/course-data.js", () => Results.Text(courseScript, "text/javascript; charset=utf-8"));

app.MapGet("/course", () => ReadResource("course.html") is { } html
    ? Results.Content(html, "text/html; charset=utf-8")
    : Results.NotFound());

app.Run();

static string BuildCourseScript(string? html)
{
    const string empty = "window.COURSE = {TRACKS:[],C:[],PIECES:[],SCENES:[]};";
    if (html is null) return empty;
    var start = html.IndexOf("const TRACKS", StringComparison.Ordinal);
    var end = html.IndexOf("/* ---------------- RENDER", StringComparison.Ordinal);
    if (start < 0 || end <= start) return empty;
    var data = html[start..end];
    return $"window.COURSE = (function(){{\n{data}\nreturn {{TRACKS, C, PIECES, SCENES}};\n}})();";
}

internal sealed record DemoInfo(int Number, string Track, string Title, string File, string Summary);

/// <summary>Exposed so integration tests can host the app with WebApplicationFactory.</summary>
public partial class Program;
