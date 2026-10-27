using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Moq;
using Npgsql;
using SmartLibrary.Api.Controllers;
using SmartLibrary.Api.Extensions;
using SmartLibrary.Api.Middlewares;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.IntegrationTests;

[CollectionDefinition("Workflow database")]
public sealed class WorkflowCollection : ICollectionFixture<WorkflowFixture> { }

/// <summary>Real controllers, services and EF mappings; external providers and identity are test doubles.
/// Deliberately does not execute Program startup migrations or load repository .env.
/// This is API integration coverage, not Supabase login or deployed browser E2E evidence.</summary>
public sealed class WorkflowFixture : IAsyncLifetime
{
    private WebApplication _app = null!;
    private string _connection = "";
    public readonly Mock<IPayOSPaymentGateway> PayOS = new();
    public readonly Mock<IStorageService> Storage = new();
    public readonly Mock<IEmailService> Email = new();
    public Guid ReaderId { get; } = Guid.NewGuid();
    public Guid LibrarianId { get; } = Guid.NewGuid();
    public Guid AdminId { get; } = Guid.NewGuid();
    public Guid ReaderRoleId { get; } = Guid.NewGuid();
    public string DatabaseName { get; } = "smartlibrary_test_" + Guid.NewGuid().ToString("N");

    public AppDbContext Db() => new(new DbContextOptionsBuilder<AppDbContext>()
        .UseNpgsql(_connection).UseSnakeCaseNamingConvention().Options);

    public HttpClient Client(string? role = null, Guid? id = null)
    {
        var client = _app.GetTestClient();
        if (role != null)
        {
            client.DefaultRequestHeaders.Add("X-Test-Role", role);
            client.DefaultRequestHeaders.Add("X-Test-User", (id ?? (role == "Reader" ? ReaderId : role == "Admin" ? AdminId : LibrarianId)).ToString());
        }
        return client;
    }

    public async Task InitializeAsync()
    {
        var source = Environment.GetEnvironmentVariable("SMARTLIBRARY_TEST_POSTGRES")
            ?? throw new InvalidOperationException("Set SMARTLIBRARY_TEST_POSTGRES to a disposable localhost PostgreSQL server. See tests/README.md.");
        var cs = new NpgsqlConnectionStringBuilder(source);
        if (cs.Host is not ("127.0.0.1" or "localhost" or "::1"))
            throw new InvalidOperationException("Integration tests require localhost; shared databases are refused.");
        cs.Database = DatabaseName;
        _connection = cs.ConnectionString;
        await using (var db = Db())
        {
            await db.Database.EnsureCreatedAsync();
            // The production SQL paths cast these names. ORM-generated test columns are text;
            // actual production migrations and pgvector indexing are outside this fixture's coverage.
            await db.Database.ExecuteSqlRawAsync("CREATE DOMAIN reservation_status AS text; CREATE DOMAIN borrow_status AS text; CREATE DOMAIN book_condition AS text;");
            var rr = new Role { Id = ReaderRoleId, Name = "Reader" };
            var lr = new Role { Name = "Librarian" };
            var ar = new Role { Name = "Admin" };
            db.AddRange(rr, lr, ar);
            db.AddRange(
                new UserProfile { Id = ReaderId, Role = rr, FullName = "Test Reader", Email = "reader@example.test", Status = AccountStatus.Active },
                new UserProfile { Id = LibrarianId, Role = lr, FullName = "Test Librarian", Email = "librarian@example.test", Status = AccountStatus.Active },
                new UserProfile { Id = AdminId, Role = ar, FullName = "Test Admin", Email = "admin@example.test", Status = AccountStatus.Active });
            AddPolicy(db, PolicyRuleType.BorrowLimit, ("max_books", "100"));
            AddPolicy(db, PolicyRuleType.BorrowDuration, ("max_days", "14"));
            AddPolicy(db, PolicyRuleType.Renewal, ("max_renewals", "2"), ("renewal_days", "7"));
            AddPolicy(db, PolicyRuleType.FineFee, ("overdue_fee_per_day", "5000"), ("damage_fee", "10000"), ("lost_book_fee", "200000"));
            await db.SaveChangesAsync();
        }
        PayOS.SetupGet(x => x.IsConfigured).Returns(true);
        PayOS.Setup(x => x.CreateCheckoutAsync(It.IsAny<Guid>(), It.IsAny<long>(), It.IsAny<long>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid fine, long order, long amount, string desc, CancellationToken ct) =>
                new PayOSCheckoutResult("link-" + order, "https://payments.example.test/" + order, "test-qr", DateTime.UtcNow.AddMinutes(15)));
        PayOS.Setup(x => x.GetCheckoutStatusAsync(It.IsAny<long>(), It.IsAny<CancellationToken>())).ReturnsAsync("Pending");
        PayOS.Setup(x => x.VerifyWebhookAsync(It.IsAny<PayOSWebhookEnvelope>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((PayOSWebhookEnvelope value, CancellationToken ct) => value.Data);
        Email.Setup(x => x.SendEmailAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>())).ReturnsAsync(true);
        Storage.Setup(x => x.UploadFileAsync(It.IsAny<Stream>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("https://media.example.test/identity.png");

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Configuration.Sources.Clear();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = _connection });
        builder.WebHost.UseTestServer();
        builder.Logging.ClearProviders();
        builder.Services.AddControllers().AddApplicationPart(typeof(BooksController).Assembly)
            .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        builder.Services.AddApplicationServices();
        builder.Services.AddInfrastructure(builder.Configuration);
        builder.Services.RemoveAll<IHostedService>();
        builder.Services.AddSignalR();
        builder.Services.AddMemoryCache();
        builder.Services.AddScoped<SmartLibrary.Application.Features.Notifications.INotificationRealtimePublisher,
            SmartLibrary.Api.Services.SignalRNotificationPublisher>();
        builder.Services.AddJwtAuthentication(builder.Configuration);
        builder.Services.AddAuthentication(o => { o.DefaultAuthenticateScheme = "Test"; o.DefaultChallengeScheme = "Test"; o.DefaultForbidScheme = "Test"; })
            .AddScheme<AuthenticationSchemeOptions, TestAuthentication>("Test", _ => { });
        builder.Services.AddSingleton(PayOS.Object);
        builder.Services.AddSingleton(Storage.Object);
        builder.Services.AddSingleton(Email.Object);
        _app = builder.Build();
        _app.UseMiddleware<GlobalExceptionMiddleware>();
        _app.UseAuthentication();
        _app.UseAuthorization();
        _app.MapControllers();
        await _app.StartAsync();
    }

    private static void AddPolicy(AppDbContext db, PolicyRuleType type, params (string Key, string Value)[] parameters)
        => db.PolicyRules.Add(new PolicyRule { Code = "TEST-" + (int)type, Name = "Test " + type, PolicyType = type,
            Status = PolicyRuleStatus.Active, Parameters = parameters.Select(x => new PolicyRuleParameter { ParamKey = x.Key, ParamValue = x.Value }).ToList() });

    public async Task<(Guid BookId, Guid CopyId, string Barcode)> BookAsync()
    {
        await using var db = Db();
        var book = new Book { Code = "T" + Guid.NewGuid().ToString("N")[..12], Title = "Report 5 test book", Language = "vi", TotalCopies = 1, AvailableCopies = 1 };
        var copy = new BookCopy { Book = book, Barcode = book.Code + "-01", Condition = BookCondition.Good, IsAvailable = true };
        db.Add(copy);
        await db.SaveChangesAsync();
        return (book.Id, copy.Id, copy.Barcode);
    }

    public async Task<Guid> NewReaderAsync()
    {
        await using var db = Db();
        var reader = new UserProfile { RoleId = ReaderRoleId, FullName = "Isolated test reader",
            Email = Guid.NewGuid() + "@example.test", Status = AccountStatus.Active };
        db.Add(reader);
        await db.SaveChangesAsync();
        return reader.Id;
    }

    public async Task DisposeAsync()
    {
        if (_app != null) await _app.DisposeAsync();
        if (!string.IsNullOrEmpty(_connection))
        {
            await using var db = Db();
            await db.Database.EnsureDeletedAsync();
        }
    }
}

public sealed class TestAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue("X-Test-Role", out var role) || !Guid.TryParse(Request.Headers["X-Test-User"], out var id))
            return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity(new[] { new Claim(ClaimTypes.NameIdentifier, id.ToString()), new Claim("sub", id.ToString()), new Claim(ClaimTypes.Role, role.ToString()) }, "Test");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), "Test")));
    }
}
