using System.Diagnostics;

namespace SystemDesign.Concepts.Demos;

/// <summary>Timeouts, retry with exponential backoff + jitter, and a circuit breaker, all hand-rolled.</summary>
public sealed class D20_Resilience : IDemo
{
    public int Number => 20;
    public string Track => "Reliability";
    public string Title => "Resilience: timeout, retry, circuit breaker";

    public sealed class CircuitBreaker(int failureThreshold, TimeSpan breakDuration)
    {
        private int _failures;
        private DateTime _openedAt;
        public string State { get; private set; } = "Closed";

        public async Task<T> ExecuteAsync<T>(Func<Task<T>> action)
        {
            if (State == "Open")
            {
                if (DateTime.UtcNow - _openedAt < breakDuration)
                    throw new InvalidOperationException("circuit open: failing fast");
                State = "HalfOpen";                       // let one trial call through
            }
            try
            {
                var result = await action();
                _failures = 0; State = "Closed";
                return result;
            }
            catch
            {
                if (State == "HalfOpen" || ++_failures >= failureThreshold)
                {
                    State = "Open"; _openedAt = DateTime.UtcNow;
                }
                throw;
            }
        }
    }

    public static async Task<T> WithTimeout<T>(Func<CancellationToken, Task<T>> action, TimeSpan timeout)
    {
        using var cts = new CancellationTokenSource(timeout);
        return await action(cts.Token);
    }

    public static async Task<T> WithRetry<T>(Func<Task<T>> action, int maxAttempts, Random rnd)
    {
        for (var attempt = 1; ; attempt++)
        {
            try { return await action(); }
            catch when (attempt < maxAttempts)
            {
                var backoff = 100 * Math.Pow(2, attempt - 1);           // 100, 200, 400 ms
                var jitter = rnd.Next(0, (int)backoff);                 // spread retries out
                Out.Line($"   attempt {attempt} failed, retrying in {backoff + jitter:N0} ms");
                await Task.Delay((int)(backoff + jitter));
            }
        }
    }

    public async Task RunAsync()
    {
        var rnd = new Random(5);

        Out.Step("Timeout: payment provider hangs for 5 s; we give it 300 ms");
        var sw = Stopwatch.StartNew();
        try { await WithTimeout(ct => SlowPayment(TimeSpan.FromSeconds(5), ct), TimeSpan.FromMilliseconds(300)); }
        catch (OperationCanceledException) { Out.Good($"Gave up after {sw.ElapsedMilliseconds} ms; thread freed"); }

        Out.Step("Retry with backoff + jitter: dependency fails twice, then works");
        var calls = 0;
        var r = await WithRetry(async () =>
        {
            await Task.Yield();
            if (++calls < 3) throw new HttpRequestException("503");
            return "paid";
        }, maxAttempts: 4, rnd);
        Out.Good($"Result: {r} after {calls} calls");

        Out.Step("Circuit breaker: provider is down, threshold 3 failures, break 1 s");
        var cb = new CircuitBreaker(3, TimeSpan.FromSeconds(1));
        for (var i = 1; i <= 6; i++)
        {
            sw.Restart();
            try { await cb.ExecuteAsync<string>(() => throw new HttpRequestException("down")); }
            catch (Exception ex) { Out.Line($"call {i}: {ex.Message,-28} state={cb.State}  ({sw.ElapsedMilliseconds} ms)"); }
        }
        Out.Line("waiting for the break duration...");
        await Task.Delay(1100);
        var res = await cb.ExecuteAsync(() => Task.FromResult("recovered"));
        Out.Good($"Trial call: {res}, state={cb.State}");

        Out.Line("In production use Polly / Microsoft.Extensions.Http.Resilience (AddStandardResilienceHandler).");
        Out.Lesson("Always set timeouts. Retry only transient, idempotent calls, with jitter. Break circuits on sustained failure.");
    }

    private static async Task<string> SlowPayment(TimeSpan delay, CancellationToken ct)
    {
        await Task.Delay(delay, ct);
        return "paid";
    }
}
