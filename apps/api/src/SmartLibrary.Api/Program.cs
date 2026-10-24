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
            db.Database.ExecuteSqlRaw("""
                CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
                CREATE TABLE IF NOT EXISTS ai_settings (
                    id UUID PRIMARY KEY,
                    encrypted_api_key TEXT,
                    api_key_last4 VARCHAR(8),
                    provider VARCHAR(50) NOT NULL DEFAULT 'gemini',
                    chat_model VARCHAR(100) NOT NULL DEFAULT 'gemini-3.8-flash',
                    embedding_model VARCHAR(100) NOT NULL DEFAULT 'gemini-embedding-001',
                    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    reader_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    librarian_ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    last_tested_at TIMESTAMPTZ,
                    last_test_ok BOOLEAN,
                    last_test_message VARCHAR(500),
                    documents_synced_at TIMESTAMPTZ,
                    document_count INTEGER NOT NULL DEFAULT 0,
                    updated_by UUID,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS rag_documents (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_type VARCHAR(20) NOT NULL,
                    source_id UUID NOT NULL,
                    title VARCHAR(500) NOT NULL,
                    content TEXT NOT NULL,
                    content_hash VARCHAR(64) NOT NULL,
                    embedding extensions.vector(768),
                    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (source_type, source_id)
                );
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS base_url VARCHAR(500);
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS provider_keys_json TEXT;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS recommend_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS trends_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS overdue_predict_enabled BOOLEAN NOT NULL DEFAULT FALSE;
                ALTER TABLE ai_settings ADD COLUMN IF NOT EXISTS librarian_criteria_json TEXT;
                """);
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

