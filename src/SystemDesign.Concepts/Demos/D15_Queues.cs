using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading.Channels;

namespace SystemDesign.Concepts.Demos;

/// <summary>Sync vs queued side effects, at-least-once redelivery, idempotent consumers, dead-letter queue.</summary>
public sealed class D15_Queues : IDemo
{
    public int Number => 15;
    public string Track => "Communication";
    public string Title => "Message queues";

    private sealed record OrderPlaced(int OrderId, int Attempt = 1);

    public async Task RunAsync()
    {
        Out.Step("Synchronous checkout: save + email + PDF + SMS in the request");
        var sw = Stopwatch.StartNew();
        await Task.Delay(50); await Task.Delay(400); await Task.Delay(800); await Task.Delay(600);
        Out.Bad($"User waited {sw.ElapsedMilliseconds} ms, and an SMS failure would fail the order");

        Out.Step("Queued checkout: save order, publish OrderPlaced, return");
        var queue = Channel.CreateUnbounded<OrderPlaced>();
        sw.Restart();
        await Task.Delay(50);
        await queue.Writer.WriteAsync(new OrderPlaced(1));
        Out.Good($"User waited {sw.ElapsedMilliseconds} ms. Workers handle the rest.");

        Out.Step("At-least-once delivery: the broker redelivers some messages");
        var processed = new ConcurrentDictionary<int, bool>();     // processed-message table
        var deadLetter = new List<OrderPlaced>();
        var emailsSent = 0;
        foreach (var id in new[] { 2, 3, 3, 4, 2, 5 }) await queue.Writer.WriteAsync(new OrderPlaced(id));
        await queue.Writer.WriteAsync(new OrderPlaced(666));       // poison message
        queue.Writer.Complete();

        await foreach (var msg in queue.Reader.ReadAllAsync())
        {
            try
            {
                if (msg.OrderId == 666) throw new FormatException("payload can't be parsed");
                if (!processed.TryAdd(msg.OrderId, true))
                {
                    Out.Line($"order {msg.OrderId}: duplicate, skipped (idempotent consumer)");
                    continue;
                }
                emailsSent++;
                Out.Good($"order {msg.OrderId}: email sent");
            }
            catch (Exception ex)
            {
                // Real brokers retry with backoff; after N attempts the message goes to the DLQ.
                var attempts = 3;
                Out.Bad($"order {msg.OrderId}: failed {attempts}x ({ex.Message}) -> dead-letter queue");
                deadLetter.Add(msg with { Attempt = attempts });
            }
        }
        Out.Line($"Emails sent: {emailsSent} for 4 distinct orders. DLQ size: {deadLetter.Count}");

        Out.Lesson("Queues make requests fast and absorb spikes. Assume duplicates; consumers must be idempotent.");
    }
}
