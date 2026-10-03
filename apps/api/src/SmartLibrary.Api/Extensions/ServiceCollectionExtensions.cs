using FluentValidation;
using FluentValidation.AspNetCore;
using SmartLibrary.Application.Features.Books;
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
        services.AddAutoMapper(typeof(MappingProfile).Assembly);

        // FluentValidation
        services.AddValidatorsFromAssemblyContaining<MappingProfile>();
        services.AddFluentValidationAutoValidation();

        // Business services
        services.AddScoped<BookService>();
        services.AddScoped<SmartLibrary.Application.Interfaces.IRegistrationService, SmartLibrary.Application.Features.Auth.Services.RegistrationService>();

        return services;
    }
}
