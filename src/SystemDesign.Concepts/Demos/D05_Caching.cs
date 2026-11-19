using System.Collections.Concurrent;

namespace SystemDesign.Concepts.Demos;

/// <summary>An LRU cache with TTL, cache-aside, and cache stampede protection (single-flight).</summary>
public sealed class D05_Caching : IDemo
{
    public int Number => 5;
    public string Track => "Foundations";
    public string Title => "Caching: LRU, TTL, cache-aside, stampede";

    /// <summary>Least-recently-used cache with per-entry expiry. Not thread-safe; for learning.</summary>
    public sealed class LruCache<TKey, TValue>(int capacity) where TKey : notnull
    {
        private sealed record Entry(TKey Key, TValue Value, DateTime ExpiresAt);
        private readonly Dictionary<TKey, LinkedListNode<Entry>> _map = new();
        private readonly LinkedList<Entry> _order = new();   // front = most recently used
        public int Evictions { get; private set; }

        public bool TryGet(TKey key, out TValue value)
        {
            value = default!;
            if (!_map.TryGetValue(key, out var node)) return false;
            if (node.Value.ExpiresAt < DateTime.UtcNow) { Remove(key); return false; }
            _order.Remove(node); _order.AddFirst(node);       // touch
            value = node.Value.Value;
            return true;
        }

        public void Set(TKey key, TValue value, TimeSpan ttl)
        {
            Remove(key);
            if (_map.Count >= capacity)
            {
                var lru = _order.Last!;
                _order.RemoveLast(); _map.Remove(lru.Value.Key); Evictions++;
            }
            _map[key] = _order.AddFirst(new Entry(key, value, DateTime.UtcNow + ttl));
        }

        public void Remove(TKey key)
        {
            if (_map.Remove(key, out var node)) _order.Remove(node);
        }
    }

    private sealed class FakeDb
    {
        public int Calls;
        public async Task<string> GetProduct(int id)
        {
            Interlocked.Increment(ref Calls);
            await Task.Delay(20);                 // a "slow" query
            return $"Product {id}";
        }
    }

    public async Task RunAsync()
    {
        Out.Step("Cache-aside: 1,000 product page views, 80% of traffic on 20 popular products");
        var db = new FakeDb();
        var cache = new LruCache<int, string>(capacity: 50);
        var rnd = new Random(1);
        var hits = 0;
        for (var i = 0; i < 1_000; i++)
        {
            var id = rnd.NextDouble() < 0.8 ? rnd.Next(1, 21) : rnd.Next(21, 500);
            if (cache.TryGet(id, out _)) { hits++; continue; }
            var p = await db.GetProduct(id);                      // miss -> DB
            cache.Set(id, p, TimeSpan.FromMinutes(10));           // populate
        }
        Out.Line($"Cache hits: {hits}/1000   DB calls: {db.Calls}   LRU evictions: {cache.Evictions}");

        Out.Step("Invalidation: product 7 is updated, so delete its key");
        cache.Remove(7);
        Out.Line($"Key 7 present after update? {cache.TryGet(7, out _)} (next read refetches fresh data)");

        Out.Step("Stampede: hot key expires, 200 concurrent requests arrive");
        var naiveDb = new FakeDb();
        await Task.WhenAll(Enumerable.Range(0, 200).Select(_ => naiveDb.GetProduct(1)));
        Out.Bad($"Naive cache-aside: {naiveDb.Calls} DB calls for the same key");

        var guardedDb = new FakeDb();
        var inflight = new ConcurrentDictionary<int, Lazy<Task<string>>>();
        Task<string> SingleFlight(int id) =>
            inflight.GetOrAdd(id, k => new Lazy<Task<string>>(() => guardedDb.GetProduct(k))).Value;
        await Task.WhenAll(Enumerable.Range(0, 200).Select(_ => SingleFlight(1)));
        Out.Good($"Single-flight: {guardedDb.Calls} DB call; everyone awaited the same task");

        Out.Lesson("Say what you cache, the TTL, and how you invalidate. HybridCache in .NET 9+ does single-flight for you.");
    }
}
