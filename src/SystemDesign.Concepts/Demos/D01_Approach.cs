namespace SystemDesign.Concepts.Demos;

/// <summary>The 8-step loop, applied to a tiny example so you can copy the template.</summary>
public sealed class D01_Approach : IDemo
{
    public int Number => 1;
    public string Track => "Foundations";
    public string Title => "How to approach any design";

    private static readonly (string Step, string Example)[] Steps =
    [
        ("Functional requirements", "Create short link, redirect, show click count"),
        ("Non-functional requirements", "Read-heavy (100:1), p99 redirect < 50 ms, 99.9% available, stale counts OK"),
        ("Estimate", "40 writes/s, 4,000 reads/s, ~3 TB over 5 years"),
        ("API", "POST /links {url} -> {code};  GET /{code} -> 302"),
        ("Data model", "Link(Code PK, LongUrl, CreatedAt, ExpiresAt)"),
        ("High-level diagram", "Client -> CDN -> LB -> API -> Redis -> DB;  clicks -> queue -> analytics"),
        ("Deep dive", "ID generation: base62 of range-allocated counter"),
        ("Bottlenecks & failures", "Hot links -> cache; DB down -> serve from cache; analytics lag is fine")
    ];

    public Task RunAsync()
    {
        Out.Line("Use this template for every design. Example: URL shortener.");
        for (var i = 0; i < Steps.Length; i++)
        {
            Out.Step($"{i + 1}. {Steps[i].Step}");
            Out.Line(Steps[i].Example);
        }
        Out.Lesson("Never draw boxes (step 6) before you know the numbers (steps 2-3).");
        return Task.CompletedTask;
    }
}
