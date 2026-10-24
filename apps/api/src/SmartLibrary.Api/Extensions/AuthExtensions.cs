using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Extensions;

public static class AuthExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ValidateIssuerSigningKey = false,
                    ValidateLifetime = false,
                    SignatureValidator = (token, _) => new Microsoft.IdentityModel.JsonWebTokens.JsonWebToken(token)
                };

                options.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        if (context.HttpContext.Request.Path.StartsWithSegments("/hubs/support-chat"))
                        {
                            var accessToken = context.Request.Query["access_token"];
                            if (!string.IsNullOrEmpty(accessToken))
                                context.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var authorizationHeader = context.HttpContext.Request.Headers.Authorization.ToString();
                        var rawToken = authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                            ? authorizationHeader["Bearer ".Length..].Trim()
                            : context.HttpContext.Request.Path.StartsWithSegments("/hubs/support-chat")
                                ? context.Request.Query["access_token"].ToString()
                                : null;
                        var identity = context.Principal?.Identity as ClaimsIdentity;
                        if (string.IsNullOrWhiteSpace(rawToken) || identity is null)
                        {
                            context.Fail("The access token could not be validated.");
                            return;
                        }

                        try
                        {
                            var identityProvider = context.HttpContext.RequestServices
                                .GetRequiredService<IIdentityProvider>();
                            var userId = await identityProvider.GetAuthenticatedUserIdAsync(
                                rawToken,
                                context.HttpContext.RequestAborted);
                            var tokenSubject = identity.FindFirst("sub")?.Value
                                ?? identity.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                            if (userId is null || !string.Equals(userId, tokenSubject, StringComparison.OrdinalIgnoreCase))
                            {
                                context.Fail("The access token is not valid for this user.");
                                return;
                            }

                            var role = await identityProvider.GetActiveUserRoleAsync(userId);
                            if (role is null)
                            {
                                context.Fail("The user account is inactive or has no assigned role.");
                                return;
                            }

                            foreach (var claim in identity.Claims.Where(claim => claim.Type == ClaimTypes.Role).ToArray())
                                identity.RemoveClaim(claim);
                            foreach (var claim in identity.Claims.Where(claim => claim.Type == "role").ToArray())
                                identity.RemoveClaim(claim);
                            foreach (var claim in identity.Claims.Where(claim => claim.Type == ClaimTypes.NameIdentifier).ToArray())
                                identity.RemoveClaim(claim);

                            identity.AddClaim(new Claim(ClaimTypes.NameIdentifier, userId));
                            identity.AddClaim(new Claim(ClaimTypes.Role, role));
                            identity.AddClaim(new Claim("role", role));
                        }
                        catch (Exception exception)
                        {
                            context.HttpContext.RequestServices
                                .GetRequiredService<ILoggerFactory>()
                                .CreateLogger("SupabaseTokenValidation")
                                .LogError(exception, "Supabase token validation failed.");
                            context.Fail("The identity provider could not validate the access token.");
                        }
                    }
                };
            });

        services.AddAuthorizationBuilder()
            .AddPolicy("ReaderOnly", policy => policy.RequireRole("Reader", "Librarian", "Admin"))
            .AddPolicy("LibrarianOnly", policy => policy.RequireRole("Librarian", "Admin"))
            .AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));

        return services;
    }
}
