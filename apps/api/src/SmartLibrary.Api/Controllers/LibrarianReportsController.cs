using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Reports;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/librarian/reports")]
[Authorize(Policy = "LibrarianOnly")]
public sealed class LibrarianReportsController(ReportService reports) : ControllerBase
{
    [HttpGet("templates")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TemplateDto>>>> Templates(CancellationToken ct)
    {
        var templates = await reports.TemplatesAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<TemplateDto>>.Ok(templates.Where(x => x.IsEnabled).ToList()));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ReportDetailDto>>> Submit(CreateReportRequest request, CancellationToken ct)
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        return Ok(ApiResponse<ReportDetailDto>.Ok(await reports.CreateAsync(request, id, ct)));
    }
}
