// Scale ShopKart: the console version of the game from the course page.
// Grow an e-commerce app from 1,000 to 10 million users. Pick the fix a senior engineer would choose.

using ShopKart.Game;

Console.OutputEncoding = System.Text.Encoding.UTF8;
var rnd = new Random();

while (true)
{
    var result = Play(rnd);
    Console.WriteLine();
    Console.Write("Play again? (y/n): ");
    if (!string.Equals(Console.ReadLine()?.Trim(), "y", StringComparison.OrdinalIgnoreCase)) break;
}

static GameResult Play(Random rnd)
{
    var uptime = 100;
    var score = 0;
    var built = new List<string>();
    var misses = new List<Scene>();
    var round = 0;

    if (!Console.IsOutputRedirected)
    {
        try { Console.Clear(); } catch (IOException) { /* no real console attached */ }
    }
    Write(ConsoleColor.Cyan, "SCALE SHOPKART");
    Console.WriteLine("You're the architect. Each round something breaks. Right call: +100 and a new piece.");
    Console.WriteLine("Half-measure: +40, uptime -10%. Wrong call: uptime -25%. Hit 0% and the company goes down.\n");

    foreach (var scene in Scenes.All)
    {
        round++;
        var options = scene.Options.OrderBy(_ => rnd.Next()).ToList();

        Console.WriteLine(new string('-', 70));
        Write(ConsoleColor.DarkGray, $"Round {round}/{Scenes.All.Count}  |  Uptime {uptime}%  |  Score {score}  |  {scene.Stage}");
        Write(ConsoleColor.Yellow, scene.Title);
        Console.WriteLine(scene.Situation);
        Console.WriteLine();
        for (var i = 0; i < options.Count; i++) Console.WriteLine($"  {i + 1}. {options[i].Text}");

        int pick;
        while (true)
        {
            Console.Write($"\nYour call (1-{options.Count}): ");
            var line = Console.ReadLine();
            if (line is null) Environment.Exit(0);   // input closed (Ctrl+Z / end of piped input)
            if (int.TryParse(line, out pick) && pick >= 1 && pick <= options.Count) break;
        }

        var chosen = options[pick - 1];
        switch (chosen.Kind)
        {
            case Kind.Right:
                score += 100; built.Add(scene.Piece);
                Write(ConsoleColor.Green, $"Right call. {scene.Piece} added to your architecture.");
                break;
            case Kind.Partial:
                score += 40; uptime = Math.Max(0, uptime - 10); misses.Add(scene);
                Write(ConsoleColor.DarkYellow, "It helps, but it isn't the real fix. Uptime -10%.");
                break;
            default:
                uptime = Math.Max(0, uptime - 25); misses.Add(scene);
                Write(ConsoleColor.Red, "That makes things worse. Uptime -25%.");
                break;
        }
        if (chosen.Kind != Kind.Right)
            Write(ConsoleColor.Green, $"Best fix: {scene.Options.First(o => o.Kind == Kind.Right).Text}");
        Console.WriteLine(scene.Why);
        Write(ConsoleColor.DarkGray, $"Revise: concept demo #{scene.ConceptDemo} in SystemDesign.Concepts");
        Console.Write("\nPress Enter to continue...");
        Console.ReadLine();

        if (uptime <= 0) break;
    }

    Console.WriteLine(new string('=', 70));
    var right = round - misses.Count;
    var grade = uptime <= 0 ? "ShopKart went down."
        : right >= 13 ? "Staff engineer material."
        : right >= 10 ? "Senior engineer."
        : right >= 7 ? "Getting there."
        : "Back to the drawing board.";
    Write(ConsoleColor.Cyan, grade);
    Console.WriteLine($"{right}/{round} best fixes  |  score {score}/{Scenes.All.Count * 100}  |  uptime {uptime}%");
    Console.WriteLine($"Your architecture: {(built.Count == 0 ? "(nothing yet)" : string.Join(", ", built))}");
    if (misses.Count > 0)
    {
        Console.WriteLine("\nRevise these concept demos (dotnet run --project src/SystemDesign.Concepts -- <number>):");
        foreach (var m in misses.DistinctBy(m => m.ConceptDemo)) Console.WriteLine($"  #{m.ConceptDemo,-3} {m.Title}");
    }
    return new GameResult(score, uptime, right);
}

static void Write(ConsoleColor c, string s)
{
    Console.ForegroundColor = c;
    Console.WriteLine(s);
    Console.ResetColor();
}

namespace ShopKart.Game
{
    public enum Kind { Right, Partial, Wrong }
    public sealed record Option(string Text, Kind Kind);
    public sealed record Scene(string Stage, string Title, string Situation, Option[] Options, string Piece, int ConceptDemo, string Why);
    public sealed record GameResult(int Score, int Uptime, int Right);
}
