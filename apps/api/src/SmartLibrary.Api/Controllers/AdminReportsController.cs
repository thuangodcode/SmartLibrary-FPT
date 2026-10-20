using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Reports;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/admin/reports")]
[Authorize(Policy = "AdminOnly")]
public sealed class AdminReportsController(ReportService reports) : ControllerBase
{
    private Guid UserId => Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet]
    public async Task<ActionResult<ApiResponse<ReportListDto>>> List([FromQuery] string? search, [FromQuery] string? month, [FromQuery] string? status, [FromQuery] string? format, [FromQuery] string? sortBy, [FromQuery] string? sortDirection, [FromQuery] int page = 1, [FromQuery] int pageSize = 10, CancellationToken ct = default)
        => Ok(ApiResponse<ReportListDto>.Ok(await reports.ListAsync(new ReportQuery(search, month, status, format, sortBy, sortDirection, page, pageSize), ct)));

    [HttpGet("summary")]
    public async Task<ActionResult<ApiResponse<ReportSummaryDto>>> Summary([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
        => Ok(ApiResponse<ReportSummaryDto>.Ok(await reports.SummaryAsync(from, to, ct)));

    [HttpGet("summary/borrow-by-category")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<CategoryBorrowDto>>>> BorrowByCategory([FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CategoryBorrowDto>>.Ok(await reports.BorrowByCategoryAsync(from, to, ct)));

    [HttpGet("templates")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TemplateDto>>>> Templates(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<TemplateDto>>.Ok(await reports.TemplatesAsync(ct)));

    [HttpGet("templates/{id:guid}")]
    public async Task<ActionResult<ApiResponse<TemplateDto>>> TemplateDetail(Guid id, CancellationToken ct)
    {
        var template = await reports.TemplateDetailAsync(id, ct);
        return template is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy mẫu báo cáo.")) : Ok(ApiResponse<TemplateDto>.Ok(template));
    }

    [HttpPost("templates")]
    public async Task<ActionResult<ApiResponse<TemplateDto>>> CreateTemplate(CreateTemplateRequest request, CancellationToken ct)
        => Ok(ApiResponse<TemplateDto>.Ok(await reports.SaveTemplateAsync(null, new TemplateWriteRequest(request.Name, request.ReportType, request.Description, request.Configuration, request.IsEnabled), UserId, ct)));

    [HttpPut("templates/{id:guid}")]
    public async Task<ActionResult<ApiResponse<TemplateDto>>> UpdateTemplate(Guid id, UpdateTemplateRequest request, CancellationToken ct)
    {
        var result = await reports.UpdateTemplateAsync(id, new TemplateWriteRequest(request.Name, request.ReportType, request.Description, request.Configuration, request.IsEnabled), UserId, ct);
        return result is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy mẫu báo cáo.")) : Ok(ApiResponse<TemplateDto>.Ok(result));
    }

    [HttpDelete("templates/{id:guid}")]
    public async Task<IActionResult> DeleteTemplate(Guid id, CancellationToken ct)
    { if (!await reports.DeleteTemplateAsync(id, ct)) return NotFound(ApiResponse<object>.Fail("Không tìm thấy mẫu báo cáo.")); return NoContent(); }

    [HttpPost("templates/{id:guid}/duplicate")]
    public async Task<ActionResult<ApiResponse<TemplateDto>>> DuplicateTemplate(Guid id, CancellationToken ct)
    {
        var copy = await reports.DuplicateTemplateAsync(id, UserId, ct);
        return copy is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy mẫu báo cáo.")) : Ok(ApiResponse<TemplateDto>.Ok(copy));
    }

    [HttpPost]
    public async Task<ActionResult<ApiResponse<ReportDetailDto>>> Create(CreateReportRequest request, CancellationToken ct)
        => Ok(ApiResponse<ReportDetailDto>.Ok(await reports.CreateAsync(request, UserId, ct)));

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ApiResponse<ReportDetailDto>>> Detail(Guid id, CancellationToken ct)
    {
        var report = await reports.DetailAsync(id, ct);
        return report is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy báo cáo.")) : Ok(ApiResponse<ReportDetailDto>.Ok(report));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateReportRequest request, CancellationToken ct)
    { await reports.UpdateAsync(id, request, UserId, ct); return NoContent(); }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    { if (!await reports.DeleteAsync(id, ct)) return NotFound(ApiResponse<object>.Fail("Không tìm thấy báo cáo.")); return NoContent(); }

    [HttpPost("bulk-delete")]
    public async Task<IActionResult> BulkDelete([FromBody] Guid[] ids, CancellationToken ct)
    {
        if (ids.Length == 0) return BadRequest(ApiResponse<object>.Fail("Chọn ít nhất một báo cáo."));
        if (ids.Length > 100) return BadRequest(ApiResponse<object>.Fail("Mỗi lần chỉ có thể xóa tối đa 100 báo cáo."));
        var rows = await reports.FindReportsAsync(ids, ct);
        rows.ToList().ForEach(x => x.IsDeleted = true); await reports.SaveChangesAsync(ct); return NoContent();
    }

    [HttpPost("bulk-export")]
    public async Task<IActionResult> BulkExport([FromBody] Guid[] ids, CancellationToken ct)
    {
        if (ids.Length == 0) return BadRequest(ApiResponse<object>.Fail("Chọn ít nhất một báo cáo."));
        if (ids.Length > 100) return BadRequest(ApiResponse<object>.Fail("Mỗi lần chỉ có thể xuất tối đa 100 báo cáo."));
        var reportsToExport = await reports.FindReportDetailsAsync(ids, ct);
        var builder = new System.Text.StringBuilder("\uFEFFMã báo cáo,Tên báo cáo,Thủ thư,Kỳ bắt đầu,Kỳ kết thúc,Ngày,Nhóm sách,Mượn,Trả,Quá hạn,Đã trả,Ghi chú\r\n");
        foreach (var report in reportsToExport)
            foreach (var row in report.Rows)
                builder.AppendLine($"{Escape(report.Code)},{Escape(report.Name)},{Escape(report.Submitter)},{report.PeriodStart:dd/MM/yyyy},{report.PeriodEnd:dd/MM/yyyy},{row.Date:dd/MM/yyyy},{Escape(row.Category)},{row.Borrowed},{row.Returned},{row.Overdue},{row.ReturnedCount},{Escape(row.Notes ?? string.Empty)}");
        return File(System.Text.Encoding.UTF8.GetBytes(builder.ToString()), "text/csv; charset=utf-8", "bao-cao-da-chon.csv");
    }

    [HttpGet("export")]
    public async Task<IActionResult> Export([FromQuery] string format, [FromQuery] DateTime? from, [FromQuery] DateTime? to, CancellationToken ct)
    {
        var summary = await reports.SummaryAsync(from, to, ct);
        if (!string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase)) return BadRequest(ApiResponse<object>.Fail("Xuất thống kê tổng hợp hiện hỗ trợ CSV."));
        var categories = await reports.BorrowByCategoryAsync(from, to, ct);
        var csv = "\uFEFFChỉ số,Giá trị\r\nSách mượn," + summary.Borrowed + "\r\nSách trả," + summary.Returned + "\r\nTỷ lệ trả đúng hạn," + summary.ReturnedOnTimeRate + "%\r\nPhí đã thu," + summary.FineRevenue + "\r\nSố giao dịch phí," + summary.FineTransactions + "\r\n\r\nNhóm sách,Lượt mượn,Tỷ trọng\r\n" +
            string.Join("\r\n", categories.Select(x => $"{Escape(x.Category)},{x.Count},{x.Percent}%"));
        return File(System.Text.Encoding.UTF8.GetBytes(csv), "text/csv; charset=utf-8", "smartlibrary-report.csv");
    }

    [HttpGet("{id:guid}/export")]
    public async Task<IActionResult> ExportDetail(Guid id, [FromQuery] string format, CancellationToken ct)
    {
        var report = await reports.DetailAsync(id, ct);
        if (report is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy báo cáo."));
        if (!string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase)) return BadRequest(ApiResponse<object>.Fail("Bản xuất báo cáo hiện hỗ trợ CSV."));
        var csv = new System.Text.StringBuilder("\uFEFFMã báo cáo,Tên báo cáo,Thủ thư,Kỳ bắt đầu,Kỳ kết thúc\r\n");
        csv.AppendLine($"{Escape(report.Code)},{Escape(report.Name)},{Escape(report.Submitter)},{report.PeriodStart:dd/MM/yyyy},{report.PeriodEnd:dd/MM/yyyy}");
        csv.AppendLine(); csv.AppendLine("Ngày,Nhóm sách,Mượn,Trả,Quá hạn,Đã trả,Ghi chú");
        foreach (var row in report.Rows) csv.AppendLine($"{row.Date:dd/MM/yyyy},{Escape(row.Category)},{row.Borrowed},{row.Returned},{row.Overdue},{row.ReturnedCount},{Escape(row.Notes ?? string.Empty)}");
        return File(System.Text.Encoding.UTF8.GetBytes(csv.ToString()), "text/csv; charset=utf-8", $"{report.Code}.csv");
    }

    private static string Escape(string value) => "\"" + value.Replace("\"", "\"\"") + "\"";
}
