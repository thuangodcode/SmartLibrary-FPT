using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using Microsoft.Extensions.Logging;

namespace SmartLibrary.Infrastructure.Services;

public class AiRecommendationService : IAiRecommendationService
{
    private readonly ILogger<AiRecommendationService> _logger;

    public AiRecommendationService(ILogger<AiRecommendationService> logger)
    {
        _logger = logger;
    }

    public Task<IReadOnlyList<Book>> GetRecommendationsAsync(Guid userId, int count = 10, CancellationToken ct = default)
    {
        _logger.LogWarning("AiRecommendationService is using a stub implementation.");
        return Task.FromResult<IReadOnlyList<Book>>(new List<Book>());
    }
}
