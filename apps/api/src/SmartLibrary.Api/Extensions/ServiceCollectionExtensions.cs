using FluentValidation;
using FluentValidation.AspNetCore;
using SmartLibrary.Application.Features.Auth.Services;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Categories;
using SmartLibrary.Application.Features.Statistics;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Reports;
using SmartLibrary.Application.Features.Regulations;
using SmartLibrary.Application.Features.Users;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Application.Mapping;

namespace SmartLibrary.Api.Extensions;

/// <summary>
/// Registers application-layer services (AutoMapper, FluentValidation, business services).
/// </summary>
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        // AutoMapper
        services.AddAutoMapper(cfg => cfg.AddProfile<MappingProfile>());

        // FluentValidation
        services.AddValidatorsFromAssemblyContaining<MappingProfile>();
        services.AddFluentValidationAutoValidation();

        // Business services
        services.AddScoped<BookService>();
        services.AddScoped<IBookReviewService, BookReviewService>();
        services.AddScoped<CategoryService>();
        services.AddScoped<DashboardService>();
        services.AddScoped<ReaderService>();
        services.AddScoped<PolicyRuleService>();
        services.AddScoped<ReportService>();
        services.AddScoped<RegulationService>();
        services.AddScoped<CirculationService>();
        services.AddScoped<AiSettingsService>();
        services.AddScoped<AiInsightsService>();
        services.AddScoped<RagService>();
        services.AddScoped<INotificationInbox, NotificationInbox>();
        services.AddScoped<IRegistrationService, RegistrationService>();
        services.AddScoped<IAuthOtpService, AuthOtpService>();

        return services;
    }
}
