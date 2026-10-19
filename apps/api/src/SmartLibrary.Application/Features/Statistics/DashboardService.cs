using Microsoft.Extensions.Caching.Memory;
using SmartLibrary.Application.Features.Statistics.DTOs;

namespace SmartLibrary.Application.Features.Statistics;

public class DashboardService
{
    private const string LibrarianStatsCacheKey = "librarian_dashboard_stats";
    private static readonly TimeSpan LibrarianStatsCacheDuration = TimeSpan.FromSeconds(30);

    private readonly IDashboardRepository _dashboardRepository;
    private readonly IMemoryCache _cache;

    public DashboardService(IDashboardRepository dashboardRepository, IMemoryCache cache)
    {
        _dashboardRepository = dashboardRepository;
        _cache = cache;
    }

    public async Task<LibrarianDashboardStatsDto> GetLibrarianStatsAsync(CancellationToken ct = default)
    {
        if (_cache.TryGetValue(LibrarianStatsCacheKey, out LibrarianDashboardStatsDto? cached) && cached is not null)
            return cached;

        var stats = await _dashboardRepository.GetLibrarianStatsAsync(ct);
        _cache.Set(LibrarianStatsCacheKey, stats, LibrarianStatsCacheDuration);
        return stats;
    }

    public Task<AdminOverviewDto> GetAdminOverviewAsync(CancellationToken ct = default) =>
        _dashboardRepository.GetAdminOverviewAsync(ct);
}
