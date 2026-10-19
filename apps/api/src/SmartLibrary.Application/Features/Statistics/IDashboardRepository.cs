using SmartLibrary.Application.Features.Statistics.DTOs;

namespace SmartLibrary.Application.Features.Statistics;

public interface IDashboardRepository
{
    Task<LibrarianDashboardStatsDto> GetLibrarianStatsAsync(CancellationToken ct = default);
    Task<AdminOverviewDto> GetAdminOverviewAsync(CancellationToken ct = default);
}
