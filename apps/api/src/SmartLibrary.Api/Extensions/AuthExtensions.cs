using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace SmartLibrary.Api.Extensions;

public static class AuthExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                var secret = configuration["Jwt:Secret"] ?? "your-supabase-jwt-secret-at-least-32-characters-long";
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateIssuerSigningKey = false,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                    ValidateLifetime = false,
                    SignatureValidator = (token, _) => new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(token)
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy("ReaderOnly", policy => policy.RequireRole("reader", "librarian", "admin"))
            .AddPolicy("LibrarianOnly", policy => policy.RequireRole("librarian", "admin"))
            .AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));

        return services;
    }
}
