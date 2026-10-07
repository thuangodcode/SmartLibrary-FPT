using Microsoft.OpenApi.Models;

namespace SmartLibrary.Api.Extensions;

public static class SwaggerExtensions
{
    public static IServiceCollection AddSwaggerConfiguration(this IServiceCollection services)
    {
        services.AddSwaggerGen(c =>
        {
            c.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "SmartLibrary API",
                Version = "v1",
                Description = "RESTful API cho Hệ thống quản lý thư viện thông minh SmartLibrary"
            });

            // Resolve any duplicate operationId conflicts
            c.ResolveConflictingActions(apiDescriptions => apiDescriptions.First());

            // Use fully-qualified type names to avoid schema conflicts for nested / same-named types
            c.CustomSchemaIds(type => type.FullName?.Replace("+", "."));

            c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
            {
                Description = "Nhập Token vào ô theo định dạng: Bearer {token}",
                Name = "Authorization",
                In = ParameterLocation.Header,
                Type = SecuritySchemeType.ApiKey,
                Scheme = "Bearer"
            });

            c.AddSecurityRequirement(new OpenApiSecurityRequirement
            {
                {
                    new OpenApiSecurityScheme
                    {
                        Reference = new OpenApiReference
                        {
                            Type = ReferenceType.SecurityScheme,
                            Id = "Bearer"
                        }
                    },
                    Array.Empty<string>()
                }
            });
        });

        return services;
    }
}

