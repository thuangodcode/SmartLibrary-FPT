using Microsoft.Extensions.Logging;

namespace SmartLibrary.Infrastructure.Supabase;

/// <summary>
/// Wrapper for Supabase client configuration and initialization.
/// </summary>
public class SupabaseClientProvider
{
    private readonly ILogger<SupabaseClientProvider> _logger;
    private global::Supabase.Client? _client;

    public SupabaseClientProvider(ILogger<SupabaseClientProvider> logger)
    {
        _logger = logger;
    }

    public async Task<global::Supabase.Client> GetClientAsync(string url, string key)
    {
        if (_client is not null)
            return _client;

        _client = new global::Supabase.Client(url, key);
        await _client.InitializeAsync();

        _logger.LogInformation("Supabase client initialized for {Url}", url);
        return _client;
    }
}
