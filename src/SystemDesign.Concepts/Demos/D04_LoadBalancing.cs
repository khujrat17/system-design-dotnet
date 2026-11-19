namespace SystemDesign.Concepts.Demos;

/// <summary>Round robin vs least connections, plus health checks removing a dead server.</summary>
public sealed class D04_LoadBalancing : IDemo
{
    public int Number => 4;
    public string Track => "Foundations";
    public string Title => "Load balancing";

    private sealed class Server(string name)
    {
        public string Name => name;
        public bool Healthy { get; set; } = true;
        public int Active;              // in-flight requests
        public int Handled;
        public int MaxActiveSeen;
    }

    public Task RunAsync()
    {
        // Every 3rd request is a slow report export: the worst case for round robin.
        var workload = Enumerable.Range(0, 60).Select(i => i % 3 == 0 ? 9 : 1).ToArray();

        Out.Step("Round robin with mixed request durations");
        Report(Simulate(workload, RoundRobin()));

        Out.Step("Least connections with the same workload");
        Report(Simulate(workload, LeastConnections));

        Out.Step("Health checks: server-2 fails its /health/ready probe");
        var servers = MakeServers();
        servers[1].Healthy = false;
        var rr = RoundRobin();
        for (var i = 0; i < 9; i++)
        {
            var s = rr(servers.Where(x => x.Healthy).ToArray());
            s.Handled++;
        }
        foreach (var s in servers) Out.Line($"{s.Name}: healthy={s.Healthy,-5} handled={s.Handled}");

        Out.Lesson("Least connections beats round robin when request cost varies. Health checks make LBs useful.");
        return Task.CompletedTask;
    }

    private static Server[] MakeServers() => Enumerable.Range(1, 3).Select(i => new Server($"server-{i}")).ToArray();

    private static Func<Server[], Server> RoundRobin()
    {
        var i = 0;
        return servers => servers[i++ % servers.Length];
    }

    private static Server LeastConnections(Server[] servers) => servers.MinBy(s => s.Active)!;

    // Discrete time simulation: one request arrives per tick, each takes 'duration' ticks.
    private static Server[] Simulate(int[] durations, Func<Server[], Server> pick)
    {
        var servers = MakeServers();
        var running = new List<(Server S, int EndsAt)>();
        for (var tick = 0; tick < durations.Length; tick++)
        {
            foreach (var done in running.Where(r => r.EndsAt <= tick).ToList())
            {
                done.S.Active--;
                running.Remove(done);
            }
            var s = pick(servers);
            s.Active++; s.Handled++;
            s.MaxActiveSeen = Math.Max(s.MaxActiveSeen, s.Active);
            running.Add((s, tick + durations[tick]));
        }
        return servers;
    }

    private static void Report(Server[] servers)
    {
        foreach (var s in servers) Out.Line($"{s.Name}: handled={s.Handled,3}  peak concurrent={s.MaxActiveSeen}");
    }
}
