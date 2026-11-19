using System.Collections.Concurrent;
using System.Threading.Channels;

namespace SystemDesign.Concepts.Demos;

/// <summary>Async primary-replica replication, replication lag, and read-your-own-writes routing.</summary>
public sealed class D09_Replication : IDemo
{
    public int Number => 9;
    public string Track => "Data";
    public string Title => "Replication and replication lag";

    private sealed class Replica
    {
        public readonly ConcurrentDictionary<string, string> Data = new();
    }

    private sealed class Primary(Replica replica, TimeSpan lag)
    {
        public readonly ConcurrentDictionary<string, string> Data = new();
        private readonly Channel<(string K, string V)> _log = Channel.CreateUnbounded<(string, string)>();

        public void StartShipping(CancellationToken ct) => _ = Task.Run(async () =>
        {
            await foreach (var (k, v) in _log.Reader.ReadAllAsync(ct))
            {
                await Task.Delay(lag, ct);           // network + apply delay
                replica.Data[k] = v;
            }
        }, ct);

        public void Write(string k, string v)
        {
            Data[k] = v;                              // commit locally
            _log.Writer.TryWrite((k, v));             // async: don't wait for the replica
        }
    }

    public async Task RunAsync()
    {
        using var cts = new CancellationTokenSource();
        var replica = new Replica();
        var primary = new Primary(replica, TimeSpan.FromMilliseconds(300));
        primary.StartShipping(cts.Token);

        primary.Write("user:1:address", "Old Street 1");
        await Task.Delay(400);

        Out.Step("User updates address, next page reads from the replica immediately");
        primary.Write("user:1:address", "New Road 99");
        Out.Bad($"Replica says: {replica.Data["user:1:address"]}   (primary has New Road 99)");

        Out.Step("Read-your-own-writes: route this user to the primary for a few seconds after a write");
        var lastWrite = new Dictionary<string, DateTime> { ["user:1"] = DateTime.UtcNow };
        string Read(string user, string key) =>
            lastWrite.TryGetValue(user, out var t) && DateTime.UtcNow - t < TimeSpan.FromSeconds(5)
                ? primary.Data[key] + "  (from primary)"
                : replica.Data[key] + "  (from replica)";
        Out.Good(Read("user:1", "user:1:address"));
        Out.Line("Other users still read from the replica: " + Read("user:2", "user:1:address"));

        await Task.Delay(400);
        Out.Step("After the lag passes");
        Out.Good($"Replica caught up: {replica.Data["user:1:address"]}");

        cts.Cancel();
        Out.Lesson("Replicas scale reads, not writes. Async replication means lag; design for it.");
    }
}
