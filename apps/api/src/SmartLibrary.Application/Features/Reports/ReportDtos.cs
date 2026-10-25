namespace SmartLibrary.Application.Features.Reports;

public sealed record ReportQuery(string? Search, string? Month, string? Status, string? Format, string? SortBy, string? SortDirection, int Page = 1, int PageSize = 10, Guid? SubmittedBy = null, bool? IsApproved = null);
public sealed record ReportListItemDto(Guid Id, string Code, string Name, string Submitter, DateTime CreatedAt, string Format, string Status, bool IsViewed, bool IsApproved, DateTime PeriodStart, DateTime PeriodEnd, bool IsRejected = false);
public sealed record ReportListDto(IReadOnlyList<ReportListItemDto> Items, int TotalCount, int Page, int PageSize, int TotalPages);
public sealed record ReportRowDto(DateTime Date, string Category, int Borrowed, int Returned, int Overdue, int ReturnedCount, string? Notes);
public sealed record ReportDetailDto(Guid Id, string Code, string Name, string Submitter, string TemplateName, DateTime CreatedAt, DateTime PeriodStart, DateTime PeriodEnd, string Format, string Status, bool IsViewed, bool IsApproved, string? Snapshot, IReadOnlyList<ReportReviewDto> Reviews, IReadOnlyList<ReportRowDto> Rows, Guid? TemplateId = null, string? TemplateReportType = null, string? TemplateDescription = null, string? TemplateConfiguration = null, bool IsRejected = false);
public sealed record ReportReviewDto(string Action, string? Comment, string Reviewer, DateTime CreatedAt);
public sealed record ReportSummaryDto(
    DateTime From, DateTime To, int Borrowed, int Returned, decimal ReturnedOnTimeRate,
    decimal BorrowedChangePercent, decimal ReturnedChangePercent, decimal FineRevenue,
    int FineTransactions, decimal FineChangePercent, int? LibraryVisits, bool LibraryVisitsAvailable,
    decimal CashFineRevenue = 0, decimal PayOSFineRevenue = 0, decimal UnclassifiedFineRevenue = 0);
public sealed record CategoryBorrowDto(string Category, int Count, decimal Percent);
public sealed record CreateReportRequest(Guid TemplateId, string Format, DateTime PeriodStart, DateTime PeriodEnd, string? Name = null, IReadOnlyList<ReportRowDto>? CustomRows = null, Guid? RequestId = null);
public sealed record UpdateReportRequest(bool? IsViewed, bool? IsApproved, string? Comment, string? Name = null, string? Status = null, bool? IsRejected = null);
public sealed record CreateTemplateRequest(string Name, string ReportType, string? Description, string Configuration, bool IsEnabled = true);
public sealed record UpdateTemplateRequest(string Name, string ReportType, string? Description, string Configuration, bool IsEnabled);
public sealed record TemplateWriteRequest(string Name, string ReportType, string? Description, string Configuration, bool IsEnabled);
public sealed record TemplateDto(Guid Id, string Name, string ReportType, string? Description, string Configuration, bool IsEnabled, DateTime CreatedAt);
public sealed record ReportRequestDto(Guid Id, Guid LibrarianId, string LibrarianName, Guid TemplateId, string TemplateName, string ReportType, DateTime PeriodStart, DateTime PeriodEnd, string? Name, string Status, DateTime CreatedAt, Guid? ReportId, Guid? LastReportId = null, string? LastReportStatus = null, string? LastReviewComment = null);
public sealed record CreateReportRequestAssignment(Guid LibrarianId, Guid TemplateId, DateTime PeriodStart, DateTime PeriodEnd, string? Name = null);
