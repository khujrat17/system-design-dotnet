namespace SystemDesign.Concepts.Demos;

/// <summary>Why real-time push across many servers needs a backplane (what SignalR + Redis does).</summary>
public sealed class D16_Realtime : IDemo
{
    public int Number => 16;
    public string Track => "Communication";
    public string Title => "Real-time push and the backplane";

    private sealed class Backplane
    {
        public event Action<string, string>? Message;            // (group, payload)
        public void Publish(string group, string payload) => Message?.Invoke(group, payload);
    }

    private sealed class HubServer
    {
        public string Name { get; }
        private readonly Dictionary<string, List<string>> _groups = new();   // group -> connected users
        private readonly Backplane? _bp;

        public HubServer(string name, Backplane? bp)
        {
            Name = name; _bp = bp;
            if (bp != null) bp.Message += DeliverLocal;
        }

        public void Join(string group, string user)
        {
            if (!_groups.TryGetValue(group, out var g)) _groups[group] = g = new List<string>();
            g.Add(user);
        }

        public void Send(string group, string payload)
        {
            if (_bp != null) _bp.Publish(group, payload);          // fan out to every server
            else DeliverLocal(group, payload);                     // only connections on THIS server
        }

        private void DeliverLocal(string group, string payload)
        {
            if (_groups.TryGetValue(group, out var users))
                foreach (var u in users) Out.Good($"{Name} pushed to {u}: {payload}");
        }
    }

    public Task RunAsync()
    {
        foreach (var useBackplane in new[] { false, true })
        {
            Out.Step(useBackplane ? "With a Redis-style backplane" : "No backplane, 3 servers");
            var bp = useBackplane ? new Backplane() : null;
            var servers = Enumerable.Range(1, 3).Select(i => new HubServer($"server-{i}", bp)).ToArray();
            servers[2].Join("order-77", "customer's phone");       // phone connected to server-3
            Out.Line("Courier webhook lands on server-1 and sends 'Out for delivery'...");
            servers[0].Send("order-77", "Out for delivery");
            if (!useBackplane) Out.Bad("Nobody received it: the connection lives on server-3.");
        }

        Out.Step("Options");
        Out.Line("Short polling < long polling < Server-Sent Events < WebSockets (two-way)");
        Out.Line("SignalR negotiates the best one; scale out with Redis backplane or Azure SignalR Service.");

        Out.Lesson("Persistent connections are state. Any server must be able to reach any connection.");
        return Task.CompletedTask;
    }
}
