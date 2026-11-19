namespace SystemDesign.Concepts.Demos;

/// <summary>Case study: news feed. Fan-out on write vs on read, and the hybrid that handles celebrities.</summary>
public sealed class D26_NewsFeed : IDemo
{
    public int Number => 26;
    public string Track => "Case studies";
    public string Title => "Case study: news feed (fan-out)";

    private const int CelebrityThreshold = 10_000;

    public Task RunAsync()
    {
        // Followers: most users have ~100 followers, one celebrity has 2 million.
        var followerCount = new Dictionary<string, int> { ["celebrity"] = 2_000_000 };
        for (var i = 0; i < 1_000; i++) followerCount[$"user{i}"] = 50 + i % 150;

        // A minute of posting: 1,000 normal posts and 3 celebrity posts
        var posts = Enumerable.Range(0, 1_000).Select(i => $"user{i}")
                              .Concat(new[] { "celebrity", "celebrity", "celebrity" }).ToList();

        Out.Step("Fan-out on WRITE for everyone (push post id into every follower's feed list)");
        long pushWrites = posts.Sum(a => (long)followerCount[a]);
        Out.Bad($"{pushWrites:N0} feed writes this minute; {3 * 2_000_000:N0} of them from 3 celebrity posts");

        Out.Step("Fan-out on READ for everyone (merge followees' recent posts when the feed opens)");
        const int FolloweesPerUser = 300;
        Out.Bad($"Every feed open queries {FolloweesPerUser} accounts and merges them. Slow, repeated work for every reader.");

        Out.Step("Hybrid: push for normal accounts, pull for celebrities");
        long hybridWrites = posts.Where(a => followerCount[a] < CelebrityThreshold).Sum(a => (long)followerCount[a]);
        Out.Good($"{hybridWrites:N0} feed writes; celebrity posts are merged in at read time");

        Out.Step("Reading a feed with the hybrid");
        var precomputed = new List<(DateTime At, string Post)>
        {
            (DateTime.UtcNow.AddMinutes(-3), "user12: new laptop!"),
            (DateTime.UtcNow.AddMinutes(-9), "user7: weekend trek photos")
        };
        var celebrityRecent = new List<(DateTime At, string Post)>
        {
            (DateTime.UtcNow.AddMinutes(-5), "celebrity: new song out")
        };
        foreach (var p in precomputed.Concat(celebrityRecent).OrderByDescending(p => p.At))
            Out.Line($"{(DateTime.UtcNow - p.At).TotalMinutes:N0}m ago  {p.Post}");

        Out.Step("Other pieces");
        Out.Line("Feeds store post IDs only (Redis lists, trimmed to ~800). Post bodies are cached separately.");
        Out.Line("Fan-out runs in queue workers so 'Post' returns instantly. Skip inactive followers.");
        Out.Line("Cursor pagination for scrolling. Media in blob storage behind a CDN.");

        Out.Lesson("Raise the celebrity problem yourself; the hybrid answer is what interviewers look for.");
        return Task.CompletedTask;
    }
}
