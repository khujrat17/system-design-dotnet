using System.Diagnostics;
using System.Text.RegularExpressions;

namespace SystemDesign.Concepts.Demos;

/// <summary>An inverted index (how search engines work) vs LIKE '%term%' scanning.</summary>
public sealed partial class D24_StorageSearch : IDemo
{
    public int Number => 24;
    public string Track => "Reliability";
    public string Title => "Search (inverted index) and blob storage";

    [GeneratedRegex(@"[a-z0-9]+")]
    private static partial Regex Word();

    public sealed class InvertedIndex
    {
        private readonly Dictionary<string, Dictionary<int, int>> _postings = new();  // term -> (docId -> count)

        public void Add(int docId, string text)
        {
            foreach (Match m in Word().Matches(text.ToLowerInvariant()))
            {
                if (!_postings.TryGetValue(m.Value, out var docs)) _postings[m.Value] = docs = new();
                docs[docId] = docs.GetValueOrDefault(docId) + 1;
            }
        }

        // AND query, ranked by total term frequency (real engines use BM25)
        public IEnumerable<(int DocId, int Score)> Search(string query)
        {
            var terms = Word().Matches(query.ToLowerInvariant()).Select(m => m.Value).ToArray();
            if (terms.Length == 0 || terms.Any(t => !_postings.ContainsKey(t))) return [];
            var ids = terms.Select(t => (IEnumerable<int>)_postings[t].Keys).Aggregate((a, b) => a.Intersect(b)).ToList();
            return ids.Select(id => (id, terms.Sum(t => _postings[t][id]))).OrderByDescending(x => x.Item2);
        }
    }

    public Task RunAsync()
    {
        string[] adjectives = ["red", "blue", "wireless", "gaming", "slim", "steel", "smart", "budget"];
        string[] nouns = ["phone", "laptop", "headphones", "watch", "speaker", "mouse", "keyboard", "charger"];
        var rnd = new Random(9);
        var docs = Enumerable.Range(0, 300_000)
            .Select(i => $"{adjectives[rnd.Next(8)]} {adjectives[rnd.Next(8)]} {nouns[rnd.Next(8)]} model {i}")
            .ToArray();

        Out.Step("Build the index once (in production: updated from change events, slightly behind the DB)");
        var sw = Stopwatch.StartNew();
        var index = new InvertedIndex();
        for (var i = 0; i < docs.Length; i++) index.Add(i, docs[i]);
        Out.Line($"Indexed {docs.Length:N0} products in {sw.ElapsedMilliseconds} ms");

        Out.Step("Query: 'wireless gaming headphones'");
        sw.Restart();
        var like = docs.Where(d => d.Contains("wireless") && d.Contains("gaming") && d.Contains("headphones")).Count();
        var likeMs = sw.Elapsed.TotalMilliseconds;
        sw.Restart();
        var hits = index.Search("wireless gaming headphones").ToList();
        Out.Line($"LIKE scan:       {likeMs,8:N2} ms ({like} rows, no ranking)");
        Out.Line($"Inverted index:  {sw.Elapsed.TotalMilliseconds,8:N2} ms ({hits.Count} rows, ranked)");
        Out.Line("Top hit: " + docs[hits[0].DocId]);

        Out.Step("Blob storage pattern for uploads");
        Out.Line("1. Client asks API for an upload URL  -> API returns a 10-minute signed (SAS) URL");
        Out.Line("2. Client PUTs the file straight to blob storage (your servers never carry the bytes)");
        Out.Line("3. Client tells API 'done'; API stores only the blob URL + metadata in SQL");
        Out.Line("4. Reads go through a CDN in front of the blob container");

        Out.Lesson("Files -> blob storage. Text search -> search engine. The database stays the source of truth.");
        return Task.CompletedTask;
    }
}
