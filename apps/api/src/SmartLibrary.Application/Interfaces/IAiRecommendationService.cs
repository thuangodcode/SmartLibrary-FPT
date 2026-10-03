using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Interfaces;

public interface IAiRecommendationService
{
    Task<IReadOnlyList<Book>> GetRecommendationsAsync(Guid userId, int count = 10, CancellationToken ct = default);
}
