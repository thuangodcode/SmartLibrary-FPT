using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.IntegrationTests;

public sealed class NfrProbeTests
{
    [NfrFact]
    [Trait("Category", "Performance")]
    public async Task LocalHttpReadWorkload_RecordsLatencyAndConcurrency()
    {
        // Opt-in experiment, not a timing assertion in ordinary CI.
        var output = Environment.GetEnvironmentVariable("REPORT5_NFR_OUTPUT")
            ?? throw new InvalidOperationException("Set REPORT5_NFR_OUTPUT outside production data directories.");
        var fixture = new WorkflowFixture { UseNetwork = true };
        await fixture.InitializeAsync();
        try
        {
            await using (var db = fixture.Db())
            {
                for (var i = 0; i < 1000; i++)
                {
                    var book = new Book { Code = $"NFR-{i:D5}", Title = $"Performance catalog book {i:D5}",
                        TotalCopies = 4, AvailableCopies = 4 };
                    for (var j = 0; j < 4; j++)
                        book.Copies.Add(new BookCopy { Barcode = $"NFR-{i:D5}-{j}", Condition = BookCondition.Good, Location = "TEST-A1" });
                    db.Add(book);
                }
                await db.SaveChangesAsync();
            }
            using var client = fixture.Client("Librarian");
            client.Timeout = TimeSpan.FromSeconds(30);
            string[] routes = ["/api/v1/books?page=1&pageSize=20", "/api/v1/books?page=10&pageSize=20", "/api/v1/copies/summary"];
            for (var i = 0; i < 60; i++)
                using (var warmup = await client.GetAsync(routes[i % routes.Length]))
                    Assert.True(warmup.IsSuccessStatusCode, $"Warmup {routes[i % routes.Length]}: {await warmup.Content.ReadAsStringAsync()}");
            var samples = new ConcurrentBag<object>();
            var summaries = new List<object>();
            foreach (var concurrency in new[] { 1, 10, 50, 100 })
            {
                var latencies = new ConcurrentBag<double>();
                var errors = 0;
                var watch = Stopwatch.StartNew();
                await Parallel.ForEachAsync(Enumerable.Range(0, 1200), new ParallelOptions { MaxDegreeOfParallelism = concurrency }, async (i, ct) =>
                {
                    var route = routes[i % routes.Length];
                    var requestWatch = Stopwatch.StartNew();
                    var status = 0;
                    try
                    {
                        using var response = await client.GetAsync(route, ct);
                        await response.Content.ReadAsByteArrayAsync(ct);
                        status = (int)response.StatusCode;
                        if (!response.IsSuccessStatusCode) Interlocked.Increment(ref errors);
                    }
                    catch (HttpRequestException) { Interlocked.Increment(ref errors); }
                    catch (TaskCanceledException) { Interlocked.Increment(ref errors); }
                    var ms = requestWatch.Elapsed.TotalMilliseconds;
                    latencies.Add(ms);
                    samples.Add(new { concurrency, request = i, route, status, milliseconds = ms });
                });
                watch.Stop();
                var sorted = latencies.Order().ToArray();
                double Percentile(double q) => sorted[(int)Math.Ceiling(q * sorted.Length) - 1];
                summaries.Add(new { concurrency, requests = sorted.Length, errors,
                    seconds = watch.Elapsed.TotalSeconds, requestsPerSecond = sorted.Length / watch.Elapsed.TotalSeconds,
                    meanMs = sorted.Average(), p50Ms = Percentile(.5), p95Ms = Percentile(.95), p99Ms = Percentile(.99), maxMs = sorted[^1] });
            }
            var evidence = new { capturedUtc = DateTimeOffset.UtcNow, framework = RuntimeInformation.FrameworkDescription,
                os = RuntimeInformation.OSDescription, architecture = RuntimeInformation.OSArchitecture.ToString(), logicalProcessors = Environment.ProcessorCount,
                catalogTitles = 1000, physicalCopies = 4000, accounts = 3, loans = 0,
                warmupRequests = 60, protocol = "HTTP loopback Kestrel; no TLS; same process load generator",
                method = "Closed-loop fixed 1200 requests per level; max in-flight 1/10/50/100; 1:1:1 endpoint mix; one run; no think time",
                limitations = "Synthetic small catalog; test auth; mocked providers; no AI/browser; not 100 independent user journeys; not production capacity certification",
                summaries, samples };
            await File.WriteAllTextAsync(output, JsonSerializer.Serialize(evidence, new JsonSerializerOptions { WriteIndented = true }));
            Assert.Equal(4800, samples.Count);
        }
        finally { await fixture.DisposeAsync(); }
    }
}

public sealed class NfrFactAttribute : FactAttribute
{
    public NfrFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("REPORT5_RUN_NFR") != "1")
            Skip = "Opt-in local measurement: set REPORT5_RUN_NFR=1 and REPORT5_NFR_OUTPUT. Not a functional pass.";
    }
}
