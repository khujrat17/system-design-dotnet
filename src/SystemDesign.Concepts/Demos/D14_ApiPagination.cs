namespace SystemDesign.Concepts.Demos;

/// <summary>Offset vs cursor (keyset) pagination: cost on deep pages and correctness when data changes.</summary>
public sealed class D14_ApiPagination : IDemo
{
    public int Number => 14;
    public string Track => "Communication";
    public string Title => "API design: offset vs cursor pagination";

    private sealed record Item(long Id, string Name);

    public Task RunAsync()
    {
        var items = Enumerable.Range(1, 1_000_000).Select(i => new Item(i, $"item {i}")).ToList();

        Out.Step("Cost of page 50,000 (page size 20)");
        var (_, scannedOffset) = OffsetPage(items, page: 50_000, size: 20);
        var (_, scannedCursor) = CursorPage(items, after: 999_980, size: 20);
        Out.Bad($"OFFSET: database reads and discards {scannedOffset:N0} rows");
        Out.Good($"CURSOR: seeks via index straight to the cursor, reads {scannedCursor} rows");

        Out.Step("Correctness: a new item is inserted at the top while the user is on page 1");
        var feed = Enumerable.Range(1, 10).Select(i => new Item(i, $"post {i}")).OrderByDescending(x => x.Id).ToList();
        var p1 = feed.Take(5).ToList();
        feed.Insert(0, new Item(11, "post 11 (new)"));
        var p2Offset = feed.Skip(5).Take(5).ToList();
        var p2Cursor = feed.Where(x => x.Id < p1[^1].Id).Take(5).ToList();
        Out.Line("Page 1:            " + string.Join(", ", p1.Select(x => x.Id)));
        Out.Bad("Page 2 by offset:  " + string.Join(", ", p2Offset.Select(x => x.Id)) + "   <- post 6 shown twice");
        Out.Good("Page 2 by cursor:  " + string.Join(", ", p2Cursor.Select(x => x.Id)));

        Out.Step("API shape to copy");
        Out.Line("GET /orders?limit=20&after=12345   ->  { items: [...], next: 12325 }");
        Out.Line("POST /payments  + Idempotency-Key header (see demo 21)");

        Out.Lesson("Use cursor pagination for large or changing lists. Design the API before the boxes.");
        return Task.CompletedTask;
    }

    private static (List<Item>, int Scanned) OffsetPage(List<Item> all, int page, int size)
    {
        var skip = (page - 1) * size;
        return (all.Skip(skip).Take(size).ToList(), skip + size);
    }

    private static (List<Item>, int Scanned) CursorPage(List<Item> all, long after, int size)
    {
        var start = all.BinarySearch(new Item(after + 1, ""), Comparer<Item>.Create((x, y) => x.Id.CompareTo(y.Id)));
        if (start < 0) start = ~start;
        return (all.Skip(start).Take(size).ToList(), size);   // Skip on List<T> is O(1) indexing in .NET
    }
}
