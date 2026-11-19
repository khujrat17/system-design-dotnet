using System.Threading.Channels;

namespace ShopKart.Api;

/// <summary>
/// Consumes OrderPlaced events off an in-process queue (System.Threading.Channels).
/// In production this would be Azure Service Bus / RabbitMQ / Kafka, usually via MassTransit,
/// so events survive restarts. The patterns are the same: retries, dead-lettering, idempotency.
/// </summary>
public sealed class OrderEventsWorker(Channel<OrderPlaced> queue, ILogger<OrderEventsWorker> log) : BackgroundService
{
    private readonly HashSet<long> _processed = new();   // processed-message table: makes the consumer idempotent

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var evt in queue.Reader.ReadAllAsync(stoppingToken))
        {
            if (!_processed.Add(evt.OrderId))
            {
                log.LogInformation("Order {OrderId}: duplicate event skipped", evt.OrderId);
                continue;
            }

            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    await SendConfirmationEmail(evt, stoppingToken);
                    log.LogInformation("Order {OrderId}: confirmation email sent to {Customer}", evt.OrderId, evt.CustomerId);
                    break;
                }
                catch (Exception ex) when (attempt < 3 && ex is not OperationCanceledException)
                {
                    var delay = TimeSpan.FromMilliseconds(200 * Math.Pow(2, attempt) + Random.Shared.Next(100));
                    log.LogWarning("Order {OrderId}: email failed ({Error}), retry {Attempt} in {Delay} ms",
                        evt.OrderId, ex.Message, attempt, (int)delay.TotalMilliseconds);
                    await Task.Delay(delay, stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    log.LogError("Order {OrderId}: giving up after {Attempt} attempts -> dead-letter ({Error})",
                        evt.OrderId, attempt, ex.Message);
                    break;
                }
            }
        }
    }

    private static async Task SendConfirmationEmail(OrderPlaced evt, CancellationToken ct)
    {
        await Task.Delay(500, ct);                                   // slow SMTP / provider
        if (Random.Shared.NextDouble() < 0.3) throw new InvalidOperationException("email provider 503");
    }
}
