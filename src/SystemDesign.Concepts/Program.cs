using System.Reflection;
using SystemDesign.Concepts;

// Discover every IDemo in this assembly and order by number.
var demos = Assembly.GetExecutingAssembly().GetTypes()
    .Where(t => typeof(IDemo).IsAssignableFrom(t) && t is { IsClass: true, IsAbstract: false })
    .Select(t => (IDemo)Activator.CreateInstance(t)!)
    .OrderBy(d => d.Number)
    .ToList();


// Non-interactive: dotnet run -- 5   or   dotnet run -- all
if (args.Length > 0)
{
    await RunSelection(args[0]);
    return;
}

while (true)
{
    Console.WriteLine();
    Console.ForegroundColor = ConsoleColor.Cyan;
    Console.WriteLine("System design concepts, implemented in plain C#");
    Console.ResetColor();
    string? lastTrack = null;
    foreach (var d in demos)
    {
        if (d.Track != lastTrack)
        {
            Console.ForegroundColor = ConsoleColor.DarkGray;
            Console.WriteLine($"\n  {d.Track}");
            Console.ResetColor();
            lastTrack = d.Track;
        }
        Console.WriteLine($"   {d.Number,2}. {d.Title}");
    }
    Console.Write("\nPick a number, 'all', or 'q' to quit: ");
    var input = Console.ReadLine()?.Trim();
    if (string.IsNullOrEmpty(input) || input.Equals("q", StringComparison.OrdinalIgnoreCase)) break;
    await RunSelection(input);
    Console.Write("\nPress Enter to return to the menu...");
    Console.ReadLine();
}

async Task RunSelection(string input)
{
    if (input.Equals("all", StringComparison.OrdinalIgnoreCase))
    {
        foreach (var d in demos) await Run(d);
        return;
    }
    if (int.TryParse(input, out var n) && demos.FirstOrDefault(d => d.Number == n) is { } demo)
    {
        await Run(demo);
        return;
    }
    Console.WriteLine($"No demo '{input}'.");
}

static async Task Run(IDemo d)
{
    Out.Title($"{d.Number}. {d.Title}");
    try { await d.RunAsync(); }
    catch (Exception ex) { Out.Bad($"Demo crashed: {ex.Message}"); }
}
