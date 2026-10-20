using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Reports;

public sealed class ReportService(IReportRepository repository)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<ReportListDto> ListAsync(ReportQuery query, CancellationToken ct)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var items = repository.Reports.AsNoTracking().Include(x => x.Submitter).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Search))
            items = items.Where(x => x.Name.Contains(query.Search) || x.Code.Contains(query.Search));
        if (!string.IsNullOrWhiteSpace(query.Status)) items = items.Where(x => x.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.Format)) items = items.Where(x => x.Format == query.Format);
        if (DateTime.TryParse(query.Month, out var month))
        {
            var start = new DateTime(month.Year, month.Month, 1, 0, 0, 0, DateTimeKind.Utc);
            var end = start.AddMonths(1);
            items = items.Where(x => x.CreatedAt >= start && x.CreatedAt < end);
        }
        var count = await items.CountAsync(ct);
        var ordered = (query.SortBy?.ToLowerInvariant(), query.SortDirection?.ToLowerInvariant()) switch
        {
            ("name", "asc") => items.OrderBy(x => x.Name),
            ("name", _) => items.OrderByDescending(x => x.Name),
            ("status", "asc") => items.OrderBy(x => x.Status).ThenByDescending(x => x.CreatedAt),
            ("status", _) => items.OrderByDescending(x => x.Status).ThenByDescending(x => x.CreatedAt),
            ("createdat", "asc") => items.OrderBy(x => x.CreatedAt),
            _ => items.OrderByDescending(x => x.CreatedAt)
        };
        var rows = await ordered.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(x => new ReportListItemDto(x.Id, x.Code, x.Name, x.Submitter.FullName, x.CreatedAt, x.Format, x.Status, x.IsViewed, x.IsApproved)).ToListAsync(ct);
        return new ReportListDto(rows, count, page, pageSize, (int)Math.Ceiling(count / (double)pageSize));
    }

    public async Task<ReportDetailDto?> DetailAsync(Guid id, CancellationToken ct)
    {
        var report = await repository.Reports.AsNoTracking().Include(x => x.Submitter).Include(x => x.Template)
            .Include(x => x.Reviews.Where(review => !review.IsDeleted)).ThenInclude(x => x.Reviewer).FirstOrDefaultAsync(x => x.Id == id, ct);
        return report is null || report.IsDeleted ? null : new ReportDetailDto(report.Id, report.Code, report.Name, report.Submitter.FullName,
            report.Template.Name, report.CreatedAt, report.PeriodStart, report.PeriodEnd, report.Format, report.Status,
            report.IsViewed, report.IsApproved, report.Snapshot,
            report.Reviews.OrderBy(x => x.CreatedAt).Select(x => new ReportReviewDto(x.Action, x.Comment, x.Reviewer.FullName, x.CreatedAt)).ToList(),
            ReadRows(report.Snapshot));
    }

    private static IReadOnlyList<ReportRowDto> ReadRows(string snapshot)
    {
        using var document = JsonDocument.Parse(snapshot);
        if (!document.RootElement.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) return [];
        return JsonSerializer.Deserialize<List<ReportRowDto>>(rows.GetRawText(), JsonOptions) ?? [];
    }

    public async Task<ReportSummaryDto> SummaryAsync(DateTime? from, DateTime? to, CancellationToken ct)
    {
        var start = from?.Date ?? DateTime.UtcNow.Date.AddDays(-29);
        var end = (to?.Date ?? DateTime.UtcNow.Date).AddDays(1);
        var duration = end - start;
        var previousStart = start - duration;
        var loans = repository.BorrowRecords.AsNoTracking();
        var current = loans.Where(x => x.BorrowDate >= start && x.BorrowDate < end);
        var previous = loans.Where(x => x.BorrowDate >= previousStart && x.BorrowDate < start);
        var borrowed = await current.CountAsync(ct);
        var returned = await current.CountAsync(x => x.ReturnDate != null, ct);
        var onTime = await current.CountAsync(x => x.ReturnDate != null && x.DueDate != null && x.ReturnDate <= x.DueDate, ct);
        var returnedPrevious = await previous.CountAsync(x => x.ReturnDate != null, ct);
        var borrowedPrevious = await previous.CountAsync(ct);
        var fines = repository.Fines.AsNoTracking().Where(x => x.PaidAt >= start && x.PaidAt < end && x.Status == SmartLibrary.Domain.Enums.FineStatus.Paid);
        var fineRevenue = await fines.SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var fineCount = await fines.CountAsync(ct);
        var finePreviousQuery = repository.Fines.AsNoTracking().Where(x => x.PaidAt >= previousStart && x.PaidAt < start && x.Status == SmartLibrary.Domain.Enums.FineStatus.Paid);
        var finePrevious = await finePreviousQuery.SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var finePreviousCount = await finePreviousQuery.CountAsync(ct);
        static decimal Change(decimal currentValue, decimal previousValue) => previousValue == 0 ? (currentValue == 0 ? 0 : 100) : Math.Round((currentValue - previousValue) / previousValue * 100, 1);
        return new ReportSummaryDto(start, end.AddDays(-1), borrowed, returned, returned == 0 ? 0 : Math.Round((decimal)onTime / returned * 100, 1),
            Change(borrowed, borrowedPrevious), Change(returned, returnedPrevious), fineRevenue, fineCount, Change(fineCount, finePreviousCount), null, false);
    }

    public async Task<IReadOnlyList<CategoryBorrowDto>> BorrowByCategoryAsync(DateTime? from, DateTime? to, CancellationToken ct)
    {
        var start = from?.Date ?? DateTime.UtcNow.Date.AddDays(-29);
        var end = (to?.Date ?? DateTime.UtcNow.Date).AddDays(1);
        var categories = await repository.BorrowRecords.AsNoTracking().Where(x => x.BorrowDate >= start && x.BorrowDate < end)
            .SelectMany(x => x.BookCopy.Book.Categories.Select(c => c.Name)).GroupBy(name => name)
            .Select(group => new { Category = group.Key, Count = group.Count() }).OrderByDescending(x => x.Count).Take(6).ToListAsync(ct);
        var total = categories.Sum(x => x.Count);
        return categories.Select(x => new CategoryBorrowDto(x.Category, x.Count, total == 0 ? 0 : Math.Round((decimal)x.Count / total * 100, 1))).ToList();
    }

    public async Task<ReportDetailDto> CreateAsync(CreateReportRequest request, Guid userId, CancellationToken ct)
    {
        var periodEndExclusive = request.PeriodEnd.Date;
        if (periodEndExclusive <= request.PeriodStart.Date) throw new ArgumentException("Ngày kết thúc phải sau ngày bắt đầu.");
        if (request.Format is not ("CSV" or "PDF")) throw new ArgumentException("Định dạng chỉ hỗ trợ CSV hoặc PDF.");
        if (!await repository.Users.AnyAsync(x => x.Id == userId && x.IsActive, ct)) throw new ArgumentException("Tài khoản gửi báo cáo không hợp lệ hoặc đã bị khóa.");
        var template = await repository.Templates.FirstOrDefaultAsync(x => x.Id == request.TemplateId && x.IsEnabled && !x.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Không tìm thấy mẫu báo cáo đang bật.");
        using var templateConfiguration = JsonDocument.Parse(template.Configuration);
        if (!templateConfiguration.RootElement.TryGetProperty("formats", out var formats) || formats.ValueKind != JsonValueKind.Array || !formats.EnumerateArray().Any(x => string.Equals(x.GetString(), request.Format, StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException("Định dạng gửi báo cáo chưa được bật trong mẫu.");
        if (request.Format == "PDF") throw new ArgumentException("API xuất PDF chưa được triển khai. Hãy chọn CSV trong mẫu báo cáo.");
        var reportPeriodEnd = periodEndExclusive.AddDays(-1);
        var stats = await SummaryAsync(request.PeriodStart, reportPeriodEnd, ct);
        var categories = await BorrowByCategoryAsync(request.PeriodStart, reportPeriodEnd, ct);
        var rows = await repository.BorrowRecords.AsNoTracking()
            .Where(x => x.BorrowDate >= request.PeriodStart.Date && x.BorrowDate < periodEndExclusive)
            .SelectMany(x => x.BookCopy.Book.Categories.DefaultIfEmpty(), (record, category) => new { Record = record, Category = category == null ? "Chưa phân loại" : category.Name })
            .GroupBy(x => new { Day = x.Record.BorrowDate!.Value.Date, x.Category })
            .Select(group => new ReportRowDto(group.Key.Day, group.Key.Category, group.Count(), group.Count(x => x.Record.ReturnDate != null),
                group.Count(x => x.Record.ReturnDate == null && x.Record.DueDate < DateTime.UtcNow), group.Count(x => x.Record.ReturnDate != null), null))
            .OrderBy(x => x.Date).ThenBy(x => x.Category).ToListAsync(ct);
        var report = new LibraryReport
        {
            Code = $"RPT-{DateTime.UtcNow:yyMMddHHmmss}-{Random.Shared.Next(100, 999)}", Name = request.Name?.Trim() is { Length: > 0 } name ? name : template.Name,
            TemplateId = template.Id, SubmittedBy = userId, Format = request.Format,
            PeriodStart = request.PeriodStart.Date, PeriodEnd = reportPeriodEnd,
            Snapshot = JsonSerializer.Serialize(new { summary = stats, categories, rows }, JsonOptions)
        };
        repository.AddReport(report);
        var admins = await repository.Users.Where(profile => profile.IsActive && profile.Role.Name == "Admin").Select(profile => profile.Id).ToListAsync(ct);
        foreach (var adminId in admins)
            repository.AddNotification(new Notification { UserId = adminId, Title = "Báo cáo mới", Message = $"Thủ thư đã gửi báo cáo {report.Code}.", Type = "report", Metadata = JsonSerializer.Serialize(new { reportId = report.Id, report.Code }) });
        await repository.SaveChangesAsync(ct);
        return (await DetailAsync(report.Id, ct))!;
    }

    public async Task UpdateAsync(Guid id, UpdateReportRequest request, Guid userId, CancellationToken ct)
    {
        if (!await repository.Users.AnyAsync(x => x.Id == userId && x.IsActive && x.Role.Name == "Admin", ct))
            throw new UnauthorizedAccessException("Chỉ quản trị viên đang hoạt động mới được duyệt báo cáo.");
        var report = await repository.FindReportForUpdateAsync(id, ct);
        if (report is null || report.IsDeleted) throw new KeyNotFoundException("Không tìm thấy báo cáo.");
        if (request.IsViewed.HasValue && request.IsViewed.Value != report.IsViewed) report.IsViewed = request.IsViewed.Value;
        if (request.IsApproved.HasValue && request.IsApproved.Value != report.IsApproved) report.IsApproved = request.IsApproved.Value;
        if (request.IsApproved == true || request.IsViewed == true) { report.ReviewedBy = userId; report.ReviewedAt = DateTime.UtcNow; }
        if (!string.IsNullOrWhiteSpace(request.Comment))
        {
            var priorComment = await repository.Reviews.AnyAsync(x => x.ReportId == report.Id && x.ReviewerId == userId && x.Action == "Comment" && x.Comment == request.Comment.Trim(), ct);
            if (!priorComment)
            repository.AddReview(new ReportReview { ReportId = report.Id, ReviewerId = userId, Action = "Comment", Comment = request.Comment.Trim() });
        }
        var alreadyHasViewedReview = await repository.Reviews.AnyAsync(x => x.ReportId == report.Id && x.ReviewerId == userId && x.Action == "Viewed", ct);
        var alreadyHasApprovedReview = await repository.Reviews.AnyAsync(x => x.ReportId == report.Id && x.ReviewerId == userId && x.Action == "Approved", ct);
        if (request.IsApproved == true && !alreadyHasApprovedReview)
            repository.AddReview(new ReportReview { ReportId = report.Id, ReviewerId = userId, Action = "Approved" });
        else if (request.IsViewed == true && !alreadyHasViewedReview)
            repository.AddReview(new ReportReview { ReportId = report.Id, ReviewerId = userId, Action = "Viewed" });
        await repository.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var report = await repository.FindReportForUpdateAsync(id, ct);
        if (report is null || report.IsDeleted) return false;
        report.IsDeleted = true;
        await repository.SaveChangesAsync(ct); return true;
    }

    public async Task<IReadOnlyList<TemplateDto>> TemplatesAsync(CancellationToken ct) => await repository.Templates.AsNoTracking().Where(x => !x.IsDeleted)
        .OrderByDescending(x => x.CreatedAt).Select(x => new TemplateDto(x.Id, x.Name, x.ReportType, x.Description, x.Configuration, x.IsEnabled, x.CreatedAt)).ToListAsync(ct);

    public Task<TemplateDto> SaveTemplateAsync(CreateTemplateRequest request, Guid userId, CancellationToken ct)
        => SaveTemplateAsync(null, new TemplateWriteRequest(request.Name, request.ReportType, request.Description, request.Configuration, request.IsEnabled), userId, ct);

    public async Task<bool> DeleteTemplateAsync(Guid id, CancellationToken ct)
    {
        var template = await repository.FindTemplateForUpdateAsync(id, ct);
        if (template is null) return false;
        if (await repository.Reports.AnyAsync(x => x.TemplateId == id, ct)) throw new ArgumentException("Không thể xóa mẫu đã được dùng trong báo cáo. Bạn có thể tắt mẫu thay thế.");
        template.IsDeleted = true; await repository.SaveChangesAsync(ct); return true;
    }

    public Task<ReportTemplate?> FindTemplateAsync(Guid id, CancellationToken ct) => repository.FindTemplateAsync(id, ct);
    public Task<ReportTemplate?> FindTemplateForUpdateAsync(Guid id, CancellationToken ct) => repository.FindTemplateForUpdateAsync(id, ct);
    public Task<ReportTemplate?> FindTemplateByIdIgnoreFiltersAsync(Guid id, CancellationToken ct) => repository.FindTemplateByIdIgnoreFiltersAsync(id, ct);
    public Task<LibraryReport?> FindReportByIdIgnoreFiltersAsync(Guid id, CancellationToken ct) => repository.FindReportByIdIgnoreFiltersAsync(id, ct);
    public Task<IReadOnlyList<LibraryReport>> FindReportsAsync(Guid[] ids, CancellationToken ct) => repository.FindReportsAsync(ids, ct);
    public async Task<IReadOnlyList<ReportDetailDto>> FindReportDetailsAsync(Guid[] ids, CancellationToken ct)
    {
        var reports = await repository.FindReportDetailsAsync(ids, ct);
        return reports.Where(x => !x.IsDeleted).Select(x => new ReportDetailDto(x.Id, x.Code, x.Name, x.Submitter.FullName, x.Template.Name, x.CreatedAt, x.PeriodStart, x.PeriodEnd, x.Format, x.Status, x.IsViewed, x.IsApproved, x.Snapshot, [], ReadRows(x.Snapshot))).ToList();
    }
    public Task SaveChangesAsync(CancellationToken ct) => repository.SaveChangesAsync(ct);

    public async Task<TemplateDto> SaveTemplateAsync(Guid? id, TemplateWriteRequest request, Guid userId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name)) throw new ArgumentException("Vui lòng nhập tên mẫu báo cáo.");
        if (string.IsNullOrWhiteSpace(request.ReportType)) throw new ArgumentException("Vui lòng chọn loại báo cáo.");
        try { using var _ = JsonDocument.Parse(request.Configuration); }
        catch (JsonException) { throw new ArgumentException("Cấu hình mẫu phải là JSON hợp lệ."); }
        var name = request.Name.Trim();
        if (await repository.FindOtherTemplateByNameAsync(name, id ?? Guid.Empty, ct) is not null)
            throw new ArgumentException("Đã tồn tại mẫu báo cáo cùng tên.");
        ReportTemplate template;
        if (id.HasValue)
        {
            template = await repository.FindTemplateByIdIgnoreFiltersAsync(id.Value, ct) ?? throw new KeyNotFoundException("Không tìm thấy mẫu báo cáo.");
            if (await repository.Reports.AnyAsync(x => x.TemplateId == id.Value, ct))
            {
                using var current = JsonDocument.Parse(template.Configuration);
                using var next = JsonDocument.Parse(request.Configuration);
                var structuralChange = template.Name != name || template.ReportType != request.ReportType || template.Description != request.Description ||
                    !current.RootElement.GetRawText().Equals(next.RootElement.GetRawText(), StringComparison.Ordinal);
                if (structuralChange) throw new ArgumentException("Mẫu đã được dùng trong báo cáo. Chỉ có thể bật hoặc tắt mẫu để giữ nguyên lịch sử.");
            }
            template.Name = name; template.ReportType = request.ReportType; template.Description = request.Description;
            template.Configuration = request.Configuration; template.IsEnabled = request.IsEnabled; template.UpdatedBy = userId; template.IsDeleted = false;
        }
        else
        {
            template = new ReportTemplate { Name = name, ReportType = request.ReportType, Description = request.Description, Configuration = request.Configuration, IsEnabled = request.IsEnabled, CreatedBy = userId };
            repository.AddTemplate(template);
        }
        await repository.SaveChangesAsync(ct);
        return new TemplateDto(template.Id, template.Name, template.ReportType, template.Description, template.Configuration, template.IsEnabled, template.CreatedAt);
    }

    public async Task<TemplateDto?> UpdateTemplateAsync(Guid id, TemplateWriteRequest request, Guid userId, CancellationToken ct)
    {
        if (await repository.FindTemplateAsync(id, ct) is null) return null;
        return await SaveTemplateAsync(id, request, userId, ct);
    }

    public async Task<TemplateDto?> DuplicateTemplateAsync(Guid id, Guid userId, CancellationToken ct)
    {
        var source = await repository.FindTemplateAsync(id, ct);
        if (source is null) return null;
        var duplicateName = source.Name + " (bản sao)";
        if (await repository.FindTemplateByNameAsync(duplicateName, ct) is not null)
            duplicateName = $"{duplicateName} {DateTime.UtcNow:yyyyMMddHHmmss}";
        return await SaveTemplateAsync(null, new TemplateWriteRequest(duplicateName, source.ReportType, source.Description, source.Configuration, false), userId, ct);
    }
}
