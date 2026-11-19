namespace SystemDesign.Concepts.Demos;

/// <summary>Edge caches near users vs one far-away origin; why versioned file names beat purging.</summary>
public sealed class D06_Cdn : IDemo
{
    public int Number => 6;
    public string Track => "Foundations";
    public string Title => "CDN and edge caching";

    private const int OriginLatencyMs = 220;     // user far from the origin data centre
    private const int EdgeLatencyMs = 15;        // user near an edge

    private sealed class Edge(string region)
    {
        public string Region => region;
        public readonly Dictionary<string, string> Cache = new();
    }

    public Task RunAsync()
    {
        var origin = new Dictionary<string, string> { ["/img/phone.jpg"] = "phone-v1-bytes" };
        var edges = new[] { new Edge("Mumbai"), new Edge("Frankfurt"), new Edge("Virginia") };

        Out.Step("Pull CDN: first request per edge misses, then hits");
        foreach (var region in new[] { "Mumbai", "Mumbai", "Mumbai", "Frankfurt", "Frankfurt" })
        {
            var edge = edges.First(e => e.Region == region);
            var (latency, source) = Fetch(edge, origin, "/img/phone.jpg");
            Out.Line($"{region,-10} {source,-12} {latency,4} ms");
        }

        Out.Step("Deploy a new image under the SAME name, without purging");
        origin["/img/phone.jpg"] = "phone-v2-bytes";
        var (_, src) = Fetch(edges[0], origin, "/img/phone.jpg");
        Out.Bad($"Mumbai still serves {edges[0].Cache["/img/phone.jpg"]} from {src} (stale until TTL/purge)");

        Out.Step("Deploy with a versioned name (what asp-append-version does)");
        origin["/img/phone.9f3c.jpg"] = "phone-v2-bytes";
        var (lat, src2) = Fetch(edges[0], origin, "/img/phone.9f3c.jpg");
        Out.Good($"New URL is a guaranteed miss -> fresh content ({src2}, {lat} ms), then cached for a year");

        Out.Lesson("Use long cache lifetimes + content-hashed file names. Purging is slow and uneven.");
        return Task.CompletedTask;
    }

    private static (int LatencyMs, string Source) Fetch(Edge edge, Dictionary<string, string> origin, string path)
    {
        if (edge.Cache.ContainsKey(path)) return (EdgeLatencyMs, "edge HIT");
        edge.Cache[path] = origin[path];
        return (EdgeLatencyMs + OriginLatencyMs, "edge MISS");
    }
}
