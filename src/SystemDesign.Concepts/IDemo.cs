namespace SystemDesign.Concepts;

/// <summary>One runnable, self-contained demo per system design concept.</summary>
public interface IDemo
{
    int Number { get; }
    string Track { get; }
    string Title { get; }
    Task RunAsync();
}

/// <summary>One line of demo output, used when a UI (e.g. SystemDesign.Web) captures the demo instead of the console.</summary>
public sealed record OutEntry(string Kind, string Text, double ElapsedMs);

/// <summary>Console helpers so every demo prints in the same style.</summary>
public static class Out
{
    private static readonly AsyncLocal<Capture?> Current = new();

    private sealed class Capture
    {
        public readonly List<OutEntry> Entries = new();
        public readonly System.Diagnostics.Stopwatch Clock = System.Diagnostics.Stopwatch.StartNew();
    }

    /// <summary>Runs <paramref name="run"/> and returns everything it printed through <see cref="Out"/>, instead of writing to the console.</summary>
    public static async Task<List<OutEntry>> CaptureAsync(Func<Task> run)
    {
        var capture = new Capture();
        Current.Value = capture;
        try { await run(); }
        catch (Exception ex) { capture.Entries.Add(new OutEntry("bad", $"Demo crashed: {ex.Message}", capture.Clock.Elapsed.TotalMilliseconds)); }
        finally { Current.Value = null; }
        lock (capture.Entries) return capture.Entries.ToList();
    }

    private static bool Captured(string kind, string text)
    {
        var c = Current.Value;
        if (c is null) return false;
        lock (c.Entries) c.Entries.Add(new OutEntry(kind, text, c.Clock.Elapsed.TotalMilliseconds));
        return true;
    }

    public static void Title(string t)
    {
        if (Captured("title", t)) return;
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine(new string('=', Math.Min(78, t.Length + 4)));
        Console.WriteLine($"  {t}");
        Console.WriteLine(new string('=', Math.Min(78, t.Length + 4)));
        Console.ResetColor();
    }

    public static void Step(string s)
    {
        if (Captured("step", s)) return;
        Console.WriteLine();
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine($"> {s}");
        Console.ResetColor();
    }

    public static void Line(string s = "")
    {
        if (Captured("line", s)) return;
        Console.WriteLine($"  {s}");
    }

    public static void Good(string s)
    {
        if (Captured("good", s)) return;
        Color(ConsoleColor.Green, $"  [ok] {s}");
    }

    public static void Bad(string s)
    {
        if (Captured("bad", s)) return;
        Color(ConsoleColor.Red, $"  [!!] {s}");
    }

    public static void Lesson(string s)
    {
        if (Captured("lesson", s)) return;
        Console.WriteLine();
        Color(ConsoleColor.Magenta, $"  Lesson: {s}");
    }

    private static void Color(ConsoleColor c, string s)
    {
        Console.ForegroundColor = c;
        Console.WriteLine(s);
        Console.ResetColor();
    }
}
