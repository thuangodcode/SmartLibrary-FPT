using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class CirculationRepository : ICirculationRepository
{
    private readonly AppDbContext _db;

    public CirculationRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<CirculationReminderDto>> MarkOverdueAsync(CancellationToken ct)
    {
        var cutoff = CirculationRules.StartOfLibraryDateUtc(DateTime.UtcNow);
        var newlyOverdue = await _db.BorrowRecords.AsNoTracking()
            .Where(x => x.Status == BorrowStatus.Borrowed && x.DueDate != null && x.DueDate < cutoff)
            .Select(x => new CirculationReminderDto(
                x.ReaderId, x.Id, x.BookCopy.BookId, x.BookCopy.Book.Title, x.DueDate))
            .ToListAsync(ct);
        if (newlyOverdue.Count == 0)
            return newlyOverdue;
        await _db.BorrowRecords
            .Where(x => x.Status == BorrowStatus.Borrowed && x.DueDate != null && x.DueDate < cutoff)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Status, BorrowStatus.Overdue), ct);
        return newlyOverdue;
    }

    public async Task<CirculationStatsDto> GetStatsAsync(int finePerDay, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var weekStart = now.Date.AddDays(-(int)now.DayOfWeek + (int)DayOfWeek.Monday);
        if (now.DayOfWeek == DayOfWeek.Sunday)
            weekStart = now.Date.AddDays(-6);
        var lastWeekStart = weekStart.AddDays(-7);
        var dueSoonLimit = now.AddDays(3);

        var loans = await _db.BorrowRecords.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(group => new
            {
                Borrowed = group.Count(x => x.Status == BorrowStatus.Borrowed || x.Status == BorrowStatus.Overdue),
                Returned = group.Count(x => x.Status == BorrowStatus.Returned),
                Overdue = group.Count(x => x.Status == BorrowStatus.Overdue),
                DueSoon = group.Count(x =>
                    x.Status == BorrowStatus.Borrowed && x.DueDate != null &&
                    x.DueDate >= now && x.DueDate <= dueSoonLimit),
                BorrowedThis = group.Count(x => x.BorrowDate >= weekStart && x.BorrowDate < weekStart.AddDays(7)),
                BorrowedLast = group.Count(x => x.BorrowDate >= lastWeekStart && x.BorrowDate < weekStart),
                ReturnedThis = group.Count(x => x.ReturnDate >= weekStart && x.ReturnDate < weekStart.AddDays(7)),
                ReturnedLast = group.Count(x => x.ReturnDate >= lastWeekStart && x.ReturnDate < weekStart),
                OverdueThis = group.Count(x => x.Status == BorrowStatus.Overdue && x.DueDate >= weekStart),
                OverdueLast = group.Count(x =>
                    x.DueDate >= lastWeekStart && x.DueDate < weekStart && x.Status == BorrowStatus.Overdue)
            })
            .SingleOrDefaultAsync(ct);

        var fines = await _db.Fines.AsNoTracking()
            .GroupBy(_ => 1)
            .Select(group => new
            {
                Unpaid = group.Sum(x => x.Status == FineStatus.Pending ? (decimal?)x.Amount : 0m),
                UnpaidThis = group.Sum(x =>
                    x.Status == FineStatus.Pending && x.CreatedAt >= weekStart ? (decimal?)x.Amount : 0m),
                UnpaidLast = group.Sum(x =>
                    x.Status == FineStatus.Pending && x.CreatedAt >= lastWeekStart && x.CreatedAt < weekStart
                        ? (decimal?)x.Amount
                        : 0m)
            })
            .SingleOrDefaultAsync(ct);

        return new CirculationStatsDto
        {
            Borrowed = loans?.Borrowed ?? 0,
            BorrowedDelta = (loans?.BorrowedThis ?? 0) - (loans?.BorrowedLast ?? 0),
            Returned = loans?.Returned ?? 0,
            ReturnedDelta = (loans?.ReturnedThis ?? 0) - (loans?.ReturnedLast ?? 0),
            Overdue = loans?.Overdue ?? 0,
            OverdueDelta = (loans?.OverdueThis ?? 0) - (loans?.OverdueLast ?? 0),
            UnpaidFines = fines?.Unpaid ?? 0,
            UnpaidFinesDelta = (fines?.UnpaidThis ?? 0) - (fines?.UnpaidLast ?? 0),
            DueSoon = loans?.DueSoon ?? 0,
            SuggestedFinePerDay = finePerDay
        };
    }

    public async Task<(IReadOnlyList<CirculationLoanDto> Items, int Total)> GetLoansAsync(
        string? search, string? status, DateTime? borrowedFromUtc, DateTime? borrowedBeforeUtc,
        int page, int pageSize, int finePerDay, CancellationToken ct)
    {
        var query = LoanQuery();
        query = ApplyLoanSearch(query, search);
        query = ApplyLoanStatus(query, status);
        if (borrowedFromUtc.HasValue)
            query = query.Where(x => x.BorrowDate >= borrowedFromUtc.Value);
        if (borrowedBeforeUtc.HasValue)
            query = query.Where(x => x.BorrowDate < borrowedBeforeUtc.Value);
        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(x => x.BorrowDate ?? x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
        return (await MapLoansAsync(rows, finePerDay, ct), total);
    }

    public async Task<CirculationLoanDto?> GetLoanAsync(Guid id, int finePerDay, CancellationToken ct)
    {
        var row = await LoanQuery().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (row is null) return null;
        var mapped = await MapLoansAsync([row], finePerDay, ct);
        return mapped[0];
    }

    public async Task<UserProfile?> FindReaderAsync(string key, CancellationToken ct)
    {
        var trimmed = key.Trim();
        if (Guid.TryParse(trimmed, out var id))
            return await _db.UserProfiles.FirstOrDefaultAsync(x => x.Id == id, ct);

        var lower = trimmed.ToLower();
        return await _db.UserProfiles.FirstOrDefaultAsync(x =>
            x.Email.ToLower() == lower ||
            (x.StudentId != null && x.StudentId.ToLower() == lower) ||
            x.FullName.ToLower() == lower, ct);
    }

    public Task<UserProfile?> FindReaderAccountAsync(Guid readerId, CancellationToken ct)
        => _db.UserProfiles
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == readerId && !x.IsDeleted && x.Role.Name == "Reader", ct);

    public async Task<IReadOnlyList<CirculationReaderOptionDto>> SearchReaderOptionsAsync(
        string search, int limit, CancellationToken ct)
    {
        var query = search.Trim().ToLower();
        if (query.Length < 2) return [];
        return await _db.UserProfiles.AsNoTracking()
            .Where(x => !x.IsDeleted && x.Role.Name == "Reader"
                && (x.FullName.ToLower().Contains(query)
                    || (x.StudentId != null && x.StudentId.ToLower().Contains(query))
                    || x.Email.ToLower().Contains(query)))
            .OrderBy(x => x.FullName)
            .Take(Math.Clamp(limit, 1, 10))
            .Select(x => new CirculationReaderOptionDto(x.Id, x.FullName, x.StudentId, x.Email))
            .ToListAsync(ct);
    }

    public async Task<IReadOnlyList<CirculationBookOptionDto>> SearchBookOptionsAsync(
        string search, int limit, CancellationToken ct)
    {
        var query = search.Trim().ToLower();
        if (query.Length < 2) return [];
        return await _db.Books.AsNoTracking()
            .Where(x => !x.IsDeleted
                && (x.Title.ToLower().Contains(query)
                    || x.Code.ToLower().Contains(query)
                    || (x.Isbn != null && x.Isbn.ToLower().Contains(query))))
            .OrderBy(x => x.Title)
            .Take(Math.Clamp(limit, 1, 10))
            .Select(x => new CirculationBookOptionDto(x.Id, x.Title, x.Code))
            .ToListAsync(ct);
    }

    public Task<BookCopy?> FindCopyByBarcodeAsync(string barcode, CancellationToken ct)
        => _db.BookCopies
            .Include(x => x.Book).ThenInclude(x => x.Categories)
            .FirstOrDefaultAsync(x => x.Barcode == barcode, ct);

    public Task<BookCopy?> FindAvailableCopyForBookAsync(Guid bookId, CancellationToken ct)
        => _db.BookCopies
            .Include(copy => copy.Book).ThenInclude(book => book.Categories)
            .Where(copy => copy.BookId == bookId
                && copy.Book != null
                && !copy.Book.IsDeleted
                && copy.IsAvailable
                && copy.Condition != BookCondition.Damaged
                && copy.Condition != BookCondition.Lost
                && !_db.BorrowRecords.Any(loan =>
                    loan.BookCopyId == copy.Id
                    && (loan.Status == BorrowStatus.Approved
                        || loan.Status == BorrowStatus.Borrowed
                        || loan.Status == BorrowStatus.Overdue)))
            .OrderBy(copy => copy.Barcode)
            .FirstOrDefaultAsync(ct);

    public Task<bool> HasActiveLoanAsync(Guid copyId, Guid? exceptLoanId, CancellationToken ct)
    {
        var query = _db.BorrowRecords.Where(x =>
            x.BookCopyId == copyId &&
            (x.Status == BorrowStatus.Borrowed
             || x.Status == BorrowStatus.Overdue
             || x.Status == BorrowStatus.Approved));
        if (exceptLoanId.HasValue)
            query = query.Where(x => x.Id != exceptLoanId.Value);
        return query.AnyAsync(ct);
    }

    public Task<int> CountActiveLoansAsync(Guid readerId, Guid? exceptLoanId, CancellationToken ct)
    {
        var query = _db.BorrowRecords.Where(x =>
            x.ReaderId == readerId &&
            (x.Status == BorrowStatus.Borrowed
             || x.Status == BorrowStatus.Overdue
             || x.Status == BorrowStatus.Approved
             || x.Status == BorrowStatus.Pending));
        if (exceptLoanId.HasValue)
            query = query.Where(x => x.Id != exceptLoanId.Value);
        return query.CountAsync(ct);
    }

    public Task<bool> HasOverdueLoansAsync(Guid readerId, DateTime asOfUtc, CancellationToken ct)
    {
        var overdueStart = CirculationRules.StartOfLibraryDateUtc(asOfUtc);
        return _db.BorrowRecords.AnyAsync(x =>
            x.ReaderId == readerId &&
            (x.Status == BorrowStatus.Overdue
             || (x.Status == BorrowStatus.Borrowed && x.DueDate.HasValue && x.DueDate.Value < overdueStart)), ct);
    }

    public Task<int> CountPickupRequestsAsync(DateTime pickupAt, CancellationToken ct)
        => _db.BorrowRecords.CountAsync(x =>
            x.PickupAt == pickupAt &&
            (x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved), ct);

    public async Task<IReadOnlyDictionary<DateTime, int>> GetPickupRequestCountsAsync(
        IReadOnlyList<DateTime> pickupTimes, CancellationToken ct)
    {
        if (pickupTimes.Count == 0) return new Dictionary<DateTime, int>();
        return await _db.BorrowRecords
            .Where(x => x.PickupAt.HasValue && pickupTimes.Contains(x.PickupAt.Value)
                && (x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved))
            .GroupBy(x => x.PickupAt!.Value)
            .Select(group => new { PickupAt = group.Key, Count = group.Count() })
            .ToDictionaryAsync(x => x.PickupAt, x => x.Count, ct);
    }

    public Task LockBorrowReaderAsync(Guid readerId, CancellationToken ct)
        => _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext({readerId.ToString()})::bigint)", ct);

    public Task LockPickupSlotAsync(DateTime pickupAt, CancellationToken ct)
        => _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext({pickupAt.ToString("O")})::bigint)", ct);

    public Task LockReservationBookAsync(Guid bookId, CancellationToken ct)
        => _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT pg_advisory_xact_lock(hashtext({"reservation:" + bookId})::bigint)", ct);

    public Task<string?> GetBookTitleAsync(Guid bookId, CancellationToken ct)
        => _db.Books.Where(x => x.Id == bookId).Select(x => x.Title).FirstOrDefaultAsync(ct);

    public Task<bool> HasActiveLoanForBookAsync(Guid readerId, Guid bookId, CancellationToken ct)
        => _db.BorrowRecords.AnyAsync(x =>
            x.ReaderId == readerId &&
            x.BookCopy.BookId == bookId &&
            (x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved
             || x.Status == BorrowStatus.Borrowed || x.Status == BorrowStatus.Overdue), ct);

    public Task<bool> HasOtherBorrowRequestAsync(Guid copyId, Guid exceptLoanId, CancellationToken ct)
        => _db.BorrowRecords.AnyAsync(x =>
            x.BookCopyId == copyId && x.Id != exceptLoanId &&
            (x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved), ct);

    public async Task<IReadOnlyList<Guid>> GetExpiredPickupRequestIdsAsync(
        DateTime expiredBeforeUtc, int limit, CancellationToken ct)
        => await _db.BorrowRecords.AsNoTracking()
            .Where(x => x.PickupAt.HasValue && x.PickupAt.Value <= expiredBeforeUtc
                && (x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved))
            .OrderBy(x => x.PickupAt)
            .Select(x => x.Id)
            .Take(limit)
            .ToListAsync(ct);

    public Task LockBorrowRequestAsync(Guid loanId, CancellationToken ct)
        => _db.Database.ExecuteSqlInterpolatedAsync(
            $"SELECT id FROM borrow_records WHERE id = {loanId} FOR UPDATE", ct);

    public async Task ReloadTrackedLoanAsync(Guid loanId, CancellationToken ct)
    {
        var loan = await _db.BorrowRecords.FirstOrDefaultAsync(x => x.Id == loanId, ct);
        if (loan is not null)
            await _db.Entry(loan).ReloadAsync(ct);
    }

    public Task<bool> HasUnpaidFinesAsync(Guid readerId, CancellationToken ct)
        => _db.Fines.AnyAsync(x => x.ReaderId == readerId && x.Status == FineStatus.Pending, ct);

    public async Task AddLoanAsync(BorrowRecord loan, CancellationToken ct)
        => await _db.BorrowRecords.AddAsync(loan, ct);

    public Task<BorrowRecord?> GetTrackedLoanAsync(Guid id, CancellationToken ct)
        => _db.BorrowRecords
            .Include(x => x.BookCopy).ThenInclude(x => x.Book).ThenInclude(x => x.Categories)
            .FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<BorrowRecord?> FindActiveLoanByBarcodeAsync(string barcode, CancellationToken ct)
        => _db.BorrowRecords
            .Include(x => x.BookCopy).ThenInclude(x => x.Book).ThenInclude(x => x.Categories)
            .Where(x => x.BookCopy.Barcode == barcode &&
                        (x.Status == BorrowStatus.Borrowed || x.Status == BorrowStatus.Overdue))
            .OrderByDescending(x => x.BorrowDate)
            .FirstOrDefaultAsync(ct);

    public async Task<IReadOnlyList<CirculationLoanDto>> GetOverdueAsync(int finePerDay, CancellationToken ct)
    {
        var rows = await LoanQuery()
            .Where(x => x.Status == BorrowStatus.Overdue)
            .OrderBy(x => x.DueDate)
            .ToListAsync(ct);
        return await MapLoansAsync(rows, finePerDay, ct);
    }

    public async Task<IReadOnlyList<CirculationFineDto>> GetFinesAsync(string? search, string? status, CancellationToken ct)
    {
        var query = _db.Fines.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.BorrowRecord).ThenInclude(x => x.BookCopy).ThenInclude(x => x.Book)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(x =>
                x.Reader.FullName.ToLower().Contains(q) ||
                x.BorrowRecord.BookCopy.Barcode.ToLower().Contains(q) ||
                x.BorrowRecord.BookCopy.Book.Title.ToLower().Contains(q));
        }

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<FineStatus>(status, true, out var parsed))
        {
            query = parsed switch
            {
                FineStatus.Pending => query.Where(x => x.Status == FineStatus.Pending),
                FineStatus.Paid => query.Where(x => x.Status == FineStatus.Paid),
                FineStatus.Waived => query.Where(x => x.Status == FineStatus.Waived),
                _ => query
            };
        }

        var rows = await query.OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct);
        return rows.Select(MapFine).ToList();
    }

    public Task<bool> HasOpenFineAsync(Guid borrowRecordId, CancellationToken ct)
        => _db.Fines.AnyAsync(x => x.BorrowRecordId == borrowRecordId && x.Status == FineStatus.Pending, ct);

    public Task<bool> HasOverdueFineAsync(Guid borrowRecordId, CancellationToken ct)
        => _db.Fines.AnyAsync(x =>
            x.BorrowRecordId == borrowRecordId &&
            x.Reason.StartsWith(CirculationRules.OverdueReasonPrefix), ct);

    public Task<bool> HasCompensationFineAsync(Guid borrowRecordId, CancellationToken ct)
        => _db.Fines.AnyAsync(x =>
            x.BorrowRecordId == borrowRecordId &&
            (x.Reason.StartsWith(CirculationRules.CompensationLostPrefix)
             || x.Reason.StartsWith(CirculationRules.CompensationDamagePrefix)), ct);

    public Task<bool> HasOpenIncidentAsync(Guid borrowRecordId, CancellationToken ct)
        => _db.BookIncidents.AnyAsync(x =>
            x.BorrowRecordId == borrowRecordId &&
            (x.Status == BookIncidentStatus.PendingReview
             || x.Status == BookIncidentStatus.CompensationPending), ct);

    public async Task AddIncidentAsync(BookIncident incident, CancellationToken ct)
        => await _db.BookIncidents.AddAsync(incident, ct);

    public Task<BookIncident?> GetTrackedIncidentAsync(Guid id, CancellationToken ct)
        => _db.BookIncidents
            .Include(x => x.BookCopy).ThenInclude(x => x.Book)
            .Include(x => x.BorrowRecord)
            .Include(x => x.CompensationFine)
            .Include(x => x.OverdueFine)
            .FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<BookIncident?> FindIncidentByFineIdAsync(Guid fineId, CancellationToken ct)
        => _db.BookIncidents
            .Include(x => x.CompensationFine)
            .Include(x => x.OverdueFine)
            .FirstOrDefaultAsync(x => x.CompensationFineId == fineId || x.OverdueFineId == fineId, ct);

    public async Task<IReadOnlyList<CirculationIncidentDto>> GetIncidentsAsync(int finePerDay, CancellationToken ct)
    {
        var rows = await IncidentQuery()
            .OrderByDescending(x => x.CreatedAt)
            .Take(50)
            .ToListAsync(ct);
        return rows.Select(x => MapIncident(x, finePerDay)).ToList();
    }

    public async Task<CirculationIncidentDto?> GetIncidentDtoAsync(Guid id, int finePerDay, CancellationToken ct)
    {
        var row = await IncidentQuery().FirstOrDefaultAsync(x => x.Id == id, ct);
        return row is null ? null : MapIncident(row, finePerDay);
    }

    public async Task<IReadOnlyList<CirculationFineDto>> GetFinesForReaderAsync(Guid readerId, CancellationToken ct)
    {
        var rows = await _db.Fines.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.BorrowRecord).ThenInclude(x => x.BookCopy).ThenInclude(x => x.Book)
            .Where(x => x.ReaderId == readerId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        return rows.Select(MapFine).ToList();
    }

    public async Task<(IReadOnlyList<CirculationLoanDto> Items, int Total)> GetLoansForReaderAsync(
        Guid readerId, int page, int pageSize, CirculationSettings settings, CancellationToken ct)
    {
        var query = LoanQuery().Where(x => x.ReaderId == readerId);
        var total = await query.CountAsync(ct);
        var rows = await query
            .OrderByDescending(x => x.BorrowDate ?? x.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);
        var loans = (await MapLoansAsync(rows, settings.FinePerDay, ct)).ToList();
        if (loans.Count == 0)
            return (loans, total);

        var now = DateTime.UtcNow;
        var hasUnpaidFines = settings.RestrictIfUnpaid
            && await HasUnpaidFinesAsync(readerId, ct);
        var reservedBookIds = new HashSet<Guid>();
        if (settings.BlockRenewIfReserved)
        {
            var activeBookIds = rows
                .Where(x => x.Status is BorrowStatus.Borrowed or BorrowStatus.Overdue)
                .Select(x => x.BookCopy.BookId)
                .Distinct()
                .ToList();
            if (activeBookIds.Count > 0)
            {
                var reservedIds = await _db.Reservations.AsNoTracking()
                    .Where(x => activeBookIds.Contains(x.BookId)
                        && x.ReaderId != readerId
                        && (x.Status == CirculationRules.ReservationPending
                            || (x.Status == CirculationRules.ReservationReady
                                && (x.ExpiresAt == null || x.ExpiresAt >= now))))
                    .Select(x => x.BookId)
                    .Distinct()
                    .ToListAsync(ct);
                reservedBookIds = reservedIds.ToHashSet();
            }
        }

        for (var index = 0; index < rows.Count; index++)
        {
            var row = rows[index];
            var isRenewableStatus = row.Status is BorrowStatus.Borrowed or BorrowStatus.Overdue;
            var unavailableReason = isRenewableStatus
                ? CirculationRules.ValidateRenewal(
                    settings,
                    row.RenewalCount,
                    row.DueDate,
                    now,
                    byLibrarian: false,
                    CirculationRules.CalendarOverdueDays(row.DueDate, now) > 0,
                    reservedBookIds.Contains(row.BookCopy.BookId),
                    CirculationRules.IsTextbook(row.BookCopy.Book.Categories?.Select(x => x.Name)),
                    hasUnpaidFines)
                : "Chỉ có thể gia hạn phiếu đang mượn.";
            loans[index] = loans[index] with
            {
                CanRenew = unavailableReason is null,
                RenewalUnavailableReason = unavailableReason
            };
        }

        return (loans, total);
    }

    public async Task<CirculationFineDto?> GetFineDtoAsync(Guid id, CancellationToken ct)
    {
        var row = await _db.Fines.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.BorrowRecord).ThenInclude(x => x.BookCopy).ThenInclude(x => x.Book)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        return row is null ? null : MapFine(row);
    }

    public async Task AddFineAsync(Fine fine, CancellationToken ct)
        => await _db.Fines.AddAsync(fine, ct);

    public Task<Fine?> GetTrackedFineAsync(Guid id, CancellationToken ct)
        => _db.Fines.FirstOrDefaultAsync(x => x.Id == id, ct);

    public async Task<IReadOnlyList<CirculationLoanDto>> GetPendingAsync(int finePerDay, CancellationToken ct)
    {
        var rows = await LoanQuery()
            .Where(x => x.Status == BorrowStatus.Pending || x.Status == BorrowStatus.Approved)
            .OrderBy(x => x.PickupAt ?? x.CreatedAt)
            .ToListAsync(ct);
        return await MapLoansAsync(rows, finePerDay, ct);
    }

    public Task<IReadOnlyList<CirculationReservationDto>> GetReservationsAsync(CancellationToken ct)
        => MapReservationsAsync(
            _db.Reservations.AsNoTracking()
                .Include(x => x.Reader)
                .Include(x => x.Book)
                .Where(x => x.Status == CirculationRules.ReservationPending || x.Status == CirculationRules.ReservationReady)
                .OrderBy(x => x.ReservedAt),
            ct);

    public Task<IReadOnlyList<CirculationReservationDto>> GetReservationsForReaderAsync(Guid readerId, CancellationToken ct)
        => MapReservationsAsync(
            _db.Reservations.AsNoTracking()
                .Include(x => x.Reader)
                .Include(x => x.Book)
                .Where(x => x.ReaderId == readerId)
                .OrderByDescending(x => x.ReservedAt)
                .Take(20),
            ct);

    public Task<Reservation?> GetTrackedReservationAsync(Guid id, CancellationToken ct)
        => _db.Reservations.Include(x => x.Book).FirstOrDefaultAsync(x => x.Id == id, ct);

    public Task<bool> HasOpenReservationAsync(Guid readerId, Guid bookId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return _db.Reservations.AnyAsync(x =>
            x.ReaderId == readerId &&
            x.BookId == bookId &&
            (x.Status == CirculationRules.ReservationPending
             || (x.Status == CirculationRules.ReservationReady && (x.ExpiresAt == null || x.ExpiresAt >= now))), ct);
    }

    public Task<bool> HasOtherReservationAsync(Guid bookId, Guid readerId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return _db.Reservations.AnyAsync(x =>
            x.BookId == bookId &&
            x.ReaderId != readerId &&
            (x.Status == CirculationRules.ReservationPending
             || (x.Status == CirculationRules.ReservationReady && (x.ExpiresAt == null || x.ExpiresAt >= now))), ct);
    }

    public Task<Reservation?> FindOpenReservationAsync(Guid readerId, Guid bookId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return _db.Reservations.FirstOrDefaultAsync(x =>
            x.ReaderId == readerId &&
            x.BookId == bookId &&
            (x.Status == CirculationRules.ReservationPending
             || (x.Status == CirculationRules.ReservationReady && (x.ExpiresAt == null || x.ExpiresAt >= now))), ct);
    }

    public async Task<IReadOnlyList<ExpiredReservationDto>> ExpireReadyReservationsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var expired = await _db.Reservations.AsNoTracking()
            .Where(x => x.Status == CirculationRules.ReservationReady && x.ExpiresAt != null && x.ExpiresAt < now)
            .Select(x => new ExpiredReservationDto(x.Id, x.ReaderId, x.BookId, x.Book.Title, x.ExpiresAt))
            .ToListAsync(ct);
        if (expired.Count == 0)
            return expired;
        await _db.Reservations
            .Where(x => x.Status == CirculationRules.ReservationReady && x.ExpiresAt != null && x.ExpiresAt < now)
            .ExecuteUpdateAsync(set => set
                .SetProperty(x => x.Status, CirculationRules.ReservationExpired)
                .SetProperty(x => x.UpdatedAt, now), ct);
        return expired;
    }

    public async Task<Reservation?> ReadyNextReservationAsync(Guid bookId, int pickupHours, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var expires = now.AddHours(Math.Max(1, pickupHours));
        var claimedId = await ClaimNextPendingReservationIdAsync(bookId, expires, now, ct);
        if (claimedId is null)
            return null;

        var tracked = _db.Reservations.Local.FirstOrDefault(x => x.Id == claimedId.Value);
        if (tracked != null)
        {
            tracked.Status = CirculationRules.ReservationReady;
            tracked.ExpiresAt = expires;
            tracked.UpdatedAt = now;
        }

        return await _db.Reservations
            .Include(x => x.Reader)
            .Include(x => x.Book)
            .FirstOrDefaultAsync(x => x.Id == claimedId.Value, ct);
    }

    public Task<int> CountReadyReservationsAsync(Guid bookId, Guid exceptReaderId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return _db.Reservations.CountAsync(x =>
            x.BookId == bookId &&
            x.ReaderId != exceptReaderId &&
            x.Status == CirculationRules.ReservationReady &&
            (x.ExpiresAt == null || x.ExpiresAt >= now), ct);
    }

    public Task<int> CountAvailableCopiesAsync(Guid bookId, CancellationToken ct)
        => _db.BookCopies.CountAsync(x =>
            x.BookId == bookId &&
            x.IsAvailable &&
            x.Condition != BookCondition.Damaged &&
            x.Condition != BookCondition.Lost, ct);

    public async Task AddReservationAsync(Reservation reservation, CancellationToken ct)
        => await _db.Reservations.AddAsync(reservation, ct);

    public async Task<IReadOnlyList<CirculationActivityDto>> GetRecentActivityAsync(CancellationToken ct)
    {
        var rows = await _db.BorrowRecords.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.BookCopy)
            .Where(x => x.Status == BorrowStatus.Borrowed || x.Status == BorrowStatus.Returned)
            .OrderByDescending(x => x.ReturnDate ?? x.BorrowDate ?? x.CreatedAt)
            .Take(8)
            .ToListAsync(ct);

        return rows.Select(x => new CirculationActivityDto
        {
            Id = x.Id,
            At = x.ReturnDate ?? x.BorrowDate ?? x.CreatedAt,
            Kind = x.Status == BorrowStatus.Returned ? "Returned" : "Borrowed",
            Barcode = x.BookCopy.Barcode,
            ReaderName = x.Reader.FullName
        }).ToList();
    }

    public async Task<IReadOnlyList<CirculationCopyIssueDto>> GetCopyIssuesAsync(CancellationToken ct)
    {
        var rows = await IncidentQuery()
            .OrderByDescending(x => x.CreatedAt)
            .Take(20)
            .ToListAsync(ct);

        return rows.Select(x => new CirculationCopyIssueDto
        {
            IncidentId = x.Id,
            Barcode = x.BookCopy.Barcode,
            BookTitle = x.BookCopy.Book.Title,
            Type = x.Kind == BookIncidentKind.Lost ? "Thất lạc" : "Hư hỏng",
            ReaderName = x.Reader.FullName,
            Status = x.Status.ToString()
        }).ToList();
    }

    public async Task<CirculationSettings> GetSettingsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var requiredTypes = new List<PolicyRuleType>
        {
            PolicyRuleType.BorrowLimit,
            PolicyRuleType.BorrowDuration,
            PolicyRuleType.Renewal,
            PolicyRuleType.FineFee,
            PolicyRuleType.Reservation,
            PolicyRuleType.CategoryOverride
        };
        var policies = await _db.PolicyRules.AsNoTracking()
            .Include(x => x.Parameters)
            .Where(x => requiredTypes.Contains(x.PolicyType) && x.Status == PolicyRuleStatus.Active)
            .Where(x => x.EffectiveFrom == null || x.EffectiveFrom <= now)
            .Where(x => x.EffectiveTo == null || x.EffectiveTo >= now)
            .OrderByDescending(x => x.Priority)
            .ToListAsync(ct);
        var parameters = policies
            .GroupBy(x => x.PolicyType)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var rule = group.First();
                    return rule.Parameters
                        .GroupBy(x => x.ParamKey, StringComparer.OrdinalIgnoreCase)
                        .ToDictionary(values => values.Key, values => values.First().ParamValue, StringComparer.OrdinalIgnoreCase);
                });
        var empty = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var limit = parameters.GetValueOrDefault(PolicyRuleType.BorrowLimit) ?? empty;
        var duration = parameters.GetValueOrDefault(PolicyRuleType.BorrowDuration) ?? empty;
        var renewal = parameters.GetValueOrDefault(PolicyRuleType.Renewal) ?? empty;
        var fine = parameters.GetValueOrDefault(PolicyRuleType.FineFee) ?? empty;
        var reservation = parameters.GetValueOrDefault(PolicyRuleType.Reservation) ?? empty;
        var category = parameters.GetValueOrDefault(PolicyRuleType.CategoryOverride) ?? empty;
        var renewalDays = ReadInt(renewal, "renewal_days") ?? 7;
        return new CirculationSettings
        {
            MaxBooks = ReadInt(limit, "max_books"),
            MaxBooksStudent = ReadInt(limit, "max_books_student") ?? ReadInt(limit, "max_books"),
            MaxBooksLecturer = ReadInt(limit, "max_books_lecturer") ?? ReadInt(limit, "max_books"),
            BorrowDays = ReadInt(duration, "max_days") ?? 14,
            BorrowDaysVi = ReadInt(duration, "max_days_vi") ?? 7,
            BorrowDaysForeign = ReadInt(duration, "max_days_foreign") ?? ReadInt(duration, "max_days_en") ?? 14,
            MaxRenewals = ReadInt(renewal, "max_renewals"),
            RenewalDaysVi = ReadInt(renewal, "renewal_days_vi") ?? renewalDays,
            RenewalDaysForeign = ReadInt(renewal, "renewal_days_foreign") ?? ReadInt(renewal, "renewal_days_en") ?? 14,
            BlockRenewIfOverdue = ReadBool(renewal, "block_if_overdue"),
            BlockRenewIfReserved = ReadBool(renewal, "block_if_reserved"),
            SelfRenewBeforeDays = ReadInt(renewal, "self_renew_before_days") ?? 1,
            SelfRenewAfterDays = ReadInt(renewal, "self_renew_after_days") ?? 1,
            TextbookRequiresApproval = ReadBool(renewal, "textbook_requires_approval") || ReadBool(category, "textbook_requires_approval"),
            FinePerDay = ReadInt(fine, "overdue_fee_per_day") ?? 0,
            RestrictIfUnpaid = !fine.ContainsKey("restrict_if_unpaid") || ReadBool(fine, "restrict_if_unpaid"),
            AllowReservation = !reservation.ContainsKey("allow_reservation") || ReadBool(reservation, "allow_reservation"),
            HoldHours = ReadInt(reservation, "hold_hours"),
            PickupDeadlineHours = ReadInt(reservation, "pickup_deadline_hours") ?? ReadInt(reservation, "hold_hours") ?? 24,
            PickupCapacityPerSlot = Math.Max(1, ReadInt(reservation, "pickup_capacity_per_slot") ?? 5),
            PickupSlotMinutes = Math.Max(1, ReadInt(reservation, "pickup_slot_minutes") ?? 30),
            PickupDaysAhead = Math.Max(1, ReadInt(reservation, "pickup_days_ahead") ?? 14),
            BlockBorrowIfOverdue = !limit.ContainsKey("block_if_overdue") || ReadBool(limit, "block_if_overdue")
        };
    }

    public async Task<bool> TryClaimCopyAsync(Guid copyId, CancellationToken ct)
    {
        var updated = await _db.BookCopies
            .Where(x => x.Id == copyId
                        && x.IsAvailable
                        && x.Condition != BookCondition.Damaged
                        && x.Condition != BookCondition.Lost)
            .ExecuteUpdateAsync(set => set
                .SetProperty(x => x.IsAvailable, false)
                .SetProperty(x => x.UpdatedAt, DateTime.UtcNow), ct);
        return updated == 1;
    }

    public async Task<bool> TryClaimIncidentAsync(Guid incidentId, Guid? librarianId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var updated = await _db.BookIncidents
            .Where(x => x.Id == incidentId
                        && x.Status == BookIncidentStatus.PendingReview
                        && x.CompensationFineId == null
                        && x.ConfirmedAt == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(x => x.ConfirmedAt, now)
                .SetProperty(x => x.ConfirmedBy, librarianId)
                .SetProperty(x => x.UpdatedAt, now), ct);
        return updated == 1;
    }

    public async Task AddNotificationAsync(Notification notification, CancellationToken ct)
        => await _db.Notifications.AddAsync(notification, ct);

    private async Task<Guid?> ClaimNextPendingReservationIdAsync(
        Guid bookId, DateTime expiresAt, DateTime now, CancellationToken ct)
    {
        var connection = _db.Database.GetDbConnection();
        if (connection.State != ConnectionState.Open)
            await _db.Database.OpenConnectionAsync(ct);

        await using var command = connection.CreateCommand();
        command.Transaction = _db.Database.CurrentTransaction?.GetDbTransaction();
        command.CommandText = """
            UPDATE reservations
            SET status = 'ready'::reservation_status,
                expires_at = @expires,
                updated_at = @now
            WHERE id = (
                SELECT id FROM reservations
                WHERE book_id = @bookId
                  AND status = 'pending'::reservation_status
                  AND is_deleted = FALSE
                ORDER BY reserved_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            RETURNING id
            """;
        AddDbParameter(command, "@expires", expiresAt);
        AddDbParameter(command, "@now", now);
        AddDbParameter(command, "@bookId", bookId);

        await using var reader = await command.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return null;
        return reader.GetGuid(0);
    }

    private static void AddDbParameter(IDbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }

    public async Task<T> InTransactionAsync<T>(Func<Task<T>> work, CancellationToken ct)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        try
        {
            var result = await work();
            await transaction.CommitAsync(ct);
            return result;
        }
        catch
        {
            await transaction.RollbackAsync(ct);
            throw;
        }
    }

    private static int? ReadInt(IReadOnlyDictionary<string, string> map, string key)
    {
        if (!map.TryGetValue(key, out var raw)) return null;
        return int.TryParse(raw, out var number) ? number : null;
    }

    private static bool ReadBool(IReadOnlyDictionary<string, string> map, string key)
    {
        if (!map.TryGetValue(key, out var raw)) return false;
        return raw.Equals("true", StringComparison.OrdinalIgnoreCase) || raw == "1";
    }

    private static async Task<IReadOnlyList<CirculationReservationDto>> MapReservationsAsync(
        IQueryable<Reservation> query, CancellationToken ct)
    {
        var rows = await query.ToListAsync(ct);
        return rows.Select(x => new CirculationReservationDto
        {
            Id = x.Id,
            ReaderId = x.ReaderId,
            BookId = x.BookId,
            ReaderName = x.Reader.FullName,
            BookTitle = x.Book.Title,
            Status = x.Status,
            ReservedAt = x.ReservedAt,
            ExpiresAt = x.ExpiresAt
        }).ToList();
    }

    private IQueryable<BorrowRecord> LoanQuery()
        => _db.BorrowRecords.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.Librarian)
            .Include(x => x.BookCopy).ThenInclude(x => x.Book).ThenInclude(x => x.Categories);

    private IQueryable<BookIncident> IncidentQuery()
        => _db.BookIncidents.AsNoTracking()
            .Include(x => x.Reader)
            .Include(x => x.BookCopy).ThenInclude(x => x.Book)
            .Include(x => x.BorrowRecord)
            .Include(x => x.CompensationFine)
            .Include(x => x.OverdueFine);

    private static CirculationIncidentDto MapIncident(BookIncident incident, int finePerDay)
    {
        var loan = incident.BorrowRecord;
        var reference = loan.ReturnDate ?? DateTime.UtcNow;
        var overdueDays = CirculationRules.CalendarOverdueDays(loan.DueDate, reference);
        var compensation = incident.CompensationFine?.Amount
            ?? CirculationRules.CompensationAmount(incident.Severity, incident.ReplacementValue, incident.AssessedFee);
        var overdueAmount = incident.OverdueFine?.Amount ?? 0;
        if (overdueAmount == 0 && incident.IncludeOverdue && overdueDays > 0 && finePerDay > 0)
            overdueAmount = CirculationRules.OverdueFineAmount(overdueDays, finePerDay);
        return new CirculationIncidentDto
        {
            Id = incident.Id,
            BorrowRecordId = incident.BorrowRecordId,
            ReaderId = incident.ReaderId,
            Kind = incident.Kind.ToString(),
            Severity = incident.Severity.ToString(),
            Status = incident.Status.ToString(),
            Barcode = incident.BookCopy.Barcode,
            BookTitle = incident.BookCopy.Book.Title,
            ReaderName = incident.Reader.FullName,
            OverdueDays = overdueDays,
            SuggestedOverdueFine = overdueDays > 0 && finePerDay > 0
                ? CirculationRules.OverdueFineAmount(overdueDays, finePerDay)
                : null,
            ReplacementValue = incident.ReplacementValue,
            AssessedFee = incident.AssessedFee,
            CompensationAmount = compensation,
            OverdueAmount = overdueAmount,
            TotalAmount = compensation + overdueAmount,
            CompensationFineId = incident.CompensationFineId,
            OverdueFineId = incident.OverdueFineId,
            Description = incident.Description,
            CreatedAt = incident.CreatedAt,
            ConfirmedAt = incident.ConfirmedAt
        };
    }

    private static IQueryable<BorrowRecord> ApplyLoanSearch(IQueryable<BorrowRecord> query, string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
            return query;
        var q = search.Trim().ToLower();
        return query.Where(x =>
            x.Reader.FullName.ToLower().Contains(q) ||
            x.Reader.Email.ToLower().Contains(q) ||
            (x.Reader.StudentId != null && x.Reader.StudentId.ToLower().Contains(q)) ||
            x.BookCopy.Barcode.ToLower().Contains(q) ||
            x.BookCopy.Book.Title.ToLower().Contains(q));
    }

    private static IQueryable<BorrowRecord> ApplyLoanStatus(IQueryable<BorrowRecord> query, string? status)
    {
        if (string.IsNullOrWhiteSpace(status) || status.Equals("All", StringComparison.OrdinalIgnoreCase))
            return query;
        if (!Enum.TryParse<BorrowStatus>(status, true, out var parsed))
            return query;

        return parsed switch
        {
            BorrowStatus.Pending => query.Where(x => x.Status == BorrowStatus.Pending),
            BorrowStatus.Approved => query.Where(x => x.Status == BorrowStatus.Approved),
            BorrowStatus.Borrowed => query.Where(x => x.Status == BorrowStatus.Borrowed),
            BorrowStatus.Returned => query.Where(x => x.Status == BorrowStatus.Returned),
            BorrowStatus.Overdue => query.Where(x => x.Status == BorrowStatus.Overdue),
            BorrowStatus.Rejected => query.Where(x => x.Status == BorrowStatus.Rejected),
            _ => query
        };
    }

    private async Task<IReadOnlyList<CirculationLoanDto>> MapLoansAsync(
        List<BorrowRecord> rows, int finePerDay, CancellationToken ct)
    {
        var ids = rows.Select(x => x.Id).ToList();
        var fines = await _db.Fines.AsNoTracking()
            .Where(x => ids.Contains(x.BorrowRecordId))
            .GroupBy(x => x.BorrowRecordId)
            .Select(group => new
            {
                BorrowRecordId = group.Key,
                HasOpenFine = group.Any(x => x.Status == FineStatus.Pending),
                HasFine = true
            })
            .ToListAsync(ct);
        var finesByLoan = fines.ToDictionary(x => x.BorrowRecordId);

        return rows.Select(row =>
        {
            var related = finesByLoan.GetValueOrDefault(row.Id);
            return MapLoan(row, finePerDay, related?.HasOpenFine ?? false, related?.HasFine ?? false);
        }).ToList();
    }

    private static CirculationLoanDto MapLoan(BorrowRecord loan, int finePerDay, bool hasOpenFine, bool hasFine)
    {
        var now = DateTime.UtcNow;
        var reference = loan.ReturnDate ?? now;
        var overdueDays = CirculationRules.CalendarOverdueDays(loan.DueDate, reference);
        var display = overdueDays > 0 && loan.Status != BorrowStatus.Returned ? "Overdue" : loan.Status.ToString();
        var categories = loan.BookCopy.Book.Categories?.Select(x => x.Name) ?? [];
        var isTextbook = CirculationRules.IsTextbook(categories);
        return new CirculationLoanDto
        {
            Id = loan.Id,
            Code = "PM" + loan.Id.ToString("N")[^6..].ToUpperInvariant(),
            BorrowDate = loan.BorrowDate,
            DueDate = loan.DueDate,
            PickupAt = loan.PickupAt,
            AcceptedAt = loan.AcceptedAt,
            ReturnDate = loan.ReturnDate,
            CreatedAt = loan.CreatedAt,
            Status = loan.Status.ToString(),
            DisplayStatus = display,
            OverdueDays = overdueDays,
            ReaderId = loan.ReaderId,
            ReaderName = loan.Reader.FullName,
            ReaderEmail = loan.Reader.Email,
            StudentId = loan.Reader.StudentId,
            LibrarianName = loan.Librarian?.FullName,
            BookCopyId = loan.BookCopyId,
            Barcode = loan.BookCopy.Barcode,
            BookTitle = loan.BookCopy.Book.Title,
            CopyCondition = loan.BookCopy.Condition.ToString(),
            SuggestedFine = overdueDays > 0 && finePerDay > 0 ? CirculationRules.OverdueFineAmount(overdueDays, finePerDay) : null,
            HasOpenFine = hasOpenFine,
            HasFine = hasFine,
            RenewalCount = loan.RenewalCount,
            RequiresApproval = isTextbook,
            Language = loan.BookCopy.Book.Language,
            CanRenew = loan.Status is BorrowStatus.Borrowed or BorrowStatus.Overdue
        };
    }

    private static CirculationFineDto MapFine(Fine fine) => new()
    {
        Id = fine.Id,
        Code = "SL-" + fine.Id.ToString("N")[^6..].ToUpperInvariant(),
        BorrowRecordId = fine.BorrowRecordId,
        ReaderId = fine.ReaderId,
        ReaderName = fine.Reader.FullName,
        BookTitle = fine.BorrowRecord.BookCopy.Book.Title,
        Barcode = fine.BorrowRecord.BookCopy.Barcode,
        Amount = fine.Amount,
        Reason = fine.Reason,
        Status = fine.Status.ToString(),
        CreatedAt = fine.CreatedAt,
        PaidAt = fine.PaidAt
    };
}
