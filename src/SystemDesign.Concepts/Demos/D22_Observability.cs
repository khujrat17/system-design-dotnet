using System.Diagnostics;

namespace SystemDesign.Concepts.Demos;

/// <summary>Distributed-tracing style spans with System.Diagnostics.Activity, and why p99 beats averages.</summary>
public sealed class D22_Observability : IDemo
{
    public int Number => 22;
    public string Track => "Reliability";
    public string Title => "Observability: traces and percentiles";

    private static readonly ActivitySource Source = new("ShopKart.Checkout");

    public async Task RunAsync()
    {
        Out.Step("Trace one checkout across 'services' (OpenTelemetry builds on this same Activity API)");
        var spans = new List<Activity>();
        using var listener = new ActivityListener
        {
            ShouldListenTo = s => s.Name == "ShopKart.Checkout",
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
            ActivityStopped = a => spans.Add(a)
        };
        ActivitySource.AddActivityListener(listener);

        using (var root = Source.StartActivity("POST /checkout"))
        {
            await Span("cart-service GetCart", 15);
            await Span("pricing-service Calculate", 20);
            using (Source.StartActivity("inventory-service Reserve"))
            {
                await Span("SQL UPDATE Stock", 340);           // the culprit
            }
            await Span("payment-service Charge", 60);
        }

        var traceRoot = spans.Last();
        Out.Line($"trace id {traceRoot.TraceId}");
        foreach (var s in spans.OrderBy(s => s.StartTimeUtc))
        {
            var depth = 0; var p = s.Parent;
            while (p != null) { depth++; p = p.Parent; }
            var line = $"{new string(' ', depth * 2)}{s.DisplayName,-34} {s.Duration.TotalMilliseconds,6:N0} ms";
            if (s.Duration.TotalMilliseconds > 300 && s.DisplayName.StartsWith("SQL")) Out.Bad(line + "  <- slow span"); else Out.Line(line);
        }

        Out.Step("Percentiles vs average: 1,000 request latencies, 2% hit a slow path");
        var rnd = new Random(2);
        var lat = Enumerable.Range(0, 1000).Select(_ => rnd.NextDouble() < 0.02 ? 1500 + rnd.Next(500) : 40 + rnd.Next(40))
                            .OrderBy(x => x).ToArray();
        double P(double q) => lat[(int)Math.Ceiling(q * lat.Length) - 1];
        Out.Line($"average {lat.Average(),6:N0} ms   p50 {P(0.50),6:N0} ms   p95 {P(0.95),6:N0} ms   p99 {P(0.99),6:N0} ms");
        Out.Bad("The average looks fine. p99 shows 1 in 100 users waiting ~2 seconds.");

        Out.Step("Vocabulary");
        Out.Line("SLI = what you measure (p99 latency) · SLO = target (p99 < 300 ms, 99.9%/month) · SLA = contract");
        Out.Line("RED for services: Rate, Errors, Duration · USE for resources: Utilisation, Saturation, Errors");

        Out.Lesson("Logs say what happened, metrics say how much, traces say where. Alert on p99 and error rate.");
    }

    private static async Task Span(string name, int ms)
    {
        using var a = Source.StartActivity(name);
        await Task.Delay(ms);
    }
}
