using Serilog;
using SmartLibrary.Api.Extensions;
using SmartLibrary.Api.Filters;
using SmartLibrary.Api.Middlewares;
using SmartLibrary.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Infrastructure.Persistence;

// Load .env before configuration binds (repo root or API project folder)
static void LoadDotEnv()
{
    var candidates = new[]
    {
        Path.Combine(Directory.GetCurrentDirectory(), ".env"),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../../.env")),
        Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "../../../../.env")),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../.env")),
        Path.Combine(AppContext.BaseDirectory, ".env"),
    };

    foreach (var path in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
    {
        if (!File.Exists(path)) continue;
        DotNetEnv.Env.Load(path);
        Console.WriteLine($"[config] Loaded .env from {path}");
        return;
    }

    Console.WriteLine("[config] No .env file found. Using appsettings / process environment only.");
}

LoadDotEnv();

var builder = WebApplication.CreateBuilder(args);

// ── Serilog ──
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console()
    .WriteTo.File("logs/log-.txt", rollingInterval: RollingInterval.Day)
    .CreateLogger();

builder.Host.UseSerilog();

// ── Services ──
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ValidationFilter>();
}).AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddMemoryCache();

// Application services (AutoMapper, FluentValidation, business services)
builder.Services.AddApplicationServices();

// Infrastructure (EF Core, Repositories, External services)
builder.Services.AddInfrastructure(builder.Configuration);

// Auth
builder.Services.AddJwtAuthentication(builder.Configuration);

// Swagger
builder.Services.AddSwaggerConfiguration();

// CORS
builder.Services.AddCorsConfiguration(builder.Configuration);

// Health checks
builder.Services.AddHealthChecks();

var app = builder.Build();

// ── Apply Migrations ──
try
{
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        try
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;");
        }
        catch (Exception exSql)
        {
            Log.Warning(exSql, "Could not ensure image_url column on categories table.");
        }

        db.Database.Migrate();
    }
}
catch (Exception ex)
{
    Log.Warning(ex, "Could not apply migrations at startup. The database may not be reachable yet.");
}

// ── Middleware pipeline ──

// Swagger MUST be before GlobalExceptionMiddleware so that swagger.json
// generation errors are not swallowed and turned into a generic 500 response.
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "SmartLibrary API v1");
    c.RoutePrefix = "swagger";
});

app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<GlobalExceptionMiddleware>();

app.UseCors(CorsExtensions.PolicyName);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/api/health-check");
app.MapGet("/", () => Results.Redirect("/swagger"));

app.Run();

