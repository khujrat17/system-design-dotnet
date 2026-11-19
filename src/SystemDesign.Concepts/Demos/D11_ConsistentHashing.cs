using System.Security.Cryptography;
using System.Text;

namespace SystemDesign.Concepts.Demos;

/// <summary>Modulo hashing vs a consistent hash ring with virtual nodes: how many keys move?</summary>
public sealed class D11_ConsistentHashing : IDemo
{
    public int Number => 11;
    public string Track => "Data";
    public string Title => "Consistent hashing";

    public sealed class HashRing(int virtualNodes)
    {
        private readonly SortedDictionary<uint, string> _ring = new();
        private uint[] _keys = [];

        public void Add(string node)
        {
            for (var i = 0; i < virtualNodes; i++) _ring[Hash($"{node}#{i}")] = node;
            _keys = _ring.Keys.ToArray();
        }

        public void Remove(string node)
        {
            for (var i = 0; i < virtualNodes; i++) _ring.Remove(Hash($"{node}#{i}"));
            _keys = _ring.Keys.ToArray();
        }

        public string Get(string key)
        {
            var h = Hash(key);
            var idx = Array.BinarySearch(_keys, h);
            if (idx < 0) idx = ~idx;                       // first point clockwise
            if (idx == _keys.Length) idx = 0;              // wrap around the ring
            return _ring[_keys[idx]];
        }
    }

    public static uint Hash(string s) => BitConverter.ToUInt32(MD5.HashData(Encoding.UTF8.GetBytes(s)), 0);

    public Task RunAsync()
    {
        var keys = Enumerable.Range(0, 100_000).Select(i => $"user:{i}").ToArray();

        Out.Step("Modulo: hash(key) % N, going from 4 to 5 servers");
        var moved = keys.Count(k => Hash(k) % 4 != Hash(k) % 5);
        Out.Bad($"{moved * 100.0 / keys.Length:N1}% of keys move");

        Out.Step("Consistent hash ring (150 virtual nodes each), adding server-5");
        var ring = new HashRing(150);
        foreach (var n in new[] { "server-1", "server-2", "server-3", "server-4" }) ring.Add(n);
        var before = keys.ToDictionary(k => k, ring.Get);
        ring.Add("server-5");
        var movedRing = keys.Count(k => ring.Get(k) != before[k]);
        Out.Good($"{movedRing * 100.0 / keys.Length:N1}% of keys move (ideal is 1/5 = 20%)");

        Out.Step("Load spread across servers");
        foreach (var g in keys.GroupBy(ring.Get).OrderBy(g => g.Key))
            Out.Line($"{g.Key}: {g.Count(),6:N0}");

        Out.Step("Same ring with only 1 virtual node each");
        var thin = new HashRing(1);
        foreach (var n in new[] { "server-1", "server-2", "server-3", "server-4", "server-5" }) thin.Add(n);
        foreach (var g in keys.GroupBy(thin.Get).OrderBy(g => g.Key))
            Out.Line($"{g.Key}: {g.Count(),6:N0}");
        Out.Bad("Without virtual nodes the spread is lumpy.");

        Out.Lesson("Consistent hashing moves ~1/N of keys on change. Virtual nodes even out the load.");
        return Task.CompletedTask;
    }
}
