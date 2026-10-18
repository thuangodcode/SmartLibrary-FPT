namespace SmartLibrary.Api.Extensions;

public static class CorsExtensions
{
    public const string PolicyName = "SmartLibraryCors";

    public static IServiceCollection AddCorsConfiguration(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCors(options =>
        {
            options.AddPolicy(PolicyName, builder =>
            {
                var allowedOriginsString = configuration["Cors:AllowedOrigins"];
                var configuredOrigins = string.IsNullOrEmpty(allowedOriginsString)
                    ? Array.Empty<string>()
                    : allowedOriginsString.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

                builder
                    .SetIsOriginAllowed(origin =>
                    {
                        if (string.IsNullOrWhiteSpace(origin)) return false;
                        if (configuredOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)) return true;

                        if (Uri.TryCreate(origin, UriKind.Absolute, out var uri))
                        {
                            if (uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                                uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase))
                            {
                                return true;
                            }

                            if (uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase))
                            {
                                return true;
                            }
                        }

                        return false;
                    })
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }
}
