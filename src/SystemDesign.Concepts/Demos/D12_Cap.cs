namespace SystemDesign.Concepts.Demos;

/// <summary>A network partition between two replicas: choose consistency (reject) or availability (diverge).</summary>
public sealed class D12_Cap : IDemo
{
    public int Number => 12;
    public string Track => "Data";
    public string Title => "CAP theorem and consistency choices";

    private sealed class Node(string name)
    {
        public string Name => name;
        public int Stock = 10;
        public DateTime UpdatedAt = DateTime.MinValue;
    }

    private enum Mode { CP, AP }

    public Task RunAsync()
    {
        foreach (var mode in new[] { Mode.CP, Mode.AP })
        {
            Out.Step($"{mode}: Mumbai and Delhi replicas, the link between them is cut");
            var a = new Node("Mumbai"); var b = new Node("Delhi");
            var partitioned = true;

            bool Buy(Node local, Node remote, int qty)
            {
                if (partitioned && mode == Mode.CP)
                {
                    Out.Bad($"{local.Name}: can't reach {remote.Name}, refusing the purchase (consistent, not available)");
                    return false;
                }
                local.Stock -= qty; local.UpdatedAt = DateTime.UtcNow;
                if (!partitioned) { remote.Stock = local.Stock; remote.UpdatedAt = local.UpdatedAt; }
                Out.Good($"{local.Name}: sold {qty}, local stock now {local.Stock}");
                return true;
            }

            Buy(a, b, 7);
            Thread.Sleep(5);
            Buy(b, a, 6);

            partitioned = false;
            if (mode == Mode.AP)
            {
                Out.Line("Partition heals. Last-write-wins merge:");
                var winner = a.UpdatedAt > b.UpdatedAt ? a : b;
                Out.Bad($"Stock set to {winner.Stock} from {winner.Name}, but 13 units were sold out of 10. Oversold.");
            }
        }

        Out.Step("So choose per feature");
        Out.Line("Inventory, payments, seat booking  -> strong consistency (CP)");
        Out.Line("Likes, view counts, recommendations -> eventual consistency (AP)");
        Out.Line("Profile edits                       -> session / read-your-own-writes");

        Out.Lesson("Partitions happen. The real question is: during one, reject requests or risk stale data?");
        return Task.CompletedTask;
    }
}
