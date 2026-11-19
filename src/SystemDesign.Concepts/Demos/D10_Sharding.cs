namespace SystemDesign.Concepts.Demos;

/// <summary>Shard key choice decides whether load spreads evenly or piles onto one hot shard.</summary>
public sealed class D10_Sharding : IDemo
{
    public int Number => 10;
    public string Track => "Data";
    public string Title => "Sharding and choosing a shard key";

    private sealed record Order(int CustomerId, DateOnly Date);

    public Task RunAsync()
    {
        const int Shards = 4;
        var rnd = new Random(3);
        var today = new DateOnly(2026, 11, 18);
        // Today's flash sale: 10,000 new orders from 50,000 different customers
        var newOrders = Enumerable.Range(0, 10_000)
            .Select(_ => new Order(rnd.Next(1, 50_000), today)).ToList();

        Out.Step("Hash shard key = CustomerId");
        Print(newOrders.GroupBy(o => StableHash(o.CustomerId) % (uint)Shards));

        Out.Step("Range shard key = order date (one shard per year 2023-2026)");
        Print(newOrders.GroupBy(o => (uint)Math.Clamp(o.Date.Year - 2023, 0, Shards - 1)));
        Out.Bad("Every new order lands on the newest shard. Three shards idle, one on fire.");

        Out.Step("The query cost of your choice");
        Out.Good("\"Orders for customer 123\" with CustomerId key -> 1 shard");
        Out.Bad("\"All orders yesterday\" with CustomerId key -> scatter to all shards, then gather");

        Out.Lesson("Pick a shard key that spreads writes evenly and keeps one request on one shard.");
        return Task.CompletedTask;
    }

    // string.GetHashCode/int hashing can vary; use a stable hash for routing.
    public static uint StableHash(int value)
    {
        unchecked
        {
            var x = (uint)value;
            x ^= x >> 16; x *= 0x7feb352d; x ^= x >> 15; x *= 0x846ca68b; x ^= x >> 16;
            return x;
        }
    }

    private static void Print(IEnumerable<IGrouping<uint, Order>> groups)
    {
        var counts = groups.ToDictionary(g => g.Key, g => g.Count());
        for (uint s = 0; s < 4; s++)
        {
            var c = counts.GetValueOrDefault(s);
            Out.Line($"shard-{s}: {c,6:N0} writes  {new string('#', c / 250)}");
        }
    }
}
