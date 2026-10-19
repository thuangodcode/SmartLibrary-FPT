using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Statistics;
using SmartLibrary.Application.Features.Statistics.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize(Policy = "LibrarianOnly")]
public class DashboardController : ControllerBase
{
    private readonly DashboardService _dashboardService;

    public DashboardController(DashboardService dashboardService)
    {
        _dashboardService = dashboardService;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats(CancellationToken ct = default)
    {
        var data = await _dashboardService.GetLibrarianStatsAsync(ct);
        return Ok(ApiResponse<LibrarianDashboardStatsDto>.Ok(data));
    }

    [Authorize(Policy = "AdminOnly")]
    [HttpGet("admin-overview")]
    public async Task<IActionResult> GetAdminOverview(CancellationToken ct = default)
    {
        var data = await _dashboardService.GetAdminOverviewAsync(ct);
        return Ok(ApiResponse<AdminOverviewDto>.Ok(data));
    }
}
