using SmartLibrary.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace SmartLibrary.Infrastructure.Services;

/// <summary>
/// Stub AI embedding service – replace with actual OpenAI/Azure implementation.
/// </summary>
public class AiEmbeddingService : IAiEmbeddingService
{
    private readonly ILogger<AiEmbeddingService> _logger;

    public AiEmbeddingService(ILogger<AiEmbeddingService> logger)
    {
        _logger = logger;
    }

    public Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct = default)
    {
        _logger.LogWarning("AiEmbeddingService is using a stub implementation. Configure a real provider.");
        // Return a dummy 1536-dimensional vector
        return Task.FromResult(new float[1536]);
    }
}
