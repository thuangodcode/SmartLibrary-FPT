using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Reports;

public interface IReportRepository
{
    IQueryable<LibraryReport> Reports { get; }
    IQueryable<ReportTemplate> Templates { get; }
    IQueryable<SmartLibrary.Domain.Entities.BorrowRecord> BorrowRecords { get; }
    IQueryable<SmartLibrary.Domain.Entities.Fine> Fines { get; }
    IQueryable<SmartLibrary.Domain.Entities.FinePayment> FinePayments { get; }
    IQueryable<SmartLibrary.Domain.Entities.UserProfile> Users { get; }
    IQueryable<SmartLibrary.Domain.Entities.Notification> Notifications { get; }
    IQueryable<SmartLibrary.Domain.Entities.ReportReview> Reviews { get; }
    IQueryable<SmartLibrary.Domain.Entities.ReportRequest> ReportRequests { get; }
    void AddReport(SmartLibrary.Domain.Entities.LibraryReport report);
    void AddReportRequest(SmartLibrary.Domain.Entities.ReportRequest request);
    void AddNotification(SmartLibrary.Domain.Entities.Notification notification);
    void AddReview(SmartLibrary.Domain.Entities.ReportReview review);
    void AddTemplate(SmartLibrary.Domain.Entities.ReportTemplate template);
    Task<SmartLibrary.Domain.Entities.ReportTemplate?> FindTemplateAsync(Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.ReportTemplate?> FindTemplateForUpdateAsync(Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.LibraryReport?> FindReportForUpdateAsync(Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.ReportRequest?> FindReportRequestForUpdateAsync(Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.ReportTemplate?> FindTemplateByNameAsync(string name, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.ReportTemplate?> FindOtherTemplateByNameAsync(string name, Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.ReportTemplate?> FindTemplateByIdIgnoreFiltersAsync(Guid id, CancellationToken ct);
    Task<SmartLibrary.Domain.Entities.LibraryReport?> FindReportByIdIgnoreFiltersAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<SmartLibrary.Domain.Entities.LibraryReport>> FindReportsAsync(Guid[] ids, CancellationToken ct);
    Task<IReadOnlyList<SmartLibrary.Domain.Entities.LibraryReport>> FindReportDetailsAsync(Guid[] ids, CancellationToken ct);
    Task SaveChangesAsync(CancellationToken ct);
}
