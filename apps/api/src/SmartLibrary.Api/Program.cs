using Serilog;
using SmartLibrary.Api.Extensions;
using SmartLibrary.Api.Filters;
using SmartLibrary.Api.Middlewares;
using SmartLibrary.Infrastructure;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Infrastructure.Persistence;

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
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}
// ── Middleware pipeline ──
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseMiddleware<GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "SmartLibrary API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseCors(CorsExtensions.PolicyName);
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHealthChecks("/health");

app.Run();
