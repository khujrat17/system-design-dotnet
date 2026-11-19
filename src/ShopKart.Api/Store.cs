namespace ShopKart.Api;

public sealed class Product
{
    public required int Id { get; init; }
    public required string Name { get; init; }
    public decimal Price { get; set; }
    public int Stock { get; set; }
}

public sealed record Order(long Id, int ProductId, int Quantity, decimal Total, string CustomerId, DateTime CreatedAt);
public sealed record OrderPlaced(long OrderId, string CustomerId, decimal Total);
public sealed record PlaceOrderRequest(int ProductId, int Quantity, string CustomerId);
public sealed record OrderResult(int StatusCode, object Body);

/// <summary>
/// In-memory stand-in for the database so the API runs with zero infrastructure.
/// Each method notes what it would be in SQL.
/// </summary>
public sealed class Store
{
    private readonly object _gate = new();
    private readonly Dictionary<int, Product> _products;
    private readonly List<Order> _orders = new();
    private long _nextOrderId = 1;
    private int _dbReads;

    public int DbReads => _dbReads;

    public Store()
    {
        string[] names = ["Phone X", "Phone X Case", "Laptop Pro 14", "Wireless Earbuds", "Smart Watch", "USB-C Charger",
                          "Gaming Mouse", "Mechanical Keyboard", "4K Monitor", "Bluetooth Speaker"];
        _products = names.Select((n, i) => new Product { Id = i + 1, Name = n, Price = 999 + i * 1_500, Stock = 100 })
                         .ToDictionary(p => p.Id);
    }

    // SELECT * FROM Products WHERE Id = @id   (deliberately slow so caching is visible)
    public async Task<Product?> GetProductAsync(int id, CancellationToken ct)
    {
        Interlocked.Increment(ref _dbReads);
        await Task.Delay(80, ct);
        lock (_gate) return _products.TryGetValue(id, out var p) ? Clone(p) : null;
    }

    public IReadOnlyList<Product> AllProducts()
    {
        Interlocked.Increment(ref _dbReads);
        lock (_gate) return _products.Values.Select(Clone).ToList();
    }

    public IReadOnlyList<Product> Search(string q)
    {
        Interlocked.Increment(ref _dbReads);
        lock (_gate)
            return _products.Values.Where(p => p.Name.Contains(q, StringComparison.OrdinalIgnoreCase)).Select(Clone).ToList();
    }

    public bool UpdatePrice(int id, decimal price)
    {
        lock (_gate)
        {
            if (!_products.TryGetValue(id, out var p)) return false;
            p.Price = price;
            return true;
        }
    }

    // UPDATE Products SET Stock = Stock - @qty WHERE Id = @id AND Stock >= @qty
    // One atomic statement: no read-check-write race, so no overselling.
    public bool TryReserveStock(int productId, int qty, out decimal unitPrice)
    {
        lock (_gate)
        {
            unitPrice = 0;
            if (!_products.TryGetValue(productId, out var p) || p.Stock < qty) return false;
            p.Stock -= qty;
            unitPrice = p.Price;
            return true;
        }
    }

    public Order AddOrder(int productId, int qty, decimal total, string customerId)
    {
        lock (_gate)
        {
            var o = new Order(_nextOrderId++, productId, qty, total, customerId, DateTime.UtcNow);
            _orders.Add(o);
            return o;
        }
    }

    // SELECT TOP (@limit) * FROM Orders WHERE Id > @after ORDER BY Id   (keyset pagination)
    public IReadOnlyList<Order> OrdersAfter(long after, int limit)
    {
        lock (_gate) return _orders.Where(o => o.Id > after).OrderBy(o => o.Id).Take(limit).ToList();
    }

    private static Product Clone(Product p) => new() { Id = p.Id, Name = p.Name, Price = p.Price, Stock = p.Stock };
}
