namespace ShopKart.Game;

public static class Scenes
{
    private static Option R(string t) => new(t, Kind.Right);
    private static Option P(string t) => new(t, Kind.Partial);
    private static Option W(string t) => new(t, Kind.Wrong);

    public static readonly IReadOnlyList<Scene> All =
    [
        new("1,000 users, one server", "CPU hits 90% during the weekend sale.",
            "ShopKart runs on one VM with the ASP.NET Core app and SQL Server together. Small team of three.",
            [R("Upgrade to a bigger VM and move SQL to its own managed instance"), W("Rewrite into microservices now so each part scales"),
             W("Add Kafka between the web app and the database"), W("Shard the database across four servers")],
            "Bigger server", 3,
            "At this size vertical scaling is cheap, fast and correct. The others add huge complexity for a problem you don't have yet."),

        new("50,000 users, three app instances", "After adding two instances, users get logged out at random.",
            "Logins work, then a few clicks later people are back at the login page or see antiforgery errors.",
            [P("Use sticky sessions on the load balancer"), R("Move session state to Redis and share Data Protection keys"),
             W("Go back to one bigger server"), W("Increase the session timeout")],
            "Load balancer", 3,
            "Each instance keeps sessions in memory and has its own Data Protection keys. Make the app tier stateless. Sticky sessions hide it but break balancing."),

        new("200,000 users", "Database at 85% CPU; 95% of queries are product page reads.",
            "Product details change a few times a day. Every page view runs the same queries.",
            [W("Add more app instances"), R("Cache product data in Redis (cache-aside, TTL, invalidate on update)"),
             W("Migrate everything to a NoSQL database"), P("Add an index to every column")],
            "Redis cache", 5,
            "Read-heavy, rarely-changing data is the ideal caching case. More app instances just send more queries to the struggling DB."),

        new("200,000 users, going national", "Users in other regions say images take five seconds to load.",
            "Images are served from the app servers in one data centre.",
            [R("Put images in blob storage behind a CDN with versioned file names"), W("Store images in SQL Server so they're backed up"),
             P("Buy a bigger network plan for the app servers"), P("Lower the image quality")],
            "CDN", 6,
            "Distance is the problem, so move files closer to users. Bandwidth and compression help a little but can't beat physics."),

        new("500,000 users", "Monthly sales reports lock up the database for 20 minutes.",
            "Finance runs heavy reporting queries on the same primary that takes orders.",
            [W("Shard the database"), R("Run reports on a read replica, accepting a few seconds of lag"),
             P("Cache the report results"), W("Delete orders older than a year")],
            "Read replica", 9,
            "Reports are reads that tolerate slightly stale data: exactly what replicas are for. Sharding is a write-scaling tool."),

        new("500,000 users", "Checkout takes 4 s, and when SMS fails the whole order fails.",
            "Checkout saves the order, then synchronously generates a PDF, sends email and sends SMS.",
            [W("Increase the HTTP timeout"), R("Save the order, publish OrderPlaced to a queue, let workers do the rest"),
             P("Run the three calls in parallel with Task.WhenAll"), W("Remove the SMS feature")],
            "Message queue", 15,
            "Users don't need to wait for side effects. A queue makes checkout fast and stops a flaky provider failing orders."),

        new("1 million users", "Some customers are charged twice.",
            "On slow networks the mobile app times out and retries. The first request actually succeeded.",
            [P("Turn off retries in the mobile app"), R("Require an idempotency key per payment, stored with a unique constraint"),
             W("Lock the payments table during each payment"), W("Refund duplicates manually each night")],
            "Idempotency keys", 21,
            "Retries are unavoidable. Idempotency keys make them safe. Turning retries off turns double charges into failed payments."),

        new("1 million users", "The payment provider slows down and your whole site goes down.",
            "Payment calls take 30 s. Request threads pile up, and even the home page stops responding.",
            [W("Increase the thread pool size"), W("Retry payment calls immediately up to 10 times"),
             R("Add timeouts and a circuit breaker on the payment client"), P("Move payments to a separate VM")],
            "Circuit breaker", 20,
            "Timeouts cap the wait; a circuit breaker fails fast while the provider recovers. Aggressive retries cause a retry storm."),

        new("2 million users", "A scraper sends 5,000 requests/second to search.",
            "It comes from a handful of IP ranges, driving up cost and latency for real users.",
            [W("Scale out search to handle it"), R("Per-client rate limiting at the gateway, returning 429 + Retry-After"),
             P("Show a CAPTCHA on every search"), W("Block all traffic from other countries")],
            "Rate limiter", 19,
            "Rate limiting protects capacity for real users. Scaling out pays for the abuse; CAPTCHAs on every search hurt every customer."),

        new("5 million users", "Orders table is 3 TB and the primary can't keep up with writes.",
            "Replicas handle reads, but write latency climbs. You're on the largest instance. Most queries are 'orders for this customer'.",
            [W("Add more read replicas"), R("Shard orders by customer ID"), W("Shard orders by order date"), W("Move orders to an in-memory cache")],
            "Shards", 10,
            "Writes are the bottleneck and vertical scaling is exhausted: sharding is justified. Customer ID spreads writes evenly; date creates a hot shard."),

        new("5 million users", "Adding a fifth shard would move 80% of all orders.",
            "Your router uses hash(customerId) % 4. Going to 5 changes almost every customer's shard.",
            [W("Accept the full migration each time"), R("Use consistent hashing with virtual nodes"),
             P("Never add shards, buy bigger ones instead"), P("Route only new customers to the new shard")],
            "Consistent hashing", 11,
            "Consistent hashing moves about 1/N of keys when a node is added. The alternatives only delay the problem."),

        new("Flash sale, 100 phones in stock", "You sold 140 phones you only had 100 of.",
            "Stock is read from cache, checked in code, then decremented separately. Thousands clicked Buy in the same second.",
            [W("Refresh the cache more often"), R("One atomic conditional update: decrement only if stock > 0"),
             W("Show 'low stock' warnings sooner"), P("Process orders one at a time on a single thread")],
            "Atomic stock update", 12,
            "Inventory needs strong consistency. Read-check-write is a race. UPDATE ... WHERE Stock > 0 makes the database the referee."),

        new("8 million users, 12 services", "p99 checkout latency doubled; nobody knows which service is slow.",
            "Each team has its own logs. Checkout touches six services.",
            [W("Ask each team to check their logs"), R("Add OpenTelemetry distributed tracing"),
             W("Add more instances to every service"), P("Watch average latency per service")],
            "Distributed tracing", 22,
            "Tracing shows one request across every hop, so the slow span stands out. Averages hide tail latency."),

        new("8 million users", "Payment succeeded but the order was never created.",
            "Order, Payment and Inventory are separate services with their own databases. A crash hit between steps.",
            [P("Two-phase commit across all three databases"), R("Saga with compensating actions + transactional outbox"),
             P("Merge all three into one shared database"), W("Add a nightly reconciliation job only")],
            "Saga + outbox", 13,
            "A saga coordinates steps and undoes completed ones on failure; the outbox publishes events if and only if the local transaction commits."),

        new("10 million users", "Customers want live order tracking.",
            "20 instances of the tracking API. Courier webhooks can land on any instance.",
            [P("Let the app poll every second"), R("SignalR with a Redis backplane or Azure SignalR Service"),
             W("SignalR without a backplane"), W("Email customers on every status change")],
            "SignalR backplane", 16,
            "Push is right, and with 20 instances the webhook and the connection are usually on different servers: you need a backplane.")
    ];
}
