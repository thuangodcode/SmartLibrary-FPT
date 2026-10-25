using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Extensions;

public static class AuthExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services, IConfiguration configuration)
    {
        var supabaseAuth = $"{(configuration["Supabase:Url"] ?? configuration["Jwt:Issuer"] ?? string.Empty).TrimEnd('/')}"
            .Replace("/auth/v1", string.Empty, StringComparison.OrdinalIgnoreCase)
            .TrimEnd('/') + "/auth/v1";
        var issuer = configuration["Jwt:Issuer"];
        if (string.IsNullOrWhiteSpace(issuer))
            issuer = supabaseAuth;
        var audience = configuration["Jwt:Audience"];
        if (string.IsNullOrWhiteSpace(audience))
            audience = "authenticated";

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.MapInboundClaims = false;
                options.RequireHttpsMetadata = supabaseAuth.StartsWith("https://", StringComparison.OrdinalIgnoreCase);
                options.MetadataAddress = $"{supabaseAuth}/.well-known/openid-configuration";
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = audience,
                    ValidateIssuerSigningKey = true,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromMinutes(1),
                    NameClaimType = "sub",
                    RoleClaimType = ClaimTypes.Role
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
                        var identity = context.Principal?.Identity as ClaimsIdentity;
                        var userId = identity?.FindFirst("sub")?.Value
                            ?? identity?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                        if (identity is null || string.IsNullOrWhiteSpace(userId))
                        {
                            context.Fail("The access token could not be validated.");
                            return;
                        }

                        try
                        {
                            var identityProvider = context.HttpContext.RequestServices
                                .GetRequiredService<IIdentityProvider>();
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
                                .LogError(exception, "JWT role lookup failed.");
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
