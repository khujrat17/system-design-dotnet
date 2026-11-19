using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace SystemDesign.Concepts.Demos;

/// <summary>A minimal JWT-like token (HMAC-SHA256) to see signing, expiry, tampering and the revocation problem.</summary>
public sealed class D23_Security : IDemo
{
    public int Number => 23;
    public string Track => "Reliability";
    public string Title => "Authentication: signed tokens and revocation";

    private static readonly byte[] Secret = RandomNumberGenerator.GetBytes(32);   // keep in Key Vault, never in code
    private static readonly HashSet<string> DenyList = new();                     // emergency revocation by token id

    private sealed record Claims(string Sub, string Role, long Exp, string Jti);

    private static string Issue(Claims c)
    {
        var header = B64(Encoding.UTF8.GetBytes("{\"alg\":\"HS256\",\"typ\":\"JWT\"}"));
        var payload = B64(JsonSerializer.SerializeToUtf8Bytes(c));
        var sig = B64(HMACSHA256.HashData(Secret, Encoding.UTF8.GetBytes($"{header}.{payload}")));
        return $"{header}.{payload}.{sig}";
    }

    private static (bool Ok, string Reason) Validate(string token, long nowUnix)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return (false, "malformed");
        var expected = HMACSHA256.HashData(Secret, Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}"));
        if (!CryptographicOperations.FixedTimeEquals(expected, FromB64(parts[2]))) return (false, "bad signature (tampered)");
        var c = JsonSerializer.Deserialize<Claims>(FromB64(parts[1]))!;
        if (c.Exp < nowUnix) return (false, "expired");
        if (DenyList.Contains(c.Jti)) return (false, "revoked (deny-list hit)");
        return (true, $"valid: {c.Sub} as {c.Role}");
    }

    public Task RunAsync()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = Issue(new Claims("asha", "customer", now + 900, "t-1"));   // 15 min lifetime

        Out.Step("Issue and validate (no database lookup needed: that's why it scales)");
        Out.Line(token[..Math.Min(70, token.Length)] + "...");
        Report(Validate(token, now));

        Out.Step("Attacker edits the payload to role=admin");
        var p = token.Split('.');
        var forged = B64(JsonSerializer.SerializeToUtf8Bytes(new Claims("asha", "admin", now + 900, "t-1")));
        Report(Validate($"{p[0]}.{forged}.{p[2]}", now));

        Out.Step("Token is stolen. Without a deny-list it stays valid until it expires");
        Report(Validate(token, now + 600));
        DenyList.Add("t-1");
        Report(Validate(token, now + 600));
        Out.Line("Deny-lists bring back a lookup, so keep tokens short-lived and use refresh tokens.");

        Out.Step("Expired after 15 minutes");
        DenyList.Clear();
        Report(Validate(token, now + 901));

        Out.Lesson("AuthN = who you are, AuthZ = what you may do. Use an identity provider; don't roll your own in production.");
        return Task.CompletedTask;
    }

    private static void Report((bool Ok, string Reason) r)
    {
        if (r.Ok) Out.Good(r.Reason); else Out.Bad(r.Reason);
    }

    private static string B64(byte[] b) => Convert.ToBase64String(b).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromB64(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return Convert.FromBase64String(s.PadRight(s.Length + (4 - s.Length % 4) % 4, '='));
    }
}
