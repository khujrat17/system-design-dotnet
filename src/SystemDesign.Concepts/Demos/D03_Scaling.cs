namespace SystemDesign.Concepts.Demos;

/// <summary>Why horizontal scaling needs stateless servers.</summary>
public sealed class D03_Scaling : IDemo
{
    public int Number => 3;
    public string Track => "Foundations";
    public string Title => "Vertical vs horizontal scaling (stateless servers)";

    private interface ISessionStore
    {
        void Set(string sid, string user);
        string? Get(string sid);
    }

    private sealed class InMemorySessions : ISessionStore      // like AddSession() with no distributed cache
    {
        private readonly Dictionary<string, string> _d = new();
        public void Set(string sid, string user) => _d[sid] = user;
        public string? Get(string sid) => _d.GetValueOrDefault(sid);
    }

    private sealed class SharedSessions : ISessionStore         // stands in for Redis
    {
        private readonly Dictionary<string, string> _d = new();
        public void Set(string sid, string user) => _d[sid] = user;
        public string? Get(string sid) => _d.GetValueOrDefault(sid);
    }

    private sealed class AppInstance(string name, ISessionStore store)
    {
        public string Name => name;
        public void Login(string sid, string user) => store.Set(sid, user);
        public string Request(string sid) => store.Get(sid) is { } u ? $"{name}: hello {u}" : $"{name}: 401 please log in";
    }

    public Task RunAsync()
    {
        Out.Step("Three instances, each keeping sessions in its own memory");
        var stateful = Enumerable.Range(1, 3).Select(i => new AppInstance($"app-{i}", new InMemorySessions())).ToArray();
        Simulate(stateful);

        Out.Step("Three instances sharing one session store (Redis in real life)");
        var shared = new SharedSessions();
        var stateless = Enumerable.Range(1, 3).Select(i => new AppInstance($"app-{i}", shared)).ToArray();
        Simulate(stateless);

        Out.Lesson("Move state out of the process (session, files, Data Protection keys) before adding instances.");
        return Task.CompletedTask;
    }

    private static void Simulate(AppInstance[] instances)
    {
        var rr = 0;
        AppInstance Next() => instances[rr++ % instances.Length];   // round-robin load balancer
        Next().Login("sid-42", "priya");
        for (var i = 0; i < 4; i++)
        {
            var r = Next().Request("sid-42");
            if (r.Contains("401")) Out.Bad(r); else Out.Good(r);
        }
    }
}
