using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Reports;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/librarian/reports")]
[Authorize(Policy = "LibrarianOnly")]
public sealed class LibrarianReportsController(ReportService reports) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("templates")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TemplateDto>>>> Templates(CancellationToken ct)
    {
        var templates = await reports.TemplatesAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<TemplateDto>>.Ok(templates.Where(x => x.IsEnabled).ToList()));
    }

    [HttpGet("templates/{id:guid}")]
    public async Task<ActionResult<ApiResponse<TemplateDto>>> TemplateDetail(Guid id, CancellationToken ct)
    {
        var template = await reports.TemplateDetailAsync(id, ct);
        return template is null || !template.IsEnabled
            ? NotFound(ApiResponse<object>.Fail("Không tìm thấy mẫu báo cáo."))
            : Ok(ApiResponse<TemplateDto>.Ok(template));
    }

    [HttpGet("requests")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ReportRequestDto>>>> Requests(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<ReportRequestDto>>.Ok(await reports.ReportRequestsAsync(UserId, false, ct)));

    [HttpPost("validate")]
    public async Task<ActionResult<ApiResponse<ValidateReportRowsResult>>> Validate(ValidateReportRowsRequest request, CancellationToken ct)
    {
        try
        {
            return Ok(ApiResponse<ValidateReportRowsResult>.Ok(await reports.ValidateRowsAsync(request, ct)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<object>.Fail(ex.Message));
        }
    }

    [HttpGet]
    public async Task<ActionResult<ApiResponse<ReportListDto>>> List([FromQuery] string? search, [FromQuery] string? month, [FromQuery] string? status, [FromQuery] string? format, [FromQuery] string? sortBy, [FromQuery] string? sortDirection, [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default)
        => Ok(ApiResponse<ReportListDto>.Ok(await reports.ListAsync(new ReportQuery(search, month, status, format, sortBy, sortDirection, page, pageSize, UserId), ct)));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ReportDetailDto>>> Detail(Guid id, CancellationToken ct)
    {
        var report = await reports.DetailAsync(id, ct, UserId);
        return report is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy báo cáo.")) : Ok(ApiResponse<ReportDetailDto>.Ok(report));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ReportDetailDto>>> Submit(CreateReportRequest request, CancellationToken ct)
    {
        try
        {
            return Ok(ApiResponse<ReportDetailDto>.Ok(await reports.CreateAsync(request, UserId, ct)));
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(ApiResponse<object>.Fail(ex.Message));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<object>.Fail(ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(ApiResponse<object>.Fail(ex.Message));
        }
        catch (DbUpdateConcurrencyException)
        {
            return Conflict(ApiResponse<object>.Fail("Yêu cầu đã được gửi hoặc xử lý. Tải lại dữ liệu rồi thử lại."));
        }
    }

    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> Export(Guid id, [FromQuery] string format, CancellationToken ct)
    {
        var report = await reports.DetailAsync(id, ct, UserId);
        if (report is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy báo cáo."));
        var csv = new System.Text.StringBuilder("\uFEFFMã báo cáo,Tên báo cáo,Thủ thư,Kỳ bắt đầu,Kỳ kết thúc\r\n");
        csv.AppendLine($"{Escape(report.Code)},{Escape(report.Name)},{Escape(report.Submitter)},{report.PeriodStart:dd/MM/yyyy},{report.PeriodEnd:dd/MM/yyyy}");
        csv.AppendLine(); csv.AppendLine("Ngày,Nhóm sách,Lượt mượn,Lượt trả,Ghi chú");
        foreach (var row in report.Rows) csv.AppendLine($"{row.Date:dd/MM/yyyy},{Escape(row.Category)},{row.Borrowed},{row.Returned},{Escape(row.Notes ?? string.Empty)}");
        return File(System.Text.Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"{report.Code}.csv");
    }

    private static string Escape(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
}
