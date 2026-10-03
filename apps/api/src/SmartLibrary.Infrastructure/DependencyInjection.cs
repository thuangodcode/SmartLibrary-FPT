using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Repositories;
using SmartLibrary.Infrastructure.Services;
using SmartLibrary.Infrastructure.Supabase;

namespace SmartLibrary.Infrastructure;

/// <summary>
/// Register infrastructure services into the DI container.
/// </summary>
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Database
        services.AddDbContext<AppDbContext>(options =>
            options.UseNpgsql(
                configuration.GetConnectionString("DefaultConnection"),
                npgsqlOptions => npgsqlOptions.MigrationsAssembly(typeof(AppDbContext).Assembly.FullName)
            ).UseSnakeCaseNamingConvention()
        );

        // Repositories
        services.AddHttpClient<IIdentityProvider, SupabaseAuthService>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IBookRepository, BookRepository>();

        // Services
        services.AddScoped<IAiEmbeddingService, AiEmbeddingService>();
        services.AddScoped<IAiRecommendationService, AiRecommendationService>();
        services.AddScoped<IEmailService, EmailService>();
        services.AddScoped<IStorageService, StorageService>();
        services.AddScoped<IReportExportService, ReportExportService>();

        // Supabase
        services.AddSingleton<SupabaseClientProvider>();

        return services;
    }
}
