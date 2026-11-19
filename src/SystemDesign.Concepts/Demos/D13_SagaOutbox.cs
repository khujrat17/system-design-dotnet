namespace SystemDesign.Concepts.Demos;

/// <summary>Orchestrated saga with compensations, and the outbox pattern vs the dual-write bug.</summary>
public sealed class D13_SagaOutbox : IDemo
{
    public int Number => 13;
    public string Track => "Data";
    public string Title => "Distributed transactions: saga and outbox";

    private sealed record SagaStep(string Name, Func<bool> Action, Action Compensate);

    public Task RunAsync()
    {
        Out.Step("Saga: reserve stock -> charge card -> book courier (courier fails)");
        var log = new List<string>();
        SagaStep[] steps =
        [
            new("Reserve stock", () => { log.Add("stock reserved"); return true; },
                                 () => log.Add("COMPENSATE: stock released")),
            new("Charge card",   () => { log.Add("card charged"); return true; },
                                 () => log.Add("COMPENSATE: card refunded")),
            new("Book courier",  () => { log.Add("courier API returned 503"); return false; },
                                 () => { })
        ];
        RunSaga(steps);
        foreach (var l in log) Out.Line(l);

        Out.Step("Dual-write bug: save order, then publish event. Process crashes in between.");
        var db = new List<string>(); var broker = new List<string>();
        try
        {
            db.Add("Order 501");
            throw new InvalidOperationException("process killed (deploy, OOM, power)");
            // broker.Add("OrderPlaced 501");   <- never runs
        }
        catch (Exception ex) { Out.Line($"crash: {ex.Message}"); }
        Out.Bad($"DB has {db.Count} order, broker has {broker.Count} events. Email/billing never hear about it.");

        Out.Step("Outbox: write the event to an Outbox table in the SAME transaction");
        var orders = new List<string>(); var outbox = new List<(string Msg, bool Sent)>(); broker.Clear();
        // BEGIN TRAN
        orders.Add("Order 502");
        outbox.Add(("OrderPlaced 502", false));
        // COMMIT  (both rows or neither)
        Out.Line("crash right after commit... restart... background relay runs:");
        for (var i = 0; i < outbox.Count; i++)
        {
            if (outbox[i].Sent) continue;
            broker.Add(outbox[i].Msg);
            outbox[i] = (outbox[i].Msg, true);
        }
        Out.Good($"Broker received: {string.Join(", ", broker)}");
        Out.Line("If the relay crashes after publishing but before marking Sent, it publishes twice -> consumers must be idempotent.");

        Out.Lesson("No distributed transaction needed: local transactions + compensations + outbox.");
        return Task.CompletedTask;
    }

    private static void RunSaga(SagaStep[] steps)
    {
        var done = new Stack<SagaStep>();
        foreach (var s in steps)
        {
            if (s.Action()) { done.Push(s); continue; }
            while (done.Count > 0) done.Pop().Compensate();   // undo in reverse order
            return;
        }
    }
}
