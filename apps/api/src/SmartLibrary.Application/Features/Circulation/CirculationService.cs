using System.Security.Claims;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Circulation;

public class CirculationService
{
    private readonly ICirculationRepository _repository;
    private readonly IUnitOfWork _unitOfWork;

    public CirculationService(ICirculationRepository repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<CirculationStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.GetStatsAsync(settings.FinePerDay, ct);
    }

    public async Task<CirculationLoanListDto> GetLoansAsync(
        string? search, string? status, DateOnly? borrowedFrom, DateOnly? borrowedTo,
        int page, int pageSize, CancellationToken ct = default)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        var safePage = page < 1 ? 1 : page;
        var safeSize = pageSize < 1 ? 8 : Math.Min(pageSize, 50);
        DateTime? borrowedFromUtc = borrowedFrom.HasValue
            ? CirculationRules.StartOfLibraryDateUtc(borrowedFrom.Value)
            : null;
        DateTime? borrowedBeforeUtc = borrowedTo.HasValue
            ? CirculationRules.StartOfLibraryDateUtc(borrowedTo.Value.AddDays(1))
            : null;
        var (items, total) = await _repository.GetLoansAsync(
            search, status, borrowedFromUtc, borrowedBeforeUtc,
            safePage, safeSize, settings.FinePerDay, ct);
        return new CirculationLoanListDto
        {
            Items = items,
            TotalCount = total,
            Page = safePage,
            PageSize = safeSize,
            TotalPages = (int)Math.Ceiling(total / (double)safeSize)
        };
    }

    public async Task<Result<CirculationLoanDto>> GetLoanAsync(Guid id, CancellationToken ct = default)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        var loan = await _repository.GetLoanAsync(id, settings.FinePerDay, ct);
        return loan is null
            ? Result<CirculationLoanDto>.Failure("Không tìm thấy phiếu mượn.")
            : Result<CirculationLoanDto>.Success(loan);
    }

    public async Task<Result<CirculationLoanListDto>> GetMyLoansAsync(Guid readerId, int page, int pageSize, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<CirculationLoanListDto>.Failure("Không xác định được tài khoản.");
        var settings = await _repository.GetSettingsAsync(ct);
        var safePage = page < 1 ? 1 : page;
        var safeSize = pageSize < 1 ? 8 : Math.Min(pageSize, 50);
        var (items, total) = await _repository.GetLoansForReaderAsync(readerId, safePage, safeSize, settings.FinePerDay, ct);
        return Result<CirculationLoanListDto>.Success(new CirculationLoanListDto
        {
            Items = items,
            TotalCount = total,
            Page = safePage,
            PageSize = safeSize,
            TotalPages = (int)Math.Ceiling(total / (double)safeSize)
        });
    }

    public async Task<Result<IReadOnlyList<CirculationFineDto>>> GetMyFinesAsync(Guid readerId, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<IReadOnlyList<CirculationFineDto>>.Failure("Không xác định được tài khoản.");
        return Result<IReadOnlyList<CirculationFineDto>>.Success(await _repository.GetFinesForReaderAsync(readerId, ct));
    }

    public async Task<IReadOnlyList<PickupSlotDto>> GetPickupSlotsAsync(CancellationToken ct = default)
    {
        await ExpireUncollectedPickupsAsync(ct);
        var settings = await _repository.GetSettingsAsync(ct);
        var slots = CirculationRules.PickupSlots(settings, DateTimeOffset.UtcNow);
        var counts = await _repository.GetPickupRequestCountsAsync(
            slots.Select(slot => slot.PickupAt.UtcDateTime).ToList(), ct);
        return slots
            .Select(slot => slot with
            {
                RemainingCapacity = Math.Max(0, slot.Capacity - counts.GetValueOrDefault(slot.PickupAt.UtcDateTime))
            })
            .Where(slot => slot.RemainingCapacity > 0)
            .ToList();
    }

    // Mượn tại quầy: thủ thư lập phiếu luôn, chiếm bản sao ngay.
    public async Task<Result<CirculationLoanDto>> CheckoutAsync(
        CheckoutRequest request, Guid librarianId, CancellationToken ct = default)
    {
        var check = await PrepareBorrowAsync(request.ReaderKey, request.Barcode, "Nhập mã độc giả và mã vạch sách.", ct);
        if (!check.IsSuccess)
            return Result<CirculationLoanDto>.Failure(check.Error!);

        var (reader, copy, _) = check.Data!;
        return await _repository.InTransactionAsync(async () =>
        {
            await _repository.LockBorrowReaderAsync(reader.Id, ct);
            var currentReader = await _repository.FindReaderAsync(reader.Id.ToString(), ct);
            var currentSettings = await _repository.GetSettingsAsync(ct);
            if (currentReader is null)
                return Result<CirculationLoanDto>.Failure("Không tìm thấy độc giả.");
            var readerError = await CheckReaderAsync(currentReader, currentSettings, DateTime.UtcNow, ct);
            if (readerError is not null)
                return Result<CirculationLoanDto>.Failure(readerError);
            if (!await _repository.TryClaimCopyAsync(copy.Id, ct))
                return Result<CirculationLoanDto>.Failure("Bản sao vừa được người khác mượn. Thử lại với bản sao khác.");

            var now = DateTime.UtcNow;
            MarkBorrowed(copy);
            var loan = new BorrowRecord
            {
                ReaderId = reader.Id,
                BookCopyId = copy.Id,
                LibrarianId = librarianId == Guid.Empty ? null : librarianId,
                Status = BorrowStatus.Borrowed,
                BorrowDate = now,
                DueDate = now.AddDays(CirculationRules.BorrowDays(currentSettings, copy.Book?.Language)),
                Notes = "Thủ thư lập phiếu tại quầy."
            };
            await _repository.AddLoanAsync(loan, ct);
            await CompleteReservationAsync(reader.Id, copy.BookId, now, ct);
            await NotifyAsync(reader.Id, "Đã mượn sách",
                $"Bạn đã mượn “{copy.Book?.Title}”. Bắt đầu: {FormatPickup(loan.BorrowDate)}. Hạn trả: {FormatPickup(loan.DueDate)}.", "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result<CirculationLoanDto>.Success((await _repository.GetLoanAsync(loan.Id, currentSettings.FinePerDay, ct))!);
        }, ct);
    }

    // Độc giả chọn giờ nhận; bản sao được giữ nguyên tử ngay khi gửi yêu cầu.
    public async Task<Result<CirculationLoanDto>> RequestBorrowAsync(
        Guid readerId, BorrowRequest request, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<CirculationLoanDto>.Failure("Không xác định được tài khoản.");

        var barcode = request.Barcode?.Trim() ?? string.Empty;
        if (barcode.Length == 0)
            return Result<CirculationLoanDto>.Failure("Nhập mã vạch sách cần mượn.");
        var copy = await _repository.FindCopyByBarcodeAsync(barcode, ct);
        return copy is null
            ? Result<CirculationLoanDto>.Failure("Không tìm thấy bản sao theo mã vạch.")
            : await CreateBorrowRequestAsync(readerId, copy.BookId, request.PickupAt, ct);
    }

    public async Task<Result<CirculationLoanDto>> RequestBorrowBookAsync(
        Guid readerId, Guid bookId, DateTimeOffset pickupAt, CancellationToken ct = default)
    {
        if (bookId == Guid.Empty)
            return Result<CirculationLoanDto>.Failure("Không tìm thấy đầu sách.");

        return await CreateBorrowRequestAsync(readerId, bookId, pickupAt, ct);
    }

    // Trả sách: ghi ngày trả → xử lý mất/hỏng hoặc phí quá hạn → mở lượt đặt trước nếu sách còn dùng được.
    public async Task<Result<CirculationLoanDto>> ReturnAsync(
        ReturnLoanRequest request, Guid librarianId, CancellationToken ct = default)
    {
        var barcode = request.Barcode?.Trim() ?? string.Empty;
        if (barcode.Length == 0)
            return Result<CirculationLoanDto>.Failure("Nhập mã vạch sách cần trả.");

        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.InTransactionAsync(async () =>
        {
            var loan = await _repository.FindActiveLoanByBarcodeAsync(barcode, ct);
            if (loan is null)
                return Result<CirculationLoanDto>.Failure("Không có phiếu mượn đang mở cho mã vạch này.");
            if (loan.Status is not (BorrowStatus.Borrowed or BorrowStatus.Overdue))
                return Result<CirculationLoanDto>.Failure(loan.Status == BorrowStatus.Returned
                    ? "Phiếu này đã được trả. Không xử lý lần thứ hai."
                    : "Phiếu này không thể trả.");

            var now = DateTime.UtcNow;
            var condition = ParseCondition(request.Condition);
            var overdueDays = CirculationRules.CalendarOverdueDays(loan.DueDate, now);
            var isLostOrDamaged = condition is BookCondition.Damaged or BookCondition.Lost;

            loan.Status = BorrowStatus.Returned;
            loan.ReturnDate = now;
            loan.ReturnCondition = condition;
            if (librarianId != Guid.Empty)
                loan.LibrarianId = librarianId;
            if (loan.BookCopy != null)
                MarkReturned(loan.BookCopy, condition, keepUnavailable: isLostOrDamaged);

            var incidentOpened = false;
            decimal? createdFine = null;
            if (isLostOrDamaged)
                incidentOpened = await OpenIncidentIfNeededAsync(loan, condition, librarianId, ct);
            else
                createdFine = await AddOverdueFineIfNeededAsync(loan, overdueDays, settings.FinePerDay, ct);

            if (loan.BookCopy is { IsAvailable: true })
                await ReadyNextReservationAsync(loan.BookCopy.BookId, settings, ct);

            await NotifyAsync(loan.ReaderId,
                incidentOpened ? "Hồ sơ mất/hỏng sách" : "Đã trả sách",
                ReturnMessage(loan.BookCopy?.Book?.Title, overdueDays, createdFine, incidentOpened),
                createdFine is > 0 || incidentOpened ? "fine" : "return", ct);

            await _unitOfWork.SaveChangesAsync(ct);
            var saved = await _repository.GetLoanAsync(loan.Id, settings.FinePerDay, ct);
            if (saved is null)
                return Result<CirculationLoanDto>.Failure("Không đọc được phiếu sau khi trả.");
            return Result<CirculationLoanDto>.Success(saved with
            {
                CreatedFineAmount = createdFine,
                OverdueDays = overdueDays,
                IncidentOpened = incidentOpened
            });
        }, ct);
    }

    public async Task<Result<CirculationLoanDto>> ApproveAsync(Guid id, Guid librarianId, CancellationToken ct = default)
    {
        await ExpireUncollectedPickupsAsync(ct);
        await ExpireAndReadyReservationsAsync(ct);
        var loan = await _repository.GetTrackedLoanAsync(id, ct);
        if (loan is null)
            return Result<CirculationLoanDto>.Failure("Không tìm thấy yêu cầu mượn.");
        if (loan.Status != BorrowStatus.Pending)
            return Result<CirculationLoanDto>.Failure("Yêu cầu này không còn chờ xác nhận.");

        if (loan.BookCopy.Condition is BookCondition.Damaged or BookCondition.Lost)
            return Result<CirculationLoanDto>.Failure("Bản sao đang hư hỏng hoặc thất lạc, không cho mượn.");
        if (await _repository.HasActiveLoanAsync(loan.BookCopyId, loan.Id, ct))
            return Result<CirculationLoanDto>.Failure("Bản sao này hiện không sẵn sàng để mượn.");
        if (await _repository.HasOtherBorrowRequestAsync(loan.BookCopyId, loan.Id, ct))
            return Result<CirculationLoanDto>.Failure("Bản sao đã được phân cho phiếu khác.");

        return await _repository.InTransactionAsync(async () =>
        {
            await _repository.LockBorrowRequestAsync(id, ct);
            await _repository.ReloadTrackedLoanAsync(id, ct);
            if (loan.Status != BorrowStatus.Pending)
                return Result<CirculationLoanDto>.Failure("Yêu cầu này không còn chờ xác nhận.");
            await _repository.LockBorrowReaderAsync(loan.ReaderId, ct);
            await _repository.LockPickupSlotAsync(loan.PickupAt ?? DateTime.UtcNow, ct);
            var currentSettings = await _repository.GetSettingsAsync(ct);
            var currentReader = await _repository.FindReaderAsync(loan.ReaderId.ToString(), ct);
            if (currentReader is null)
                return Result<CirculationLoanDto>.Failure("Không tìm thấy độc giả của yêu cầu mượn.");
            var currentReaderError = await CheckReaderAsync(currentReader, currentSettings, DateTime.UtcNow, ct, loan.Id);
            if (currentReaderError is not null)
            {
                await NotifyAsync(loan.ReaderId, "Không thể tiếp nhận yêu cầu mượn", currentReaderError, "borrow", ct);
                await _unitOfWork.SaveChangesAsync(ct);
                return Result<CirculationLoanDto>.Failure(currentReaderError);
            }
            if (await _repository.HasOtherBorrowRequestAsync(loan.BookCopyId, loan.Id, ct)
                || await _repository.HasActiveLoanAsync(loan.BookCopyId, loan.Id, ct))
                return Result<CirculationLoanDto>.Failure("Bản sao đã được phân cho phiếu khác.");
            if (loan.BookCopy.IsAvailable)
            {
                if (!await _repository.TryClaimCopyAsync(loan.BookCopyId, ct))
                    return Result<CirculationLoanDto>.Failure("Bản sao vừa được người khác mượn hoặc không còn sẵn sàng.");
                MarkBorrowed(loan.BookCopy);
            }

            var acceptedAt = DateTime.UtcNow;
            loan.Status = BorrowStatus.Approved;
            loan.LibrarianId = librarianId == Guid.Empty ? loan.LibrarianId : librarianId;
            loan.AcceptedAt = acceptedAt;
            var librarian = librarianId == Guid.Empty
                ? null
                : await _repository.FindReaderAsync(librarianId.ToString(), ct);
            var librarianName = librarian?.FullName ?? "Thủ thư";
            await NotifyAsync(loan.ReaderId, "Yêu cầu mượn đã được tiếp nhận",
                $"{librarianName} đã tiếp nhận yêu cầu “{loan.BookCopy?.Book?.Title}” lúc {FormatPickup(acceptedAt)}. Lịch nhận: {FormatPickup(loan.PickupAt)}.",
                "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result<CirculationLoanDto>.Success((await _repository.GetLoanAsync(loan.Id, currentSettings.FinePerDay, ct))!);
        }, ct);
    }

    public async Task<Result<CirculationLoanDto>> CompleteCheckoutAsync(
        Guid id, Guid librarianId, CancellationToken ct = default)
    {
        await ExpireUncollectedPickupsAsync(ct);
        return await _repository.InTransactionAsync(async () =>
        {
            await _repository.LockBorrowRequestAsync(id, ct);
            var loan = await _repository.GetTrackedLoanAsync(id, ct);
            if (loan is null)
                return Result<CirculationLoanDto>.Failure("Không tìm thấy yêu cầu mượn.");
            await _repository.ReloadTrackedLoanAsync(id, ct);
            if (loan.Status != BorrowStatus.Approved)
                return Result<CirculationLoanDto>.Failure("Chỉ xác nhận nhận sách cho yêu cầu đã được tiếp nhận.");

            await _repository.LockBorrowReaderAsync(loan.ReaderId, ct);
            var settings = await _repository.GetSettingsAsync(ct);
            var reader = await _repository.FindReaderAsync(loan.ReaderId.ToString(), ct);
            if (reader is null)
                return Result<CirculationLoanDto>.Failure("Không tìm thấy độc giả của yêu cầu mượn.");
            var now = DateTime.UtcNow;
            var readerError = await CheckReaderAsync(reader, settings, now, ct, loan.Id);
            if (readerError is not null)
            {
                await NotifyAsync(loan.ReaderId, "Không thể hoàn tất mượn sách", readerError, "borrow", ct);
                await _unitOfWork.SaveChangesAsync(ct);
                return Result<CirculationLoanDto>.Failure(readerError);
            }

            loan.Status = BorrowStatus.Borrowed;
            loan.LibrarianId = librarianId == Guid.Empty ? loan.LibrarianId : librarianId;
            loan.BorrowDate = now;
            loan.DueDate = now.AddDays(CirculationRules.BorrowDays(settings, loan.BookCopy.Book.Language));
            await CompleteReservationAsync(loan.ReaderId, loan.BookCopy.BookId, now, ct);
            var student = string.IsNullOrWhiteSpace(reader.StudentId) ? "Chưa có mã sinh viên" : reader.StudentId;
            await NotifyAsync(loan.ReaderId, "Đã hoàn tất mượn sách",
                $"Độc giả: {reader.FullName} ({student}). Sách: “{loan.BookCopy.Book.Title}”. Bản sao: {loan.BookCopyId} · {loan.BookCopy.Barcode}. Bắt đầu mượn: {FormatPickup(loan.BorrowDate)}. Hạn trả: {FormatPickup(loan.DueDate)}.",
                "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result<CirculationLoanDto>.Success((await _repository.GetLoanAsync(loan.Id, settings.FinePerDay, ct))!);
        }, ct);
    }

    public async Task<Result<bool>> RejectAsync(Guid id, CancellationToken ct = default)
    {
        return await _repository.InTransactionAsync(async () =>
        {
            await _repository.LockBorrowRequestAsync(id, ct);
            var loan = await _repository.GetTrackedLoanAsync(id, ct);
            if (loan is null)
                return Result<bool>.Failure("Không tìm thấy yêu cầu mượn.");
            await _repository.ReloadTrackedLoanAsync(id, ct);
            if (loan.Status is not (BorrowStatus.Pending or BorrowStatus.Approved))
                return Result<bool>.Failure("Yêu cầu này không còn chờ xử lý.");
            loan.Status = BorrowStatus.Rejected;
            loan.Notes = AppendNote(loan.Notes, "Yêu cầu bị từ chối/hủy bởi thủ thư.");
            if (loan.BookCopy is not null)
                SetCopyAvailability(loan.BookCopy, loan.BookCopy.Condition, true);
            await NotifyAsync(loan.ReaderId, "Yêu cầu mượn bị từ chối",
                $"Thủ thư đã từ chối yêu cầu mượn “{loan.BookCopy?.Book?.Title}”. Bản sao đã được trả về kho.", "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result<bool>.Success(true);
        }, ct);
    }

    public async Task<Result<CirculationLoanDto>> RenewAsync(
        Guid loanId, Guid actorId, bool byLibrarian, CancellationToken ct = default)
    {
        await ExpireAndReadyReservationsAsync(ct);
        var settings = await _repository.GetSettingsAsync(ct);
        var loan = await _repository.GetTrackedLoanAsync(loanId, ct);
        if (loan is null)
            return Result<CirculationLoanDto>.Failure("Không tìm thấy phiếu mượn.");
        if (loan.Status is not (BorrowStatus.Borrowed or BorrowStatus.Overdue))
            return Result<CirculationLoanDto>.Failure("Chỉ gia hạn phiếu đang mượn.");
        if (!byLibrarian && actorId != loan.ReaderId)
            return Result<CirculationLoanDto>.Failure("Bạn chỉ được gia hạn phiếu của mình.");
        if (!byLibrarian && settings.RestrictIfUnpaid && await _repository.HasUnpaidFinesAsync(loan.ReaderId, ct))
            return Result<CirculationLoanDto>.Failure("Còn phí chưa thanh toán nên chưa được tự gia hạn.");

        var now = DateTime.UtcNow;
        var bookId = loan.BookCopy?.BookId ?? Guid.Empty;
        var error = CirculationRules.ValidateRenewal(
            settings,
            loan.RenewalCount,
            loan.DueDate,
            now,
            byLibrarian,
            CirculationRules.CalendarOverdueDays(loan.DueDate, now) > 0,
            bookId != Guid.Empty && await _repository.HasOtherReservationAsync(bookId, loan.ReaderId, ct),
            CirculationRules.IsTextbook(loan.BookCopy?.Book?.Categories?.Select(x => x.Name)));
        if (error is not null)
            return Result<CirculationLoanDto>.Failure(error);

        var days = CirculationRules.RenewalDays(settings, loan.BookCopy?.Book.Language);
        var oldDue = loan.DueDate;
        var baseDate = loan.DueDate.HasValue && loan.DueDate.Value > now ? loan.DueDate.Value : now;
        loan.DueDate = baseDate.AddDays(days);
        loan.RenewalCount += 1;
        loan.Status = BorrowStatus.Borrowed;
        loan.Notes = AppendNote(loan.Notes, byLibrarian
            ? $"Thủ thư gia hạn lần {loan.RenewalCount}: {FormatDue(oldDue)} → {FormatDue(loan.DueDate)}, +{days} ngày."
            : $"Tự gia hạn lần {loan.RenewalCount}: {FormatDue(oldDue)} → {FormatDue(loan.DueDate)}, +{days} ngày.");
        if (byLibrarian && actorId != Guid.Empty)
            loan.LibrarianId = actorId;

        await _unitOfWork.SaveChangesAsync(ct);
        return Result<CirculationLoanDto>.Success((await _repository.GetLoanAsync(loan.Id, settings.FinePerDay, ct))!);
    }

    public async Task<IReadOnlyList<CirculationLoanDto>> GetOverdueAsync(CancellationToken ct = default)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.GetOverdueAsync(settings.FinePerDay, ct);
    }

    public Task MarkOverdueAsync(CancellationToken ct = default)
        => _repository.MarkOverdueAsync(ct);

    public Task<IReadOnlyList<CirculationFineDto>> GetFinesAsync(string? search, string? status, CancellationToken ct = default)
        => _repository.GetFinesAsync(search, status, ct);

    public async Task<Result<CirculationFineDto>> RecordFineAsync(RecordFineRequest request, CancellationToken ct = default)
    {
        if (request.Amount <= 0)
            return Result<CirculationFineDto>.Failure("Số tiền phạt phải lớn hơn 0.");

        var loan = await _repository.GetTrackedLoanAsync(request.BorrowRecordId, ct);
        if (loan is null)
            return Result<CirculationFineDto>.Failure("Không tìm thấy phiếu mượn.");

        var reason = string.IsNullOrWhiteSpace(request.Reason) ? CirculationRules.OverdueReasonPrefix : request.Reason.Trim();
        var duplicate = await FineDuplicateErrorAsync(loan.Id, reason, ct);
        if (duplicate is not null)
            return Result<CirculationFineDto>.Failure(duplicate);

        var fine = NewFine(loan.Id, loan.ReaderId, decimal.Round(request.Amount, 0), reason);
        await _repository.AddFineAsync(fine, ct);
        await NotifyAsync(loan.ReaderId, "Khoản phí mới", $"Thư viện đã ghi nhận khoản phí {fine.Amount:0}đ. {fine.Reason}", "fine", ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return Result<CirculationFineDto>.Success((await _repository.GetFineDtoAsync(fine.Id, ct))!);
    }

    public async Task<Result<CirculationFineDto>> PayFineAsync(Guid id, CancellationToken ct = default)
    {
        var fine = await _repository.GetTrackedFineAsync(id, ct);
        if (fine is null)
            return Result<CirculationFineDto>.Failure("Không tìm thấy khoản phạt.");
        if (fine.Status == FineStatus.Paid)
            return Result<CirculationFineDto>.Success((await _repository.GetFineDtoAsync(id, ct))!);
        if (fine.Status != FineStatus.Pending)
            return Result<CirculationFineDto>.Failure("Khoản phạt này không còn chờ thanh toán.");

        fine.Status = FineStatus.Paid;
        fine.PaidAt = DateTime.UtcNow;
        await TryResolveIncidentAfterPaymentAsync(fine.Id, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        return Result<CirculationFineDto>.Success((await _repository.GetFineDtoAsync(id, ct))!);
    }

    public async Task<IReadOnlyList<CirculationIncidentDto>> GetIncidentsAsync(CancellationToken ct = default)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.GetIncidentsAsync(settings.FinePerDay, ct);
    }

    public async Task<Result<CirculationIncidentDto>> ConfirmIncidentAsync(
        Guid id, ConfirmIncidentRequest request, Guid librarianId, CancellationToken ct = default)
    {
        if (!CirculationRules.TryParseSeverity(request.Severity, out var severity))
            return Result<CirculationIncidentDto>.Failure("Chọn mức độ: Light, Severe hoặc Lost.");

        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.InTransactionAsync(async () =>
        {
            var incident = await _repository.GetTrackedIncidentAsync(id, ct);
            if (incident is null)
                return Result<CirculationIncidentDto>.Failure("Không tìm thấy hồ sơ mất/hỏng sách.");

            var error = CirculationRules.ValidateIncidentConfirmation(
                incident.Kind, incident.Status, severity, request.ReplacementValue, request.AssessedFee);
            if (error is not null)
                return Result<CirculationIncidentDto>.Failure(error);
            if (await _repository.HasCompensationFineAsync(incident.BorrowRecordId, ct) || incident.CompensationFineId.HasValue)
                return Result<CirculationIncidentDto>.Failure("Hồ sơ này đã có khoản bồi thường. Không tính hai lần.");
            if (!await _repository.TryClaimIncidentAsync(incident.Id, librarianId == Guid.Empty ? null : librarianId, ct))
                return Result<CirculationIncidentDto>.Failure("Hồ sơ này đã được xác nhận hoặc không còn chờ xác nhận.");

            if (severity == BookIncidentSeverity.Lost)
                incident.Kind = BookIncidentKind.Lost;

            var now = DateTime.UtcNow;
            var compensation = CirculationRules.CompensationAmount(severity, request.ReplacementValue, request.AssessedFee);
            var compensationFine = NewFine(
                incident.BorrowRecordId, incident.ReaderId, compensation,
                CirculationRules.CompensationReason(severity), $"incident:{incident.Id}");
            await _repository.AddFineAsync(compensationFine, ct);

            Fine? overdueFine = null;
            var overdueDays = CirculationRules.CalendarOverdueDays(
                incident.BorrowRecord?.DueDate, incident.BorrowRecord?.ReturnDate ?? now);
            if (request.ApplyOverdue && overdueDays > 0 && settings.FinePerDay > 0
                && !await _repository.HasOverdueFineAsync(incident.BorrowRecordId, ct))
            {
                overdueFine = NewFine(
                    incident.BorrowRecordId, incident.ReaderId,
                    CirculationRules.OverdueFineAmount(overdueDays, settings.FinePerDay),
                    $"{CirculationRules.OverdueReasonPrefix} {overdueDays} ngày",
                    $"incident:{incident.Id}");
                await _repository.AddFineAsync(overdueFine, ct);
            }

            incident.Severity = severity;
            incident.ReplacementValue = severity == BookIncidentSeverity.Light ? null : request.ReplacementValue;
            incident.AssessedFee = severity == BookIncidentSeverity.Light ? request.AssessedFee : null;
            incident.IncludeOverdue = overdueFine is not null;
            incident.CompensationFineId = compensationFine.Id;
            incident.OverdueFineId = overdueFine?.Id;
            incident.ConfirmedBy = librarianId == Guid.Empty ? null : librarianId;
            incident.ConfirmedAt = now;
            incident.Status = BookIncidentStatus.CompensationPending;
            incident.Description = AppendNote(incident.Description, string.IsNullOrWhiteSpace(request.Notes)
                ? $"Đã xác nhận {severity}. Bồi thường {compensation:0}đ. Không tự khóa tài khoản."
                : request.Notes.Trim());
            if (incident.BookCopy != null)
                SetCopyAvailability(
                    incident.BookCopy,
                    CirculationRules.CopyConditionAfterConfirm(severity),
                    CirculationRules.CopyAvailableAfterConfirm(severity));

            await NotifyAsync(incident.ReaderId, "Bồi thường tài liệu",
                $"Thư viện đã xác nhận bồi thường {compensation:0}đ"
                + (overdueFine is null ? "." : $" và phí quá hạn {overdueFine.Amount:0}đ."),
                "fine", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            var saved = await _repository.GetIncidentDtoAsync(incident.Id, settings.FinePerDay, ct);
            return saved is null
                ? Result<CirculationIncidentDto>.Failure("Không đọc được hồ sơ sau khi xác nhận.")
                : Result<CirculationIncidentDto>.Success(saved);
        }, ct);
    }

    public async Task<Result<CirculationIncidentDto>> RejectIncidentAsync(
        Guid id, RejectIncidentRequest request, Guid librarianId, CancellationToken ct = default)
    {
        var incident = await _repository.GetTrackedIncidentAsync(id, ct);
        if (incident is null)
            return Result<CirculationIncidentDto>.Failure("Không tìm thấy hồ sơ mất/hỏng sách.");
        if (incident.Status != BookIncidentStatus.PendingReview)
            return Result<CirculationIncidentDto>.Failure("Chỉ từ chối hồ sơ đang chờ xác nhận.");

        incident.Status = BookIncidentStatus.Rejected;
        incident.ConfirmedBy = librarianId == Guid.Empty ? null : librarianId;
        incident.ConfirmedAt = DateTime.UtcNow;
        incident.Description = AppendNote(incident.Description, string.IsNullOrWhiteSpace(request.Notes)
            ? "Từ chối trách nhiệm sau khi đối chiếu hồ sơ."
            : request.Notes.Trim());
        if (request.RestoreCopy && incident.BookCopy != null)
            SetCopyAvailability(incident.BookCopy, BookCondition.Good, true);

        await _unitOfWork.SaveChangesAsync(ct);
        var settings = await _repository.GetSettingsAsync(ct);
        var saved = await _repository.GetIncidentDtoAsync(id, settings.FinePerDay, ct);
        return saved is null
            ? Result<CirculationIncidentDto>.Failure("Không đọc được hồ sơ sau khi từ chối.")
            : Result<CirculationIncidentDto>.Success(saved);
    }

    public async Task<IReadOnlyList<CirculationLoanDto>> GetPendingAsync(CancellationToken ct = default)
    {
        await ExpireUncollectedPickupsAsync(ct);
        var settings = await _repository.GetSettingsAsync(ct);
        return await _repository.GetPendingAsync(settings.FinePerDay, ct);
    }

    public async Task<IReadOnlyList<CirculationLoanDto>> ExpireUncollectedPickupsAsync(CancellationToken ct = default)
    {
        const int pickupGraceMinutes = 30;
        var expiredBefore = DateTime.UtcNow.AddMinutes(-pickupGraceMinutes);
        var ids = await _repository.GetExpiredPickupRequestIdsAsync(expiredBefore, 100, ct);
        var expired = new List<CirculationLoanDto>();
        var settings = await _repository.GetSettingsAsync(ct);

        foreach (var id in ids)
        {
            var result = await _repository.InTransactionAsync(async () =>
            {
                await _repository.LockBorrowRequestAsync(id, ct);
                var loan = await _repository.GetTrackedLoanAsync(id, ct);
                if (loan is null)
                    return null;
                await _repository.ReloadTrackedLoanAsync(id, ct);
                if (loan.Status is not (BorrowStatus.Pending or BorrowStatus.Approved)
                    || loan.PickupAt is null
                    || loan.PickupAt.Value > expiredBefore)
                    return null;

                loan.Status = BorrowStatus.Rejected;
                loan.Notes = AppendNote(loan.Notes, "Tự hủy vì độc giả không đến trong vòng 30 phút sau lịch nhận.");
                if (loan.BookCopy is not null)
                    SetCopyAvailability(loan.BookCopy, loan.BookCopy.Condition, true);
                await NotifyAsync(loan.ReaderId, "Yêu cầu mượn đã hết hạn",
                    $"Yêu cầu nhận “{loan.BookCopy?.Book?.Title}” đã tự hủy vì bạn không đến trong vòng 30 phút sau lịch hẹn. Bản sao đã được trả về kho.",
                    "borrow", ct);
                await _unitOfWork.SaveChangesAsync(ct);
                return await _repository.GetLoanAsync(id, settings.FinePerDay, ct);
            }, ct);
            if (result is not null)
                expired.Add(result);
        }

        return expired;
    }

    public async Task<IReadOnlyList<CirculationReservationDto>> GetReservationsAsync(CancellationToken ct = default)
    {
        await ExpireAndReadyReservationsAsync(ct);
        return await _repository.GetReservationsAsync(ct);
    }

    public async Task<Result<IReadOnlyList<CirculationReservationDto>>> GetMyReservationsAsync(
        Guid readerId, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<IReadOnlyList<CirculationReservationDto>>.Failure("Không xác định được tài khoản.");
        await ExpireAndReadyReservationsAsync(ct);
        return Result<IReadOnlyList<CirculationReservationDto>>.Success(
            await _repository.GetReservationsForReaderAsync(readerId, ct));
    }

    public Task<Result<CirculationReservationDto>> CreateReservationAsync(
        CreateReservationRequest request, CancellationToken ct = default)
        => CreateReservationCoreAsync(request.ReaderKey, request.Barcode, ct);

    public Task<Result<CirculationReservationDto>> CreateMyReservationAsync(
        Guid readerId, string? barcode, CancellationToken ct = default)
        => CreateReservationCoreAsync(readerId.ToString(), barcode, ct);

    public async Task<Result<bool>> CancelReservationAsync(Guid id, Guid actorId, bool byLibrarian, CancellationToken ct = default)
    {
        var reservation = await _repository.GetTrackedReservationAsync(id, ct);
        if (reservation is null)
            return Result<bool>.Failure("Không tìm thấy đặt trước.");
        if (!byLibrarian && actorId != reservation.ReaderId)
            return Result<bool>.Failure("Bạn chỉ được hủy đặt trước của mình.");
        if (reservation.Status is CirculationRules.ReservationFulfilled or CirculationRules.ReservationCancelled)
            return Result<bool>.Failure("Yêu cầu đặt trước này không còn hiệu lực.");

        var bookId = reservation.BookId;
        var wasReady = reservation.Status == CirculationRules.ReservationReady;
        reservation.Status = CirculationRules.ReservationCancelled;
        await _unitOfWork.SaveChangesAsync(ct);
        if (wasReady)
        {
            await ReadyNextReservationAsync(bookId, await _repository.GetSettingsAsync(ct), ct);
            await _unitOfWork.SaveChangesAsync(ct);
        }
        return Result<bool>.Success(true);
    }

    public async Task<Result<CirculationIncidentDto>> ReportIncidentAsync(
        Guid readerId, Guid loanId, ReportIncidentRequest request, CancellationToken ct = default)
    {
        if (readerId == Guid.Empty)
            return Result<CirculationIncidentDto>.Failure("Không xác định được tài khoản.");
        var loan = await _repository.GetTrackedLoanAsync(loanId, ct);
        if (loan is null || loan.ReaderId != readerId)
            return Result<CirculationIncidentDto>.Failure("Không tìm thấy phiếu mượn của bạn.");
        if (loan.Status is not (BorrowStatus.Borrowed or BorrowStatus.Overdue))
            return Result<CirculationIncidentDto>.Failure("Chỉ báo mất/hỏng trên phiếu đang mượn.");
        if (await _repository.HasOpenIncidentAsync(loan.Id, ct) || await _repository.HasCompensationFineAsync(loan.Id, ct))
            return Result<CirculationIncidentDto>.Failure("Phiếu này đã có hồ sơ sự cố. Chờ thủ thư xác minh, chưa tính bồi thường.");

        var condition = request.Kind.Equals("Lost", StringComparison.OrdinalIgnoreCase)
            ? BookCondition.Lost
            : BookCondition.Damaged;
        var incident = CirculationRules.CreatePendingIncident(loan.Id, loan.BookCopyId, loan.ReaderId, condition, readerId);
        incident.Description = AppendNote(incident.Description,
            string.IsNullOrWhiteSpace(request.Notes)
                ? "Độc giả tự báo cáo. Chưa xác nhận mất/hỏng và chưa lập bồi thường."
                : request.Notes.Trim());
        loan.Notes = AppendNote(loan.Notes, "Độc giả báo cáo sự cố. Chờ thủ thư đối chiếu.");
        await _repository.AddIncidentAsync(incident, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var settings = await _repository.GetSettingsAsync(ct);
        var saved = await _repository.GetIncidentDtoAsync(incident.Id, settings.FinePerDay, ct);
        return saved is null
            ? Result<CirculationIncidentDto>.Failure("Không đọc được hồ sơ vừa tạo.")
            : Result<CirculationIncidentDto>.Success(saved);
    }

    public Task<IReadOnlyList<CirculationActivityDto>> GetRecentActivityAsync(CancellationToken ct = default)
        => _repository.GetRecentActivityAsync(ct);

    public Task<IReadOnlyList<CirculationCopyIssueDto>> GetCopyIssuesAsync(CancellationToken ct = default)
        => _repository.GetCopyIssuesAsync(ct);

    public static Guid ReadUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }

    private async Task<Result<(UserProfile Reader, BookCopy Copy, CirculationSettings Settings)>> PrepareBorrowAsync(
        string? readerKeyRaw, string? barcodeRaw, string emptyMessage, CancellationToken ct)
    {
        var readerKey = readerKeyRaw?.Trim() ?? string.Empty;
        var barcode = barcodeRaw?.Trim() ?? string.Empty;
        if (readerKey.Length == 0 || barcode.Length == 0)
            return Result<(UserProfile, BookCopy, CirculationSettings)>.Failure(emptyMessage);

        await ExpireAndReadyReservationsAsync(ct);
        var reader = await _repository.FindReaderAsync(readerKey, ct);
        if (reader is null)
            return Result<(UserProfile, BookCopy, CirculationSettings)>.Failure("Không tìm thấy độc giả. Hãy nhập email hoặc mã sinh viên.");

        var now = DateTime.UtcNow;
        var settings = await _repository.GetSettingsAsync(ct);
        var readerError = await CheckReaderAsync(reader, settings, now, ct);
        if (readerError is not null)
            return Result<(UserProfile, BookCopy, CirculationSettings)>.Failure(readerError);

        var copy = await _repository.FindCopyByBarcodeAsync(barcode, ct);
        var copyError = await CheckCopyAsync(copy, reader.Id, ct);
        if (copyError is not null)
            return Result<(UserProfile, BookCopy, CirculationSettings)>.Failure(copyError);

        return Result<(UserProfile, BookCopy, CirculationSettings)>.Success((reader, copy!, settings));
    }

    private async Task<Result<CirculationLoanDto>> CreateBorrowRequestAsync(
        Guid readerId, Guid bookId, DateTimeOffset pickupAt, CancellationToken ct)
    {
        if (readerId == Guid.Empty)
            return Result<CirculationLoanDto>.Failure("Không xác định được tài khoản.");

        var settings = await _repository.GetSettingsAsync(ct);
        if (!CirculationRules.IsPickupSlot(settings, pickupAt, DateTimeOffset.UtcNow))
            return Result<CirculationLoanDto>.Failure("Khung giờ nhận sách không hợp lệ hoặc đã hết hạn. Vui lòng chọn lại.");

        var reader = await _repository.FindReaderAsync(readerId.ToString(), ct);
        if (reader is null)
            return Result<CirculationLoanDto>.Failure("Không tìm thấy độc giả.");
        var readerError = await CheckReaderAsync(reader, settings, DateTime.UtcNow, ct);
        if (readerError is not null)
        {
            await NotifyAsync(reader.Id, "Yêu cầu mượn bị từ chối", readerError, "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            return Result<CirculationLoanDto>.Failure(readerError);
        }

        return await _repository.InTransactionAsync(async () =>
        {
            await _repository.LockBorrowReaderAsync(readerId, ct);
            await _repository.LockPickupSlotAsync(pickupAt.UtcDateTime, ct);

            var currentSettings = await _repository.GetSettingsAsync(ct);
            var currentReader = await _repository.FindReaderAsync(readerId.ToString(), ct);
            if (currentReader is null)
                return Result<CirculationLoanDto>.Failure("Không tìm thấy độc giả.");
            var currentTime = DateTime.UtcNow;
            var currentReaderError = await CheckReaderAsync(currentReader, currentSettings, currentTime, ct);
            if (currentReaderError is not null)
            {
                await NotifyAsync(readerId, "Yêu cầu mượn bị từ chối", currentReaderError, "borrow", ct);
                await _unitOfWork.SaveChangesAsync(ct);
                return Result<CirculationLoanDto>.Failure(currentReaderError);
            }
            if (!CirculationRules.IsPickupSlot(currentSettings, pickupAt, DateTimeOffset.UtcNow))
                return Result<CirculationLoanDto>.Failure("Khung giờ nhận sách không còn hợp lệ. Vui lòng chọn lại.");

            var requestsInSlot = await _repository.CountPickupRequestsAsync(pickupAt.UtcDateTime, ct);
            if (requestsInSlot >= currentSettings.PickupCapacityPerSlot)
                return Result<CirculationLoanDto>.Failure("Khung giờ này đã đủ số lượt nhận. Vui lòng chọn khung giờ khác.");

            var copy = await _repository.FindAvailableCopyForBookAsync(bookId, ct);
            var copyError = await CheckCopyAsync(copy, readerId, ct);
            if (copyError is not null)
                return Result<CirculationLoanDto>.Failure(copyError);
            if (!await _repository.TryClaimCopyAsync(copy!.Id, ct))
                return Result<CirculationLoanDto>.Failure("Bản sao vừa được độc giả khác đặt. Vui lòng thử lại.");

            MarkBorrowed(copy);
            var loan = new BorrowRecord
            {
                ReaderId = readerId,
                BookCopyId = copy.Id,
                PickupAt = pickupAt.UtcDateTime,
                Status = BorrowStatus.Pending,
                Notes = "Độc giả gửi yêu cầu và đã giữ bản sao. Chờ thủ thư tiếp nhận."
            };
            await _repository.AddLoanAsync(loan, ct);
            await NotifyAsync(readerId, "Đã gửi yêu cầu mượn",
                $"Yêu cầu mượn “{copy.Book.Title}” đã được gửi. Lịch nhận: {FormatPickup(loan.PickupAt)}. Bản sao {copy.Barcode} đang được giữ cho bạn.",
                "borrow", ct);
            await _unitOfWork.SaveChangesAsync(ct);
            var result = await _repository.GetLoanAsync(loan.Id, currentSettings.FinePerDay, ct);
            return result is null
                ? Result<CirculationLoanDto>.Failure("Không đọc được yêu cầu mượn vừa tạo.")
                : Result<CirculationLoanDto>.Success(result);
        }, ct);
    }

    private async Task<Result<CirculationReservationDto>> CreateReservationCoreAsync(
        string? readerKeyRaw, string? barcodeRaw, CancellationToken ct)
    {
        await ExpireAndReadyReservationsAsync(ct);
        var settings = await _repository.GetSettingsAsync(ct);
        if (!settings.AllowReservation)
            return Result<CirculationReservationDto>.Failure("Chính sách hiện không cho đặt trước.");

        var reader = await _repository.FindReaderAsync(readerKeyRaw?.Trim() ?? string.Empty, ct);
        if (reader is null)
            return Result<CirculationReservationDto>.Failure("Không tìm thấy độc giả.");
        var accountError = CirculationRules.ValidateBorrower(reader.Status, reader.IsActive, reader.MembershipExpiresAt, DateTime.UtcNow);
        if (accountError is not null)
            return Result<CirculationReservationDto>.Failure(accountError);

        var copy = await _repository.FindCopyByBarcodeAsync(barcodeRaw?.Trim() ?? string.Empty, ct);
        if (copy is null)
            return Result<CirculationReservationDto>.Failure("Không tìm thấy sách theo mã vạch.");
        if (await _repository.HasOpenReservationAsync(reader.Id, copy.BookId, ct))
            return Result<CirculationReservationDto>.Failure("Độc giả đã có yêu cầu đặt trước cho sách này.");

        var reservation = new Reservation
        {
            ReaderId = reader.Id,
            BookId = copy.BookId,
            Status = CirculationRules.ReservationPending,
            ReservedAt = DateTime.UtcNow,
            Notes = "Đặt trước theo sách, không giữ một bản sao cụ thể cho đến khi đến lượt nhận."
        };
        await _repository.AddReservationAsync(reservation, ct);
        await NotifyAsync(reader.Id, "Đã đặt trước",
            $"Đã ghi nhận đặt trước “{copy.Book.Title}”. Bạn sẽ được báo khi đến lượt nhận.", "reservation", ct);
        await _unitOfWork.SaveChangesAsync(ct);
        var saved = (await _repository.GetReservationsAsync(ct)).FirstOrDefault(x => x.Id == reservation.Id);
        return saved is null
            ? Result<CirculationReservationDto>.Failure("Không đọc được đặt trước vừa tạo.")
            : Result<CirculationReservationDto>.Success(saved);
    }

    private async Task<string?> CheckReaderAsync(
        UserProfile reader, CirculationSettings settings, DateTime now, CancellationToken ct, Guid? exceptLoanId = null)
    {
        var accountError = CirculationRules.ValidateBorrower(reader.Status, reader.IsActive, reader.MembershipExpiresAt, now);
        if (accountError is not null)
            return accountError;
        if (settings.RestrictIfUnpaid && await _repository.HasUnpaidFinesAsync(reader.Id, ct))
            return "Độc giả còn phí chưa thanh toán nên bị hạn chế mượn. Vẫn có thể xem khoản phí.";
        if (settings.BlockBorrowIfOverdue && await _repository.HasOverdueLoansAsync(reader.Id, now, ct))
            return "Độc giả còn sách quá hạn nên chưa thể mượn thêm.";
        var maxBooks = CirculationRules.MaxBooksFor(settings, reader.ReaderType);
        if (maxBooks is > 0 && await _repository.CountActiveLoansAsync(reader.Id, exceptLoanId, ct) >= maxBooks.Value)
            return $"Đã đạt hạn mức mượn ({maxBooks.Value} tài liệu).";
        return null;
    }

    private async Task<string?> CheckCopyAsync(
        BookCopy? copy, Guid readerId, CancellationToken ct, Guid? exceptLoanId = null)
    {
        if (copy is null)
            return "Không tìm thấy bản sao sách.";
        if (copy.Condition is BookCondition.Damaged or BookCondition.Lost)
            return "Bản sao đang hư hỏng hoặc thất lạc, không cho mượn.";
        if (!copy.IsAvailable || await _repository.HasActiveLoanAsync(copy.Id, exceptLoanId, ct))
            return "Bản sao này hiện không sẵn sàng để mượn.";
        if (await _repository.HasOtherBorrowRequestAsync(copy.Id, exceptLoanId ?? Guid.Empty, ct))
            return "Bản sao đang được giữ cho một yêu cầu mượn khác.";
        var readyCount = await _repository.CountReadyReservationsAsync(copy.BookId, readerId, ct);
        if (readyCount > 0 && await _repository.CountAvailableCopiesAsync(copy.BookId, ct) <= readyCount)
            return "Bản sao đang được giữ cho độc giả đặt trước.";
        return null;
    }

    private async Task<bool> OpenIncidentIfNeededAsync(
        BorrowRecord loan, BookCondition condition, Guid librarianId, CancellationToken ct)
    {
        loan.Notes = AppendNote(loan.Notes, condition == BookCondition.Lost
            ? CirculationRules.LostNote
            : CirculationRules.DamagedNote);
        if (await _repository.HasOpenIncidentAsync(loan.Id, ct) || await _repository.HasCompensationFineAsync(loan.Id, ct))
            return false;
        await _repository.AddIncidentAsync(
            CirculationRules.CreatePendingIncident(loan.Id, loan.BookCopyId, loan.ReaderId, condition, librarianId), ct);
        return true;
    }

    private async Task<decimal?> AddOverdueFineIfNeededAsync(
        BorrowRecord loan, int overdueDays, int feePerDay, CancellationToken ct)
    {
        if (overdueDays <= 0 || feePerDay <= 0)
            return null;
        if (await _repository.HasOverdueFineAsync(loan.Id, ct))
            return null;
        var amount = CirculationRules.OverdueFineAmount(overdueDays, feePerDay);
        await _repository.AddFineAsync(
            NewFine(loan.Id, loan.ReaderId, amount, $"{CirculationRules.OverdueReasonPrefix} {overdueDays} ngày"), ct);
        return amount;
    }

    private async Task<string?> FineDuplicateErrorAsync(Guid loanId, string reason, CancellationToken ct)
    {
        if (CirculationRules.IsCompensationReason(reason))
        {
            if (await _repository.HasCompensationFineAsync(loanId, ct))
                return "Phiếu này đã có khoản bồi thường. Không tính hai lần.";
            if (await _repository.HasOpenIncidentAsync(loanId, ct))
                return "Hồ sơ mất/hỏng đang chờ xác nhận. Thủ thư xác minh rồi mới lập bồi thường.";
            return null;
        }
        if (CirculationRules.IsOverdueReason(reason) && await _repository.HasOverdueFineAsync(loanId, ct))
            return "Phiếu này đã có phí quá hạn.";
        if (!CirculationRules.IsOverdueReason(reason) && await _repository.HasOpenFineAsync(loanId, ct))
            return "Phiếu này đã có khoản phạt chưa thanh toán.";
        return null;
    }

    private async Task ExpireAndReadyReservationsAsync(CancellationToken ct)
    {
        var settings = await _repository.GetSettingsAsync(ct);
        var expiredBooks = await _repository.ExpireReadyReservationsAsync(ct);
        foreach (var bookId in expiredBooks)
            await ReadyNextReservationAsync(bookId, settings, ct);
        if (expiredBooks.Count > 0)
            await _unitOfWork.SaveChangesAsync(ct);
    }

    private async Task ReadyNextReservationAsync(Guid bookId, CirculationSettings settings, CancellationToken ct)
    {
        if (bookId == Guid.Empty) return;
        var available = await _repository.CountAvailableCopiesAsync(bookId, ct);
        if (available <= 0) return;
        var ready = await _repository.CountReadyReservationsAsync(bookId, Guid.Empty, ct);
        if (available <= ready) return;
        var next = await _repository.ReadyNextReservationAsync(bookId, CirculationRules.PickupHours(settings), ct);
        if (next is null) return;
        await NotifyAsync(next.ReaderId, "Sách sẵn sàng nhận",
            $"“{next.Book.Title}” đã sẵn sàng. Hãy nhận trước {next.ExpiresAt:dd/MM/yyyy HH:mm}.", "reservation", ct);
    }

    private async Task CompleteReservationAsync(Guid readerId, Guid bookId, DateTime now, CancellationToken ct)
    {
        if (bookId == Guid.Empty) return;
        var reservation = await _repository.FindOpenReservationAsync(readerId, bookId, ct);
        if (reservation is null) return;
        reservation.Status = CirculationRules.ReservationFulfilled;
        reservation.FulfilledAt = now;
    }

    private async Task TryResolveIncidentAfterPaymentAsync(Guid fineId, CancellationToken ct)
    {
        var incident = await _repository.FindIncidentByFineIdAsync(fineId, ct);
        if (incident is null || incident.Status != BookIncidentStatus.CompensationPending)
            return;
        var compensationPaid = incident.CompensationFine is null
            || incident.CompensationFine.Status is FineStatus.Paid or FineStatus.Waived;
        var overduePaid = incident.OverdueFine is null
            || incident.OverdueFine.Status is FineStatus.Paid or FineStatus.Waived;
        if (!compensationPaid || !overduePaid)
            return;
        incident.Status = BookIncidentStatus.Resolved;
        incident.Description = AppendNote(incident.Description, "Đã thanh toán bồi thường. Không tự mở khóa tài khoản nếu còn hạn chế khác.");
    }

    private Task NotifyAsync(Guid userId, string title, string message, string type, CancellationToken ct)
        => _repository.AddNotificationAsync(new Notification
        {
            UserId = userId,
            Title = title,
            Message = message,
            Type = type
        }, ct);

    private static Fine NewFine(Guid loanId, Guid readerId, decimal amount, string reason, string? notes = null)
        => new()
        {
            BorrowRecordId = loanId,
            ReaderId = readerId,
            Amount = amount,
            Reason = reason,
            Status = FineStatus.Pending,
            Notes = notes
        };

    private static void MarkBorrowed(BookCopy copy)
    {
        copy.IsAvailable = false;
        if (copy.Book != null && copy.Book.AvailableCopies > 0)
            copy.Book.AvailableCopies -= 1;
    }

    private static void MarkReturned(BookCopy copy, BookCondition condition, bool keepUnavailable)
    {
        copy.Condition = condition;
        copy.IsAvailable = !keepUnavailable;
        if (!keepUnavailable && copy.Book != null)
            copy.Book.AvailableCopies += 1;
    }

    private static void SetCopyAvailability(BookCopy copy, BookCondition condition, bool available)
    {
        var wasAvailable = copy.IsAvailable;
        copy.Condition = condition;
        copy.IsAvailable = available;
        if (copy.Book is null) return;
        if (!wasAvailable && available)
            copy.Book.AvailableCopies += 1;
        if (wasAvailable && !available && copy.Book.AvailableCopies > 0)
            copy.Book.AvailableCopies -= 1;
    }

    private static string ReturnMessage(string? title, int overdueDays, decimal? fine, bool incidentOpened)
    {
        var book = string.IsNullOrWhiteSpace(title) ? "sách" : $"“{title}”";
        if (incidentOpened)
            return $"Đã lập hồ sơ sự cố cho {book}. Thủ thư sẽ xác minh trước khi tính bồi thường.";
        if (fine is > 0)
            return $"Đã trả {book} quá hạn {overdueDays} ngày. Phí quá hạn {fine:0}đ.";
        if (overdueDays > 0)
            return $"Đã trả {book} quá hạn {overdueDays} ngày. Chưa lập phí vì chưa cấu hình mức phạt hoặc đã có khoản phí.";
        return $"Đã trả {book} đúng hạn.";
    }

    private static BookCondition ParseCondition(string? value)
        => Enum.TryParse<BookCondition>(value, true, out var parsed) ? parsed : BookCondition.Good;

    private static string FormatDue(DateTime? value)
        => value.HasValue ? CirculationRules.LibraryDate(value.Value).ToString("dd/MM/yyyy") : "—";

    private static string FormatPickup(DateTime? value)
        => value.HasValue
            ? new DateTimeOffset(DateTime.SpecifyKind(value.Value, DateTimeKind.Utc))
                .ToOffset(TimeSpan.FromHours(7)).ToString("dd/MM/yyyy HH:mm")
            : "—";

    private static string AppendNote(string? current, string extra)
        => string.IsNullOrWhiteSpace(current) ? extra : $"{current.Trim()} | {extra}";
}
