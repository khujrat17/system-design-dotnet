using System.Text.Json;

namespace SystemDesign.Concepts.Demos;

/// <summary>The same order modelled relationally (normalised rows + joins) and as a document.</summary>
public sealed class D07_SqlVsNoSql : IDemo
{
    public int Number => 7;
    public string Track => "Data";
    public string Title => "SQL vs NoSQL data modelling";

    // Relational: normalised tables
    private sealed record Customer(int Id, string Name, string City);
    private sealed record Order(int Id, int CustomerId, DateOnly Date);
    private sealed record OrderLine(int OrderId, string Sku, int Qty, decimal Price);

    // Document: one aggregate, read and written as a unit
    private sealed record OrderDoc(int Id, DateOnly Date, CustomerSnapshot Customer, List<LineDoc> Lines);
    private sealed record CustomerSnapshot(int Id, string Name, string City);
    private sealed record LineDoc(string Sku, int Qty, decimal Price);

    public Task RunAsync()
    {
        var customers = new List<Customer> { new(1, "Asha", "Pune"), new(2, "Ravi", "Delhi") };
        var orders = new List<Order> { new(100, 1, new(2026, 11, 1)), new(101, 2, new(2026, 11, 2)) };
        var lines = new List<OrderLine>
        {
            new(100, "PHONE-1", 1, 19_999m), new(100, "CASE-9", 2, 499m), new(101, "LAPTOP-3", 1, 64_999m)
        };

        Out.Step("Relational: load order 100 = join three tables");
        var q = from o in orders
                join c in customers on o.CustomerId equals c.Id
                join l in lines on o.Id equals l.OrderId
                where o.Id == 100
                select new { o.Id, c.Name, l.Sku, l.Qty, l.Price };
        foreach (var r in q) Out.Line($"{r.Id} {r.Name,-5} {r.Sku,-9} x{r.Qty} @ {r.Price}");

        Out.Step("Document: order 100 is a single JSON document keyed by id");
        var docs = new Dictionary<int, OrderDoc>
        {
            [100] = new(100, new(2026, 11, 1), new(1, "Asha", "Pune"),
                        [new("PHONE-1", 1, 19_999m), new("CASE-9", 2, 499m)]),
            [101] = new(101, new(2026, 11, 2), new(2, "Ravi", "Delhi"), [new("LAPTOP-3", 1, 64_999m)])
        };
        Out.Line(JsonSerializer.Serialize(docs[100]));
        Out.Good("One lookup, no joins. Great when you always read the whole order.");

        Out.Step("Ad-hoc question: total revenue per city");
        var sqlAnswer = from o in orders
                        join c in customers on o.CustomerId equals c.Id
                        join l in lines on o.Id equals l.OrderId
                        group l.Qty * l.Price by c.City into g
                        select $"{g.Key}: {g.Sum():N0}";
        Out.Line("SQL: " + string.Join(", ", sqlAnswer) + "  (just another query)");
        Out.Bad("Document store keyed by order id: must scan every document, or build a new index/view for it.");

        Out.Step("Update: Asha moves to Mumbai");
        customers[0] = customers[0] with { City = "Mumbai" };
        Out.Good("Relational: one row changed, every order sees it.");
        Out.Bad($"Document: snapshot in order 100 still says {docs[100].Customer.City}. Duplication is a trade-off you choose.");

        Out.Lesson("Pick by access pattern. Default to relational for business data unless you have a reason not to.");
        return Task.CompletedTask;
    }
}
