using SystemDesign.Concepts;

namespace SystemDesign.Tests;

/// <summary>Every concept demo must run to the end and teach something.</summary>
public class DemoTests
{
    public static TheoryData<int> DemoNumbers()
    {
        var data = new TheoryData<int>();
        foreach (var d in AllDemos()) data.Add(d.Number);
        return data;
    }

    private static List<IDemo> AllDemos() => typeof(IDemo).Assembly.GetTypes()
        .Where(t => typeof(IDemo).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false })
        .Select(t => (IDemo)Activator.CreateInstance(t)!)
        .OrderBy(d => d.Number)
        .ToList();

    [Fact]
    public void There_are_26_demos_numbered_1_to_26_with_unique_numbers()
    {
        var numbers = AllDemos().Select(d => d.Number).ToList();
        Assert.Equal(Enumerable.Range(1, 26), numbers);
    }

    [Fact]
    public void Every_demo_has_a_title_and_track()
    {
        Assert.All(AllDemos(), d =>
        {
            Assert.False(string.IsNullOrWhiteSpace(d.Title));
            Assert.False(string.IsNullOrWhiteSpace(d.Track));
        });
    }

    [Theory]
    [MemberData(nameof(DemoNumbers))]
    public async Task Demo_runs_without_crashing_and_ends_with_a_lesson(int number)
    {
        var demo = AllDemos().Single(d => d.Number == number);

        var entries = await Out.CaptureAsync(demo.RunAsync);

        Assert.DoesNotContain(entries, e => e.Text.StartsWith("Demo crashed", StringComparison.Ordinal));
        Assert.Contains(entries, e => e.Kind == "step");
        Assert.Equal("lesson", entries.Last().Kind);
    }
}
