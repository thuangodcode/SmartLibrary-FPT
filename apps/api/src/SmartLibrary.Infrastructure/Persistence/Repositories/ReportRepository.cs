using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Reports;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public sealed class ReportRepository(AppDbContext db) : IReportRepository
{
    public IQueryable<LibraryReport> Reports => db.LibraryReports;
    public IQueryable<ReportTemplate> Templates => db.ReportTemplates;
    public IQueryable<BorrowRecord> BorrowRecords => db.BorrowRecords;
    public IQueryable<Fine> Fines => db.Fines;
    public IQueryable<FinePayment> FinePayments => db.FinePayments;
    public IQueryable<UserProfile> Users => db.UserProfiles;
    public IQueryable<Notification> Notifications => db.Notifications;
    public IQueryable<ReportReview> Reviews => db.ReportReviews;
    public IQueryable<ReportRequest> ReportRequests => db.ReportRequests;
    public void AddReport(LibraryReport report) => db.LibraryReports.Add(report);
    public void AddReportRequest(ReportRequest request) => db.ReportRequests.Add(request);
    public void AddNotification(Notification notification) => db.Notifications.Add(notification);
    public void AddReview(ReportReview review) => db.ReportReviews.Add(review);
    public void AddTemplate(ReportTemplate template) => db.ReportTemplates.Add(template);
    public Task<ReportTemplate?> FindTemplateAsync(Guid id, CancellationToken ct) => db.ReportTemplates.FirstOrDefaultAsync(x => x.Id == id, ct);
    public Task<ReportTemplate?> FindTemplateForUpdateAsync(Guid id, CancellationToken ct) => db.ReportTemplates.FirstOrDefaultAsync(x => x.Id == id, ct);
    public Task<LibraryReport?> FindReportForUpdateAsync(Guid id, CancellationToken ct) => db.LibraryReports.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct);
    public Task<ReportRequest?> FindReportRequestForUpdateAsync(Guid id, CancellationToken ct) => db.ReportRequests.FirstOrDefaultAsync(x => x.Id == id, ct);
    public Task<ReportTemplate?> FindTemplateByNameAsync(string name, CancellationToken ct) => db.ReportTemplates.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Name == name, ct);
    public Task<ReportTemplate?> FindOtherTemplateByNameAsync(string name, Guid id, CancellationToken ct) => db.ReportTemplates.FirstOrDefaultAsync(x => x.Name == name && x.Id != id, ct);
    public Task<ReportTemplate?> FindTemplateByIdIgnoreFiltersAsync(Guid id, CancellationToken ct) => db.ReportTemplates.IgnoreQueryFilters().FirstOrDefaultAsync(x => x.Id == id, ct);
    public Task<LibraryReport?> FindReportByIdIgnoreFiltersAsync(Guid id, CancellationToken ct) => db.LibraryReports.FirstOrDefaultAsync(x => x.Id == id, ct);
    public async Task<IReadOnlyList<LibraryReport>> FindReportsAsync(Guid[] ids, CancellationToken ct) => await db.LibraryReports.Where(x => ids.Contains(x.Id)).ToListAsync(ct);
    public async Task<IReadOnlyList<LibraryReport>> FindReportDetailsAsync(Guid[] ids, CancellationToken ct) => await db.LibraryReports.AsNoTracking().Include(x => x.Submitter).Include(x => x.Template).Where(x => ids.Contains(x.Id)).ToListAsync(ct);
    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
