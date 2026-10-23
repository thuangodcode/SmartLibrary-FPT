using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Circulation;

public interface ICirculationRepository
{
    Task MarkOverdueAsync(CancellationToken ct);
    Task<CirculationStatsDto> GetStatsAsync(int finePerDay, CancellationToken ct);
    Task<(IReadOnlyList<CirculationLoanDto> Items, int Total)> GetLoansAsync(
        string? search, string? status, int page, int pageSize, int finePerDay, CancellationToken ct);
    Task<CirculationLoanDto?> GetLoanAsync(Guid id, int finePerDay, CancellationToken ct);
    Task<UserProfile?> FindReaderAsync(string key, CancellationToken ct);
    Task<BookCopy?> FindCopyByBarcodeAsync(string barcode, CancellationToken ct);
    Task<bool> HasActiveLoanAsync(Guid copyId, Guid? exceptLoanId, CancellationToken ct);
    Task<int> CountActiveLoansAsync(Guid readerId, CancellationToken ct);
    Task<bool> HasUnpaidFinesAsync(Guid readerId, CancellationToken ct);
    Task AddLoanAsync(BorrowRecord loan, CancellationToken ct);
    Task<BorrowRecord?> GetTrackedLoanAsync(Guid id, CancellationToken ct);
    Task<BorrowRecord?> FindActiveLoanByBarcodeAsync(string barcode, CancellationToken ct);
    Task<IReadOnlyList<CirculationLoanDto>> GetOverdueAsync(int finePerDay, CancellationToken ct);
    Task<IReadOnlyList<CirculationFineDto>> GetFinesAsync(string? search, string? status, CancellationToken ct);
    Task<IReadOnlyList<CirculationFineDto>> GetFinesForReaderAsync(Guid readerId, CancellationToken ct);
    Task<(IReadOnlyList<CirculationLoanDto> Items, int Total)> GetLoansForReaderAsync(
        Guid readerId, int page, int pageSize, int finePerDay, CancellationToken ct);
    Task<bool> HasOpenFineAsync(Guid borrowRecordId, CancellationToken ct);
    Task<bool> HasOverdueFineAsync(Guid borrowRecordId, CancellationToken ct);
    Task<bool> HasCompensationFineAsync(Guid borrowRecordId, CancellationToken ct);
    Task<bool> HasOpenIncidentAsync(Guid borrowRecordId, CancellationToken ct);
    Task AddFineAsync(Fine fine, CancellationToken ct);
    Task AddIncidentAsync(BookIncident incident, CancellationToken ct);
    Task<BookIncident?> GetTrackedIncidentAsync(Guid id, CancellationToken ct);
    Task<BookIncident?> FindIncidentByFineIdAsync(Guid fineId, CancellationToken ct);
    Task<IReadOnlyList<CirculationIncidentDto>> GetIncidentsAsync(int finePerDay, CancellationToken ct);
    Task<CirculationIncidentDto?> GetIncidentDtoAsync(Guid id, int finePerDay, CancellationToken ct);
    Task<Fine?> GetTrackedFineAsync(Guid id, CancellationToken ct);
    Task<CirculationFineDto?> GetFineDtoAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<CirculationLoanDto>> GetPendingAsync(int finePerDay, CancellationToken ct);
    Task<IReadOnlyList<CirculationReservationDto>> GetReservationsAsync(CancellationToken ct);
    Task<IReadOnlyList<CirculationReservationDto>> GetReservationsForReaderAsync(Guid readerId, CancellationToken ct);
    Task<Reservation?> GetTrackedReservationAsync(Guid id, CancellationToken ct);
    Task<bool> HasOpenReservationAsync(Guid readerId, Guid bookId, CancellationToken ct);
    Task<bool> HasOtherReservationAsync(Guid bookId, Guid readerId, CancellationToken ct);
    Task<Reservation?> FindOpenReservationAsync(Guid readerId, Guid bookId, CancellationToken ct);
    Task AddReservationAsync(Reservation reservation, CancellationToken ct);
    Task<IReadOnlyList<Guid>> ExpireReadyReservationsAsync(CancellationToken ct);
    Task<Reservation?> ReadyNextReservationAsync(Guid bookId, int pickupHours, CancellationToken ct);
    Task<int> CountReadyReservationsAsync(Guid bookId, Guid exceptReaderId, CancellationToken ct);
    Task<int> CountAvailableCopiesAsync(Guid bookId, CancellationToken ct);
    Task<IReadOnlyList<CirculationActivityDto>> GetRecentActivityAsync(CancellationToken ct);
    Task<IReadOnlyList<CirculationCopyIssueDto>> GetCopyIssuesAsync(CancellationToken ct);
    Task<CirculationSettings> GetSettingsAsync(CancellationToken ct);
    Task<bool> TryClaimCopyAsync(Guid copyId, CancellationToken ct);
    Task<bool> TryClaimIncidentAsync(Guid incidentId, Guid? librarianId, CancellationToken ct);
    Task AddNotificationAsync(Notification notification, CancellationToken ct);
    Task<T> InTransactionAsync<T>(Func<Task<T>> work, CancellationToken ct);
}
