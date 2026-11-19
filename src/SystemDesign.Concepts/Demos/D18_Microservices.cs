using System.Diagnostics;

namespace SystemDesign.Concepts.Demos;

/// <summary>The hidden tax of microservices: every in-process call becomes a network call that can fail.</summary>
public sealed class D18_Microservices : IDemo
{
    public int Number => 18;
    public string Track => "Communication";
    public string Title => "Monolith vs microservices";

    public async Task RunAsync()
    {
        const int Hops = 6;          // checkout: cart -> pricing -> inventory -> payment -> orders -> notify
        const int Requests = 2_000;
        var rnd = new Random(11);

        Out.Step($"Modular monolith: {Hops} in-process method calls per checkout");
        var sw = Stopwatch.StartNew();
        for (var i = 0; i < Requests; i++)
            for (var h = 0; h < Hops; h++) _ = InProcess(i);
        Out.Good($"{Requests} checkouts, 100% success, {sw.Elapsed.TotalMilliseconds:N1} ms total");

        Out.Step($"Microservices: {Hops} network hops, each 99% reliable and ~2 ms");
        var ok = 0;
        long simulatedMs = 0;
        for (var i = 0; i < Requests; i++)
        {
            var success = true;
            for (var h = 0; h < Hops; h++)
            {
                simulatedMs += 2 + (rnd.NextDouble() < 0.05 ? 50 : 0);      // occasional slow hop
                if (rnd.NextDouble() < 0.01) { success = false; break; }
            }
            if (success) ok++;
        }
        Out.Bad($"Success rate {ok * 100.0 / Requests:N1}% (0.99^{Hops} = {Math.Pow(0.99, Hops) * 100:N1}%)");
        Out.Bad($"Average latency {simulatedMs / (double)Requests:N1} ms per checkout, before any real work");
        await Task.CompletedTask;

        Out.Step("What you buy with that cost");
        Out.Line("Independent deploys per team, independent scaling, fault isolation, tech freedom.");
        Out.Line("What you must add: timeouts, retries, circuit breakers, tracing, sagas, versioned contracts.");

        Out.Lesson("Start with a modular monolith. Extract a service when a team or scaling need demands it.");
    }

    private static int InProcess(int x) => x * 2;
}
