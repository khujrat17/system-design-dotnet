namespace SystemDesign.Concepts.Demos;

/// <summary>Token bucket, fixed window and sliding window log, implemented from scratch.</summary>
public sealed class D19_RateLimiting : IDemo
{
    public int Number => 19;
    public string Track => "Reliability";
    public string Title => "Rate limiting algorithms";

    public interface ILimiter { bool Allow(double nowSeconds); }

    public sealed class TokenBucket(double capacity, double refillPerSecond) : ILimiter
    {
        private readonly double _capacity = capacity;
        private double _tokens = capacity, _last;
        public bool Allow(double now)
        {
            _tokens = Math.Min(_capacity,_tokens + (now - _last) * refillPerSecond);
            _last = now;
            if (_tokens < 1) return false;
            _tokens -= 1;
            return true;
        }
    }

    public sealed class FixedWindow(int limit, double windowSeconds) : ILimiter
    {
        private long _window = -1; private int _count;
        public bool Allow(double now)
        {
            var w = (long)(now / windowSeconds);
            if (w != _window) { _window = w; _count = 0; }
            return ++_count <= limit;
        }
    }

    public sealed class SlidingWindowLog(int limit, double windowSeconds) : ILimiter
    {
        private readonly Queue<double> _log = new();
        public bool Allow(double now)
        {
            while (_log.Count > 0 && _log.Peek() <= now - windowSeconds) _log.Dequeue();
            if (_log.Count >= limit) return false;
            _log.Enqueue(now);
            return true;
        }
    }

    public Task RunAsync()
    {
        Out.Line("Policy: 10 requests per 10 seconds per user.");
        // Attack on the window boundary: 10 requests at t=9.9s, 10 more at t=10.1s
        var times = Enumerable.Repeat(9.9, 10).Concat(Enumerable.Repeat(10.1, 10)).ToArray();

        var limiters = new (string Name, ILimiter L)[]
        {
            ("Fixed window", new FixedWindow(10, 10)),
            ("Sliding window log", new SlidingWindowLog(10, 10)),
            ("Token bucket (cap 10, 1/s)", new TokenBucket(10, 1))
        };

        Out.Step("20 requests within 0.2 seconds, straddling a window boundary");
        foreach (var (name, l) in limiters)
        {
            var allowed = times.Count(t => l.Allow(t));
            var msg = $"{name,-28} allowed {allowed,2} of 20";
            if (allowed > 10) Out.Bad(msg + "  <- 2x the limit"); else Out.Good(msg);
        }

        Out.Step("Token bucket allows bursts then a steady rate");
        var tb = new TokenBucket(5, 1);
        var line = string.Concat(Enumerable.Range(0, 15).Select(i => tb.Allow(i * 0.25) ? "Y" : "."));
        Out.Line($"one request every 250 ms: {line}");
        Out.Line("(5 burst, then roughly 1 every 4 requests = 1 per second)");

        Out.Lesson("Return 429 + Retry-After. Share counters (Redis) or limit at the gateway when you have many instances.");
        return Task.CompletedTask;
    }
}
