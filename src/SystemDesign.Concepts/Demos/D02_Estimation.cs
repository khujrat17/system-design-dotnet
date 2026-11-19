namespace SystemDesign.Concepts.Demos;

/// <summary>Back-of-the-envelope calculator. Change the inputs and re-run.</summary>
public sealed class D02_Estimation : IDemo
{
    public int Number => 2;
    public string Track => "Foundations";
    public string Title => "Back-of-the-envelope estimation";

    private sealed record Scenario(string Name, long DailyUsers, int ReadsPerUser, int WritesPerUser,
                                   int BytesPerWrite, int RetentionYears, double PeakFactor);

    public Task RunAsync()
    {
        Scenario[] scenarios =
        [
            new("Small SaaS",          50_000,  30,  3, 2_000, 3, 3),
            new("E-commerce",       5_000_000,  20,  1, 1_000, 5, 5),
            new("Social feed",    100_000_000,  50,  2,   500, 5, 3)
        ];

        foreach (var s in scenarios)
        {
            Out.Step(s.Name);
            const double SecondsPerDay = 86_400;
            var readQps = s.DailyUsers * (double)s.ReadsPerUser / SecondsPerDay;
            var writeQps = s.DailyUsers * (double)s.WritesPerUser / SecondsPerDay;
            var storageTb = s.DailyUsers * (double)s.WritesPerUser * s.BytesPerWrite * 365 * s.RetentionYears / 1e12;

            Out.Line($"Read QPS  avg {readQps,10:N0}   peak {readQps * s.PeakFactor,10:N0}");
            Out.Line($"Write QPS avg {writeQps,10:N0}   peak {writeQps * s.PeakFactor,10:N0}");
            Out.Line($"Storage over {s.RetentionYears} years: {storageTb:N2} TB");
            Out.Line(Verdict(readQps * s.PeakFactor, writeQps * s.PeakFactor, storageTb));
        }

        Out.Step("Latency ladder (approximate, memorise the order of magnitude)");
        (string, string)[] ladder =
        [
            ("Memory read", "~100 ns"), ("SSD random read", "~100 us"),
            ("Same-datacenter round trip", "~0.5 ms"), ("Disk seek", "~10 ms"),
            ("Cross-continent round trip", "~150 ms")
        ];
        foreach (var (what, t) in ladder) Out.Line($"{what,-30} {t}");

        Out.Lesson("1 day ~ 10^5 seconds. 1M requests/day ~ 12 QPS. The numbers pick the architecture.");
        return Task.CompletedTask;
    }

    private static string Verdict(double peakRead, double peakWrite, double tb) =>
        (peakRead, peakWrite, tb) switch
        {
            (< 500, < 100, < 1) => "Verdict: one app server + one database. Don't over-engineer.",
            (_, < 2_000, < 10) => "Verdict: several app instances, cache, read replicas. Single primary DB is fine.",
            _ => "Verdict: caching everywhere, queues, and you will need to partition/shard data."
        };
}
