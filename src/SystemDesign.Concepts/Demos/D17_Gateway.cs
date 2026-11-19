namespace SystemDesign.Concepts.Demos;

/// <summary>A tiny API gateway: route by path prefix, enforce auth centrally, forward to services.</summary>
public sealed class D17_Gateway : IDemo
{
    public int Number => 17;
    public string Track => "Communication";
    public string Title => "API gateway and reverse proxy";

    private sealed record Request(string Method, string Path, string? Token);
    private sealed record Route(string Prefix, string Service, bool RequiresAuth);

    private static readonly Route[] Routes =
    [
        new("/api/catalog", "catalog-service", RequiresAuth: false),
        new("/api/orders",  "orders-service",  RequiresAuth: true),
        new("/api/admin",   "admin-service",   RequiresAuth: true)
    ];

    private static readonly Dictionary<string, Func<Request, string>> Services = new()
    {
        ["catalog-service"] = r => $"200 product list ({r.Path})",
        ["orders-service"] = r => "200 your orders",
        ["admin-service"] = r => "200 admin panel"
    };

    public Task RunAsync()
    {
        Request[] incoming =
        [
            new("GET", "/api/catalog/phones", null),
            new("GET", "/api/orders/mine", null),
            new("GET", "/api/orders/mine", "valid-token"),
            new("GET", "/api/unknown", "valid-token")
        ];

        Out.Step("Clients call ONE host; the gateway routes and protects");
        foreach (var req in incoming)
        {
            var result = Handle(req);
            var line = $"{req.Method} {req.Path,-22} token={(req.Token is null ? "none" : "yes"),-4} -> {result}";
            if (result.StartsWith("200")) Out.Good(line); else Out.Bad(line);
        }

        Out.Step("What belongs in a gateway");
        Out.Line("Routing, TLS termination, authentication, rate limiting, request logging, aggregation.");
        Out.Line("NOT business rules. In .NET: YARP, Ocelot, or Azure API Management.");

        Out.Lesson("A gateway gives you one place to answer 'where is auth / rate limiting enforced?'");
        return Task.CompletedTask;
    }

    private static string Handle(Request req)
    {
        var route = Routes.FirstOrDefault(r => req.Path.StartsWith(r.Prefix, StringComparison.OrdinalIgnoreCase));
        if (route is null) return "404 no route";
        if (route.RequiresAuth && req.Token != "valid-token") return "401 rejected at gateway (service never saw it)";
        return $"{Services[route.Service](req)}  via {route.Service}";
    }
}
