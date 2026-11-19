using System.Diagnostics;

namespace SystemDesign.Concepts.Demos;

/// <summary>Full scan vs hash index vs sorted (B-tree-like) index, and the write cost of indexes.</summary>
public sealed class D08_Indexing : IDemo
{
    public int Number => 8;
    public string Track => "Data";
    public string Title => "Indexing";

    private readonly record struct Row(int Id, int CustomerId, int Day, decimal Total);

    public Task RunAsync()
    {
        const int N = 2_000_000;
        var rnd = new Random(7);
        var table = new Row[N];
        for (var i = 0; i < N; i++) table[i] = new Row(i, rnd.Next(1, 200_000), rnd.Next(0, 3650), rnd.Next(100, 50_000));

        Out.Step($"Find orders for customer 4242 among {N:N0} rows");
        var sw = Stopwatch.StartNew();
        var scan = table.Where(r => r.CustomerId == 4242).ToList();
        Out.Line($"Full table scan:     {sw.Elapsed.TotalMilliseconds,8:N2} ms  ({scan.Count} rows)");

        sw.Restart();
        var byCustomer = table.ToLookup(r => r.CustomerId);       // "CREATE INDEX IX_Customer"
        var build = sw.Elapsed.TotalMilliseconds;
        sw.Restart();
        var viaIndex = byCustomer[4242].ToList();
        Out.Line($"Hash index lookup:   {sw.Elapsed.TotalMilliseconds,8:N4} ms  (index build took {build:N0} ms)");

        Out.Step("Range query: orders between day 100 and day 105");
        var sortedDays = table.Select(r => r.Day).ToArray();
        var ids = table.Select(r => r.Id).ToArray();
        Array.Sort(sortedDays, ids);                              // a sorted index, like a B-tree leaf level
        sw.Restart();
        var start = LowerBound(sortedDays, 100);
        var end = LowerBound(sortedDays, 106);
        Out.Line($"Sorted index seek:   {sw.Elapsed.TotalMilliseconds,8:N4} ms  ({end - start:N0} rows)");
        Out.Line("A hash index can't do ranges. A sorted (B-tree) index can. That's why SQL uses B-trees.");

        Out.Step("Write cost: insert 200,000 rows maintaining 0 vs 3 indexes");
        sw.Restart();
        var plain = new List<Row>();
        for (var i = 0; i < 200_000; i++) plain.Add(table[i]);
        var t0 = sw.Elapsed.TotalMilliseconds;
        sw.Restart();
        var heap = new List<Row>();
        var ix1 = new Dictionary<int, List<int>>();
        var ix2 = new SortedDictionary<int, List<int>>();
        var ix3 = new SortedDictionary<decimal, List<int>>();
        for (var i = 0; i < 200_000; i++)
        {
            var r = table[i];
            heap.Add(r);
            Add(ix1, r.CustomerId, r.Id); Add(ix2, r.Day, r.Id); Add(ix3, r.Total, r.Id);
        }
        Out.Line($"0 indexes: {t0,7:N1} ms    3 indexes: {sw.Elapsed.TotalMilliseconds,7:N1} ms");

        Out.Lesson("Index the columns you filter and sort on. Every extra index taxes every write.");
        return Task.CompletedTask;
    }

    private static int LowerBound(int[] a, int value)
    {
        int lo = 0, hi = a.Length;
        while (lo < hi) { var mid = (lo + hi) / 2; if (a[mid] < value) lo = mid + 1; else hi = mid; }
        return lo;
    }

    private static void Add<TKey>(IDictionary<TKey, List<int>> ix, TKey key, int id)
    {
        if (!ix.TryGetValue(key, out var list)) ix[key] = list = new List<int>();
        list.Add(id);
    }
}
