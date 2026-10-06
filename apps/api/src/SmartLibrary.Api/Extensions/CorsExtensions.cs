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
                var origins = string.IsNullOrEmpty(allowedOriginsString)
                    ? new[] { "http://localhost:5173", "http://localhost:3000" }
                    : allowedOriginsString.Split(',', StringSplitOptions.RemoveEmptyEntries);

                builder
                    .WithOrigins(origins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });

        return services;
    }
}
