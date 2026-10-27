using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Reports;

public sealed class ReportService(IReportRepository repository)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static string GetDisplayName(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim();

    public async Task<IReadOnlyList<ReportRequestDto>> ReportRequestsAsync(Guid userId, bool isAdmin, CancellationToken ct)
    {
        var requiredRole = isAdmin ? "Admin" : "Librarian";
        if (!await repository.Users.AnyAsync(x => x.Id == userId && x.IsActive && x.Role.Name == requiredRole, ct))
            throw new UnauthorizedAccessException("Tài khoản không hợp lệ hoặc đã bị khóa.");

        var requests = repository.ReportRequests.AsNoTracking().IgnoreQueryFilters()
            .Include(x => x.Librarian)
            .Include(x => x.Template)
            .Include(x => x.Reports).ThenInclude(x => x.Reviews)
            .AsQueryable();
        if (!isAdmin)
            requests = requests.Where(x => x.LibrarianId == userId);

        var results = await requests.OrderByDescending(x => x.CreatedAt).ToListAsync(ct);
        var mappedRequests = results.Select(x =>
        {
            var lastReport = x.Reports.OrderByDescending(report => report.CreatedAt).FirstOrDefault();
            var lastReviewComment = lastReport?.Reviews
                .Where(review => !review.IsDeleted)
                .OrderByDescending(review => review.CreatedAt)
                .FirstOrDefault(review => !string.IsNullOrWhiteSpace(review.Comment))
                ?.Comment;
            return new ReportRequestDto(
                x.Id,
                x.LibrarianId,
                GetDisplayName(x.Librarian.FullName, "Không xác định"),
                x.TemplateId,
                x.Template.Name,
                x.Template.ReportType,
                x.PeriodStart,
                x.PeriodEnd,
                x.Name,
                x.Status,
                x.CreatedAt,
                x.ReportId,
                lastReport?.Id,
                lastReport is null ? null : lastReport.IsApproved ? "Approved" : lastReport.Status,
                lastReviewComment);
        }).ToList();

        if (isAdmin)
        {
            var linkedReportIds = results.SelectMany(request => request.Reports).Select(report => report.Id).ToHashSet();
            var directReports = await repository.Reports.AsNoTracking().IgnoreQueryFilters()
                .Include(report => report.Submitter)
                .Include(report => report.Template)
                .Where(report => report.RequestId == null && !report.IsDeleted)
                .OrderByDescending(report => report.CreatedAt)
                .ToListAsync(ct);

            mappedRequests.AddRange(directReports
                .Where(report => !linkedReportIds.Contains(report.Id))
                .Select(report => new ReportRequestDto(
                    report.Id,
                    report.SubmittedBy,
                    GetDisplayName(report.Submitter?.FullName, "Không xác định"),
                    report.TemplateId,
                    GetDisplayName(report.Template?.Name, "Báo cáo"),
                    report.Template?.ReportType ?? "Periodic",
                    report.PeriodStart,
                    report.PeriodEnd.AddDays(1),
                    report.Name,
                    "Submitted",
                    report.CreatedAt,
                    report.Id,
                    report.Id,
                    report.IsApproved ? "Approved" : report.Status,
                    null,
                    IsSelfSubmitted: true)));
        }

        return mappedRequests.OrderByDescending(request => request.CreatedAt).ToList();
    }

    public async Task<ReportRequestDto> CreateReportRequestAsync(CreateReportRequestAssignment request, Guid adminId, CancellationToken ct)
    {
        if (request.PeriodStart == default || request.PeriodEnd == default || request.PeriodEnd.Date <= request.PeriodStart.Date)
            throw new ArgumentException("Kỳ báo cáo không hợp lệ.");
        if (request.Name is { Length: > 250 })
            throw new ArgumentException("Tên yêu cầu không được vượt quá 250 ký tự.");
        if (!await repository.Users.AnyAsync(x => x.Id == adminId && x.IsActive && x.Role.Name == "Admin", ct))
            throw new UnauthorizedAccessException("Chỉ quản trị viên đang hoạt động mới được giao yêu cầu báo cáo.");

        var librarian = await repository.Users.Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == request.LibrarianId && x.IsActive && x.Role.Name == "Librarian", ct)
            ?? throw new ArgumentException("Thủ thư không tồn tại, đã bị khóa hoặc không có vai trò thủ thư.");
        var template = await repository.Templates.FirstOrDefaultAsync(
            x => x.Id == request.TemplateId && x.IsEnabled && !x.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Không tìm thấy mẫu báo cáo đang bật.");

        var reportRequest = new ReportRequest
        {
            LibrarianId = librarian.Id,
            Librarian = librarian,
            RequestedBy = adminId,
            TemplateId = template.Id,
            Template = template,
            PeriodStart = request.PeriodStart.Date,
            PeriodEnd = request.PeriodEnd.Date,
            Name = string.IsNullOrWhiteSpace(request.Name) ? null : request.Name.Trim(),
            Status = "Pending"
        };
        repository.AddReportRequest(reportRequest);
        repository.AddNotification(new Notification
        {
            UserId = librarian.Id,
            Title = "Yêu cầu báo cáo mới",
            Message = $"Quản trị viên đã giao yêu cầu báo cáo “{template.Name}”.",
            Type = "report",
            Metadata = JsonSerializer.Serialize(new { requestId = reportRequest.Id, status = reportRequest.Status })
        });
        await repository.SaveChangesAsync(ct);

        return new ReportRequestDto(
            reportRequest.Id,
            librarian.Id,
            GetDisplayName(librarian.FullName, "Không xác định"),
            template.Id,
            template.Name,
            template.ReportType,
            reportRequest.PeriodStart,
            reportRequest.PeriodEnd,
            reportRequest.Name,
            reportRequest.Status,
            reportRequest.CreatedAt,
            reportRequest.ReportId,
            null,
            null,
            null);
    }

    public async Task<ReportListDto> ListAsync(ReportQuery query, CancellationToken ct)
    {
        var page = Math.Max(1, query.Page);
        var pageSize = Math.Clamp(query.PageSize, 1, 100);
        var items = repository.Reports.AsNoTracking().Include(x => x.Submitter).AsQueryable();
        if (!string.IsNullOrWhiteSpace(query.Search))
            items = items.Where(x => x.Name.Contains(query.Search) || x.Code.Contains(query.Search));
        if (!string.IsNullOrWhiteSpace(query.Status)) items = items.Where(x => x.Status == query.Status);
        if (!string.IsNullOrWhiteSpace(query.Format)) items = items.Where(x => x.Format == query.Format);
        if (query.SubmittedBy.HasValue) items = items.Where(x => x.SubmittedBy == query.SubmittedBy.Value);
        if (query.IsApproved.HasValue) items = items.Where(x => x.IsApproved == query.IsApproved.Value);
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
            .Select(x => new ReportListItemDto(
                x.Id,
                x.Code,
                x.Name,
                x.Submitter != null ? (x.Submitter.FullName ?? "Không xác định") : "Không xác định",
                x.CreatedAt,
                x.Format,
                x.Status,
                x.IsViewed,
                x.IsApproved,
                x.PeriodStart,
                x.PeriodEnd,
                x.Status == "Rejected")).ToListAsync(ct);
        return new ReportListDto(rows, count, page, pageSize, (int)Math.Ceiling(count / (double)pageSize));
    }

    public async Task<ReportDetailDto?> DetailAsync(Guid id, CancellationToken ct, Guid? submittedBy = null)
    {
        var query = repository.Reports.Where(x => x.Id == id);
        if (submittedBy.HasValue) query = query.Where(x => x.SubmittedBy == submittedBy.Value);
        var report = await query.AsNoTracking().Include(x => x.Submitter).Include(x => x.Template)
            .Include(x => x.Reviews.Where(review => !review.IsDeleted)).ThenInclude(x => x.Reviewer).FirstOrDefaultAsync(ct);
        if (report is null || report.IsDeleted) return null;

        var submitterName = GetDisplayName(report.Submitter?.FullName, "Không xác định");
        var templateName = GetDisplayName(report.Template?.Name, "Mẫu báo cáo đã bị xóa");
        var reviews = report.Reviews.OrderBy(x => x.CreatedAt)
            .Select(x => new ReportReviewDto(x.Action, x.Comment, GetDisplayName(x.Reviewer?.FullName, "Không xác định"), x.CreatedAt))
            .ToList();

        return new ReportDetailDto(report.Id, report.Code, report.Name, submitterName,
            templateName, report.CreatedAt, report.PeriodStart, report.PeriodEnd, report.Format, report.Status,
            report.IsViewed, report.IsApproved, report.Snapshot,
            reviews,
            ReadRows(report.Snapshot),
            report.TemplateId, report.Template?.ReportType, report.Template?.Description, report.Template?.Configuration,
            string.Equals(report.Status, "Rejected", StringComparison.OrdinalIgnoreCase));
    }

    private static JsonDocument ParseConfiguration(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return JsonDocument.Parse("{}");
        var doc = JsonDocument.Parse(raw);
        if (doc.RootElement.ValueKind == JsonValueKind.String)
        {
            var inner = doc.RootElement.GetString();
            if (!string.IsNullOrWhiteSpace(inner) && (inner.TrimStart().StartsWith('{') || inner.TrimStart().StartsWith('[')))
            {
                try
                {
                    var unwrapped = JsonDocument.Parse(inner);
                    doc.Dispose();
                    return unwrapped;
                }
                catch { }
            }
        }
        return doc;
    }

    private static IReadOnlyList<ReportRowDto> ReadRows(string snapshot)
    {
        try
        {
            using var document = ParseConfiguration(snapshot);
            if (document.RootElement.ValueKind != JsonValueKind.Object || !document.RootElement.TryGetProperty("rows", out var rows) || rows.ValueKind != JsonValueKind.Array) return [];
            return JsonSerializer.Deserialize<List<ReportRowDto>>(rows.GetRawText(), JsonOptions) ?? [];
        }
        catch
        {
            return [];
        }
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
        var currentPayments = repository.FinePayments.AsNoTracking()
            .Where(x => x.PaidAt >= start && x.PaidAt < end
                        && (x.Status == SmartLibrary.Domain.Enums.FinePaymentStatus.Paid
                            || x.Status == SmartLibrary.Domain.Enums.FinePaymentStatus.PaidAfterSettlement));
        var legacyCurrentFines = repository.Fines.AsNoTracking()
            .Where(x => x.Status == SmartLibrary.Domain.Enums.FineStatus.Paid
                        && x.PaidAt >= start && x.PaidAt < end
                        && !repository.FinePayments.Any(payment => payment.FineId == x.Id));
        var fineRevenue = (await currentPayments.SumAsync(x => (decimal?)x.Amount, ct) ?? 0)
            + (await legacyCurrentFines.SumAsync(x => (decimal?)x.Amount, ct) ?? 0);
        var fineCount = await currentPayments.CountAsync(ct) + await legacyCurrentFines.CountAsync(ct);
        var finePreviousPayments = repository.FinePayments.AsNoTracking()
            .Where(x => x.PaidAt >= previousStart && x.PaidAt < start
                        && (x.Status == SmartLibrary.Domain.Enums.FinePaymentStatus.Paid
                            || x.Status == SmartLibrary.Domain.Enums.FinePaymentStatus.PaidAfterSettlement));
        var finePreviousLegacy = repository.Fines.AsNoTracking()
            .Where(x => x.Status == SmartLibrary.Domain.Enums.FineStatus.Paid
                        && x.PaidAt >= previousStart && x.PaidAt < start
                        && !repository.FinePayments.Any(payment => payment.FineId == x.Id));
        var finePreviousCount = await finePreviousPayments.CountAsync(ct) + await finePreviousLegacy.CountAsync(ct);
        var cashFineRevenue = await currentPayments.Where(x => x.Method == "Cash")
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var payOSFineRevenue = await currentPayments.Where(x => x.Method == "PayOS")
            .SumAsync(x => (decimal?)x.Amount, ct) ?? 0;
        var legacyFineRevenue = (await legacyCurrentFines.SumAsync(x => (decimal?)x.Amount, ct) ?? 0)
            + (await currentPayments.Where(x => x.Method != "Cash" && x.Method != "PayOS")
                .SumAsync(x => (decimal?)x.Amount, ct) ?? 0);
        static decimal Change(decimal currentValue, decimal previousValue) => previousValue == 0 ? (currentValue == 0 ? 0 : 100) : Math.Round((currentValue - previousValue) / previousValue * 100, 1);
        return new ReportSummaryDto(start, end.AddDays(-1), borrowed, returned, returned == 0 ? 0 : Math.Round((decimal)onTime / returned * 100, 1),
            Change(borrowed, borrowedPrevious), Change(returned, returnedPrevious), fineRevenue, fineCount,
            Change(fineCount, finePreviousCount), null, false, cashFineRevenue, payOSFineRevenue, legacyFineRevenue);
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
        ReportRequest? reportRequest = null;
        if (request.RequestId.HasValue)
        {
            reportRequest = await repository.FindReportRequestForUpdateAsync(request.RequestId.Value, ct)
                ?? throw new KeyNotFoundException("Không tìm thấy yêu cầu báo cáo.");
            if (reportRequest.LibrarianId != userId)
                throw new UnauthorizedAccessException("Yêu cầu báo cáo không được giao cho tài khoản này.");
            if (!await repository.Users.AnyAsync(x => x.Id == userId && x.IsActive && x.Role.Name == "Librarian", ct))
                throw new UnauthorizedAccessException("Chỉ thủ thư đang hoạt động mới được gửi báo cáo cho yêu cầu.");
            if (reportRequest.Status != "Pending")
                throw new InvalidOperationException("Yêu cầu này không còn ở trạng thái chờ gửi.");
            if (reportRequest.TemplateId != request.TemplateId
                || reportRequest.PeriodStart.Date != request.PeriodStart.Date
                || reportRequest.PeriodEnd.Date != request.PeriodEnd.Date)
                throw new ArgumentException("Mẫu và kỳ báo cáo phải khớp với yêu cầu được giao.");
        }
        var template = await repository.Templates.FirstOrDefaultAsync(x => x.Id == request.TemplateId && x.IsEnabled && !x.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Không tìm thấy mẫu báo cáo đang bật.");
        using var templateConfiguration = ParseConfiguration(template.Configuration);
        var formatAllowed = true;
        if (templateConfiguration.RootElement.ValueKind == JsonValueKind.Object
            && templateConfiguration.RootElement.TryGetProperty("formats", out var formats)
            && formats.ValueKind == JsonValueKind.Array)
        {
            formatAllowed = formats.EnumerateArray().Any(x => string.Equals(x.GetString(), request.Format, StringComparison.OrdinalIgnoreCase));
        }
        if (!formatAllowed)
            throw new ArgumentException("Định dạng gửi báo cáo chưa được bật trong mẫu.");
        if (request.Format == "PDF") throw new ArgumentException("API xuất PDF chưa được triển khai. Hãy chọn CSV trong mẫu báo cáo.");
        var reportPeriodEnd = periodEndExclusive.AddDays(-1);
        if (request.CustomRows is { Count: > 0 } submittedRows)
        {
            var validation = ReportImportValidator.Validate(template.Id, template.Configuration, submittedRows);
            if (!validation.IsReady)
            {
                var preview = string.Join(" ", validation.Issues.Take(5).Select(x => x.Row > 0 ? $"Dòng {x.Row}: {x.Message}" : x.Message));
                throw new ArgumentException($"Dữ liệu báo cáo chưa đạt chuẩn mẫu. {preview}");
            }
        }
        var stats = await SummaryAsync(request.PeriodStart, reportPeriodEnd, ct);
        var categories = await BorrowByCategoryAsync(request.PeriodStart, reportPeriodEnd, ct);
        IReadOnlyList<ReportRowDto> rows;
        if (request.CustomRows is { Count: > 0 } customRows)
        {
            rows = customRows;
        }
        else
        {
            var periodRecords = repository.BorrowRecords.AsNoTracking()
                .Where(x => x.BorrowDate >= request.PeriodStart.Date && x.BorrowDate < periodEndExclusive);
            var categorizedRows = await periodRecords
                .Where(x => x.BookCopy.Book.Categories.Any())
                .SelectMany(x => x.BookCopy.Book.Categories.Select(category => new { Record = x, Category = category.Name }))
                .GroupBy(x => new { Day = x.Record.BorrowDate!.Value.Date, x.Category })
                .Select(group => new ReportRowDto(group.Key.Day, group.Key.Category, group.Count(),
                    group.Count(x => x.Record.ReturnDate != null),
                    group.Count(x => x.Record.ReturnDate == null && x.Record.DueDate < DateTime.UtcNow),
                    group.Count(x => x.Record.ReturnDate != null), null))
                .ToListAsync(ct);
            var unclassifiedRows = await periodRecords
                .Where(x => !x.BookCopy.Book.Categories.Any())
                .GroupBy(x => x.BorrowDate!.Value.Date)
                .Select(group => new ReportRowDto(group.Key, "Chưa phân loại", group.Count(),
                    group.Count(x => x.ReturnDate != null),
                    group.Count(x => x.ReturnDate == null && x.DueDate < DateTime.UtcNow),
                    group.Count(x => x.ReturnDate != null), null))
                .ToListAsync(ct);
            rows = categorizedRows.Concat(unclassifiedRows)
                .OrderBy(x => x.Date)
                .ThenBy(x => x.Category)
                .ToList();
        }
        var report = new LibraryReport
        {
            Code = $"RPT-{DateTime.UtcNow:yyMMddHHmmss}-{Random.Shared.Next(100, 999)}",
            Name = request.Name?.Trim() is { Length: > 0 } name ? name : reportRequest?.Name ?? template.Name,
            TemplateId = template.Id, RequestId = reportRequest?.Id, SubmittedBy = userId, Format = request.Format,
            PeriodStart = request.PeriodStart.Date, PeriodEnd = reportPeriodEnd,
            Snapshot = JsonSerializer.Serialize(new { summary = stats, categories, rows }, JsonOptions)
        };
        repository.AddReport(report);
        if (reportRequest is not null)
        {
            reportRequest.Status = "Submitted";
            reportRequest.ReportId = report.Id;
            reportRequest.Report = report;
        }
        var admins = await repository.Users.Where(profile => profile.IsActive && profile.Role.Name == "Admin").Select(profile => profile.Id).ToListAsync(ct);
        foreach (var adminId in admins)
            repository.AddNotification(new Notification { UserId = adminId, Title = "Báo cáo mới", Message = $"Thủ thư đã gửi báo cáo {report.Code}.", Type = "report", Metadata = JsonSerializer.Serialize(new { reportId = report.Id, report.Code, requestId = reportRequest?.Id }) });
        await repository.SaveChangesAsync(ct);
        return (await DetailAsync(report.Id, ct))!;
    }

    public async Task UpdateAsync(Guid id, UpdateReportRequest request, Guid userId, CancellationToken ct)
    {
        if (!await repository.Users.AnyAsync(x => x.Id == userId && x.IsActive && x.Role.Name == "Admin", ct))
            throw new UnauthorizedAccessException("Chỉ quản trị viên đang hoạt động mới được duyệt báo cáo.");
        var report = await repository.FindReportForUpdateAsync(id, ct);
        if (report is null || report.IsDeleted) throw new KeyNotFoundException("Không tìm thấy báo cáo.");
        if (request.IsRejected == true)
        {
            if (request.IsApproved == true)
                throw new ArgumentException("Không thể vừa duyệt vừa từ chối một báo cáo.");
            if (report.IsApproved || string.Equals(report.Status, "Approved", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Không thể từ chối báo cáo đã được duyệt.");
            if (string.IsNullOrWhiteSpace(request.Comment))
                throw new ArgumentException("Vui lòng nhập lý do từ chối báo cáo.");

            var reason = request.Comment.Trim();
            report.IsApproved = false;
            report.Status = "Rejected";
            report.ReviewedBy = userId;
            report.ReviewedAt = DateTime.UtcNow;
            repository.AddReview(new ReportReview
            {
                ReportId = report.Id,
                ReviewerId = userId,
                Action = "Rejected",
                Comment = reason
            });

            if (report.RequestId.HasValue)
            {
                var reportRequest = await repository.FindReportRequestForUpdateAsync(report.RequestId.Value, ct);
                if (reportRequest is not null && reportRequest.ReportId == report.Id && reportRequest.Status == "Submitted")
                {
                    reportRequest.Status = "Pending";
                }
            }
            repository.AddNotification(new Notification
            {
                UserId = report.SubmittedBy,
                Title = "Báo cáo cần chỉnh sửa",
                Message = $"Báo cáo {report.Code} bị từ chối: {reason}",
                Type = "report",
                Metadata = JsonSerializer.Serialize(new { reportId = report.Id, requestId = report.RequestId, status = report.Status, reason })
            });
            await repository.SaveChangesAsync(ct);
            return;
        }
        if (!string.IsNullOrWhiteSpace(request.Name)) report.Name = request.Name.Trim();
        if (!string.IsNullOrWhiteSpace(request.Status)) report.Status = request.Status.Trim();
        if (request.IsViewed.HasValue && request.IsViewed.Value != report.IsViewed) report.IsViewed = request.IsViewed.Value;
        var wasApproved = report.IsApproved;
        var wasRejected = string.Equals(report.Status, "Rejected", StringComparison.OrdinalIgnoreCase);
        if (request.IsApproved.HasValue && request.IsApproved.Value != report.IsApproved) report.IsApproved = request.IsApproved.Value;
        if (request.IsApproved == true && wasRejected)
        {
            report.Status = "Approved";
            if (report.RequestId.HasValue)
            {
                var reportRequest = await repository.FindReportRequestForUpdateAsync(report.RequestId.Value, ct);
                if (reportRequest is not null && reportRequest.ReportId == report.Id && reportRequest.Status == "Pending")
                    reportRequest.Status = "Submitted";
            }
        }
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
        if (request.IsApproved == true && !wasApproved)
            repository.AddNotification(new Notification
            {
                UserId = report.SubmittedBy,
                Title = "Báo cáo đã được duyệt",
                Message = $"Báo cáo {report.Code} đã được quản trị viên duyệt.",
                Type = "report",
                Metadata = JsonSerializer.Serialize(new { reportId = report.Id, requestId = report.RequestId, status = "Approved" })
            });
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

    public async Task<TemplateDto?> TemplateDetailAsync(Guid id, CancellationToken ct) =>
        await repository.Templates.AsNoTracking().Where(x => x.Id == id && !x.IsDeleted)
            .Select(x => new TemplateDto(x.Id, x.Name, x.ReportType, x.Description, x.Configuration, x.IsEnabled, x.CreatedAt))
            .FirstOrDefaultAsync(ct);

    public async Task<ValidateReportRowsResult> ValidateRowsAsync(ValidateReportRowsRequest request, CancellationToken ct)
    {
        var template = await repository.Templates.AsNoTracking().FirstOrDefaultAsync(x => x.Id == request.TemplateId && x.IsEnabled && !x.IsDeleted, ct)
            ?? throw new KeyNotFoundException("Không tìm thấy mẫu báo cáo đang bật.");
        return ReportImportValidator.Validate(template.Id, template.Configuration, request.Rows);
    }

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
        return reports.Where(x => !x.IsDeleted)
            .Select(x => new ReportDetailDto(
                x.Id,
                x.Code,
                x.Name,
                GetDisplayName(x.Submitter?.FullName, "Không xác định"),
                GetDisplayName(x.Template?.Name, "Mẫu báo cáo đã bị xóa"),
                x.CreatedAt,
                x.PeriodStart,
                x.PeriodEnd,
                x.Format,
                x.Status,
                x.IsViewed,
                x.IsApproved,
                x.Snapshot,
                [],
                ReadRows(x.Snapshot),
                x.TemplateId,
                x.Template?.ReportType,
                x.Template?.Description,
                x.Template?.Configuration,
                string.Equals(x.Status, "Rejected", StringComparison.OrdinalIgnoreCase)))
            .ToList();
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
