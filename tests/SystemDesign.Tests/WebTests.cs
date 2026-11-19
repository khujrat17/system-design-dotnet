using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SystemDesign.Tests;

/// <summary>The System Design Lab web app: pages, API, and the rate limit it teaches.</summary>
public class WebTests(WebApplicationFactory<Program> factory) : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client = factory.CreateClient();

    [Theory]
    [InlineData("/")]
    [InlineData("/app.js")]
    [InlineData("/app.css")]
    [InlineData("/health")]
    [InlineData("/course")]
    public async Task Pages_and_assets_are_served(string url)
    {
        var res = await _client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Demo_list_has_26_concepts_with_source_files()
    {
        var demos = await _client.GetFromJsonAsync<JsonElement[]>("/api/demos");
        Assert.NotNull(demos);
        Assert.Equal(26, demos.Length);
        Assert.All(demos, d => Assert.EndsWith(".cs", d.GetProperty("file").GetString()));
    }

    [Fact]
    public async Task Course_data_is_extracted_from_the_course_page()
    {
        var js = await _client.GetStringAsync("/course-data.js");
        Assert.Contains("window.COURSE", js);
        Assert.Contains("const SCENES", js);
        Assert.True(js.Length > 10_000, "course data looks empty");
    }

    [Fact]
    public async Task Running_a_demo_returns_its_output()
    {
        var res = await _client.PostAsync("/api/demos/11/run", null);
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        var entries = body.GetProperty("entries").EnumerateArray().ToList();
        Assert.Contains(entries, e => e.GetProperty("kind").GetString() == "lesson");
    }

    [Fact]
    public async Task Source_of_every_demo_is_available()
    {
        for (var n = 1; n <= 26; n++)
        {
            var res = await _client.GetAsync($"/api/demos/{n}/source");
            Assert.True(res.IsSuccessStatusCode, $"no source for demo {n}");
            Assert.Contains(": IDemo", await res.Content.ReadAsStringAsync());
        }
    }

    [Fact]
    public async Task Every_concept_has_an_animation_and_a_mini_game()
    {
        Assert.Contains("window.Lab", await _client.GetStringAsync("/viz/lab.js"));
        for (var n = 1; n <= 26; n++)
        {
            var res = await _client.GetAsync($"/viz/c{n:00}.js");
            Assert.True(res.IsSuccessStatusCode, $"viz/c{n:00}.js is missing");
            var js = await res.Content.ReadAsStringAsync();
            Assert.Contains($"Lab.define({n},", js);
            Assert.Contains("watch:", js);
            Assert.Contains("play:", js);
            Assert.Contains("steps:", js);                  // the Watch tab is a stepped lesson
            Assert.Contains("await k.step()", js);
            Assert.DoesNotContain("setTimeout(", js);       // scenes must use the kit's pausable clock
            Assert.DoesNotContain("setInterval(", js);
            Assert.DoesNotContain("localStorage", js);
        }
    }

    [Fact]
    public async Task Unknown_demo_is_404()
    {
        var res = await _client.PostAsync("/api/demos/99/run", null);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Too_many_runs_from_one_client_get_429_with_retry_after()
    {
        using var limited = factory.WithWebHostBuilder(b => b.UseSetting("Lab:RunsPerMinutePerClient", "2")).CreateClient();
        HttpResponseMessage? last = null;
        for (var i = 0; i < 3; i++) last = await limited.PostAsync("/api/demos/1/run", null);

        Assert.Equal(HttpStatusCode.TooManyRequests, last!.StatusCode);
        Assert.True(last.Headers.Contains("Retry-After"));
    }
}
