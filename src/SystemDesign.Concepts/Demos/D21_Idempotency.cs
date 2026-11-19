using System.Collections.Concurrent;

namespace SystemDesign.Concepts.Demos;

/// <summary>Idempotency keys that survive retries AND concurrent duplicates.</summary>
public sealed class D21_Idempotency : IDemo
{
    public int Number => 21;
    public string Track => "Reliability";
    public string Title => "Idempotency keys";

    private sealed class PaymentService
    {
        public int Charges;
        private readonly ConcurrentDictionary<string, Lazy<Task<string>>> _keys = new();  // unique index on Key

        public async Task<string> ChargeNaive(decimal amount)
        {
            await Task.Delay(30);
            return $"charge #{Interlocked.Increment(ref Charges)} for {amount}";
        }

        // GetOrAdd + Lazy: concurrent requests with the same key share ONE execution.
        // In a database, a unique constraint on the key plays the same role.
        public Task<string> Charge(string idempotencyKey, decimal amount) =>
            _keys.GetOrAdd(idempotencyKey, _ => new Lazy<Task<string>>(() => ChargeNaive(amount))).Value;
    }

    public async Task RunAsync()
    {
        Out.Step("No key: the app times out and retries; the first call actually succeeded");
        var naive = new PaymentService();
        await naive.ChargeNaive(1_999m);
        await naive.ChargeNaive(1_999m);                       // retry
        Out.Bad($"Customer charged {naive.Charges} times");

        Out.Step("With an Idempotency-Key: sequential retries");
        var svc = new PaymentService();
        var key = Guid.NewGuid().ToString();
        var first = await svc.Charge(key, 1_999m);
        var retry = await svc.Charge(key, 1_999m);
        Out.Good($"first: {first} | retry: {retry} | total charges: {svc.Charges}");

        Out.Step("Double-click: 10 concurrent requests with the same key");
        var svc2 = new PaymentService();
        var k2 = Guid.NewGuid().ToString();
        var results = await Task.WhenAll(Enumerable.Range(0, 10).Select(_ => svc2.Charge(k2, 499m)));
        Out.Good($"{results.Distinct().Count()} distinct result, {svc2.Charges} charge");

        Out.Line("Note: a naive 'if key exists return, else charge' check would let concurrent duplicates through.");
        Out.Lesson("Client generates the key per logical operation. Server stores key + result atomically.");
    }
}
