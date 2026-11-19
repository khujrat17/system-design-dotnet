using System.Collections.Concurrent;
using System.Text;
using System.Threading.Channels;

namespace SystemDesign.Concepts.Demos;

/// <summary>Case study: URL shortener with range-allocated IDs, base62 codes, cache-aside and async click analytics.</summary>
public sealed class D25_UrlShortener : IDemo
{
    public int Number => 25;
    public string Track => "Case studies";
    public string Title => "Case study: URL shortener";

    private const string Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    public static string ToBase62(long n)
    {
        if (n == 0) return "0";
        var sb = new StringBuilder();
        while (n > 0) { sb.Insert(0, Alphabet[(int)(n % 62)]); n /= 62; }
        return sb.ToString();
    }

    /// <summary>Central counter hands out blocks of IDs, so each app server allocates locally without contention.</summary>
    private sealed class RangeAllocator(long blockSize)
    {
        private long _next = 100_000_000;                 // start high so codes are not trivially short
        public (long Start, long End) NextBlock()
        {
            var end = Interlocked.Add(ref _next, blockSize);
            return (end - blockSize, end);
        }
    }

    private sealed class AppServer(string name, RangeAllocator allocator)
    {
        private long _current, _end;
        public string Name => name;
        public long NextId()
        {
            if (_current >= _end) (_current, _end) = allocator.NextBlock();   // only hits the counter once per block
            return _current++;
        }
    }

    public async Task RunAsync()
    {
        var allocator = new RangeAllocator(blockSize: 1_000);
        var servers = new[] { new AppServer("api-1", allocator), new AppServer("api-2", allocator) };
        var db = new ConcurrentDictionary<string, string>();
        var cache = new ConcurrentDictionary<string, string>();
        var clicks = Channel.CreateUnbounded<string>();
        var dbReads = 0;

        Out.Step("POST /links on two servers (no coordination per request)");
        string[] urls = ["https://example.com/sale/diwali", "https://example.com/blog/system-design", "https://example.com/p/42"];
        var codes = new List<string>();
        for (var i = 0; i < urls.Length; i++)
        {
            var s = servers[i % 2];
            var code = ToBase62(s.NextId());
            db[code] = urls[i];
            codes.Add(code);
            Out.Line($"{s.Name}: {code,-7} -> {urls[i]}");
        }
        Out.Line($"7 base62 chars = 62^7 = {Math.Pow(62, 7):N0} possible codes");

        Out.Step("GET /{code}: 10,000 redirects, most traffic on one viral link");
        var rnd = new Random(4);
        var analytics = Task.Run(async () =>
        {
            var tally = new Dictionary<string, int>();
            await foreach (var c in clicks.Reader.ReadAllAsync()) tally[c] = tally.GetValueOrDefault(c) + 1;
            return tally;
        });
        for (var i = 0; i < 10_000; i++)
        {
            var code = rnd.NextDouble() < 0.9 ? codes[0] : codes[rnd.Next(codes.Count)];
            if (!cache.TryGetValue(code, out var target))
            {
                Interlocked.Increment(ref dbReads);
                target = db[code];
                cache[code] = target;
            }
            clicks.Writer.TryWrite(code);       // don't write a DB row per click in the hot path
            // return Results.Redirect(target, permanent: false);  // 302 keeps analytics accurate
        }
        clicks.Writer.Complete();
        var counts = await analytics;
        Out.Good($"DB reads: {dbReads} for 10,000 redirects (cache-aside)");
        foreach (var (code, n) in counts.OrderByDescending(x => x.Value)) Out.Line($"{code}: {n:N0} clicks (aggregated async)");

        Out.Step("Design decisions to say out loud");
        Out.Line("ID: range allocation (no collisions, no per-request coordination). Hash+collision-check also works.");
        Out.Line("302 not 301: browsers cache 301, so you'd lose click counts and the ability to change targets.");
        Out.Line("Read path: CDN/edge -> Redis -> DB. Write path is tiny (~40/s).");

        Out.Lesson("Spend the deep dive on ID generation and the read path.");
    }
}
