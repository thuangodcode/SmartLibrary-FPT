using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using PayOS.Exceptions;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/circulation")]
[Authorize(Policy = "LibrarianOnly")]
public class CirculationController : ControllerBase
{
    private readonly CirculationService _circulation;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<CirculationController> _logger;
    private readonly AppDbContext _db;

    public CirculationController(
        CirculationService circulation,
        IHubContext<NotificationHub> hub,
        ILogger<CirculationController> logger,
        AppDbContext db)
    {
        _circulation = circulation;
        _hub = hub;
        _logger = logger;
        _db = db;
    }

    [HttpGet("stats")]
    public async Task<IActionResult> Stats(CancellationToken ct)
        => Ok(ApiResponse<CirculationStatsDto>.Ok(await _circulation.GetStatsAsync(ct)));

    [HttpGet("loans")]
    public async Task<IActionResult> Loans(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] DateOnly? borrowedFrom,
        [FromQuery] DateOnly? borrowedTo,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 8,
        CancellationToken ct = default)
        => Ok(ApiResponse<CirculationLoanListDto>.Ok(
            await _circulation.GetLoansAsync(search, status, borrowedFrom, borrowedTo, page, pageSize, ct)));

    [HttpGet("loans/due-soon")]
    public async Task<IActionResult> DueSoonLoans(
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var start = from ?? today;
        var end = to ?? today.AddDays(4);
        if (end < start)
            return BadRequest(ApiResponse<object>.Fail("Ngày kết thúc phải sau hoặc bằng ngày bắt đầu."));

        var firstPage = await _circulation.GetLoansAsync(null, "Borrowed", null, null, 1, 50, ct);
        var items = firstPage.Items.ToList();
        for (var page = 2; page <= firstPage.TotalPages; page++)
        {
            var next = await _circulation.GetLoansAsync(null, "Borrowed", null, null, page, 50, ct);
            items.AddRange(next.Items);
        }
        return Ok(ApiResponse<IReadOnlyList<CirculationLoanDto>>.Ok(items
            .Where(item => item.DueDate.HasValue
                           && DateOnly.FromDateTime(item.DueDate.Value) >= start
                           && DateOnly.FromDateTime(item.DueDate.Value) <= end)
            .OrderBy(item => item.DueDate)
            .ToList()));
    }

    [HttpGet("due-reminder-settings")]
    public async Task<IActionResult> GetDueReminderSettings(CancellationToken ct)
    {
        var settings = await _db.CirculationReminderSettings.AsNoTracking()
            .OrderBy(item => item.UpdatedAt)
            .FirstOrDefaultAsync(ct);
        return Ok(ApiResponse<CirculationDueReminderSettingsDto>.Ok(new(
            settings?.IsEnabled ?? false,
            settings?.ReminderDays ?? 4,
            settings?.UpdatedAt ?? DateTime.UtcNow)));
    }

    [HttpPut("due-reminder-settings")]
    public async Task<IActionResult> UpdateDueReminderSettings(
        [FromBody] UpdateCirculationDueReminderSettingsRequest request,
        CancellationToken ct)
    {
        if (request.ReminderDays is not (2 or 4 or 7 or 14))
            return BadRequest(ApiResponse<object>.Fail("Chỉ hỗ trợ nhắc trước 4 hoặc 2 ngày."));

        var settings = await _db.CirculationReminderSettings
            .OrderBy(item => item.UpdatedAt)
            .FirstOrDefaultAsync(ct);
        if (settings is null)
        {
            settings = new SmartLibrary.Domain.Entities.CirculationReminderSetting();
            _db.CirculationReminderSettings.Add(settings);
        }
        settings.IsEnabled = request.IsEnabled;
        settings.ReminderDays = request.ReminderDays;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedBy = CirculationService.ReadUserId(User);
        await _db.SaveChangesAsync(ct);

        return Ok(ApiResponse<CirculationDueReminderSettingsDto>.Ok(new(
            settings.IsEnabled, settings.ReminderDays, settings.UpdatedAt),
            new { message = "Đã lưu cấu hình nhắc hạn trả sách." }));
    }

    [HttpGet("loans/{id:guid}")]
    public async Task<IActionResult> Loan(Guid id, CancellationToken ct)
    {
        var result = await _circulation.GetLoanAsync(id, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!))
            : NotFound(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout([FromBody] CheckoutRequest request, CancellationToken ct)
    {
        var result = await _circulation.CheckoutAsync(request, CirculationService.ReadUserId(User), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã lập phiếu mượn." }));
    }

    [HttpPost("return")]
    public async Task<IActionResult> Return([FromBody] ReturnLoanRequest request, CancellationToken ct)
    {
        var result = await _circulation.ReturnAsync(request, CirculationService.ReadUserId(User), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        var loan = result.Data!;
        if (loan.ReadyReservationReaderId is { } readerId)
        {
            await _hub.Clients.Group(NotificationHub.UserGroup(readerId))
                .SendAsync("ReservationReady", new
                {
                    bookId = loan.ReadyReservationBookId,
                    bookTitle = loan.ReadyReservationBookTitle,
                    message = $"“{loan.ReadyReservationBookTitle}” đã sẵn sàng. Hãy gửi yêu cầu mượn trước khi hết thời gian giữ."
                }, ct);
        }
        var message = loan.IncidentOpened
            ? "Đã lập hồ sơ chờ thủ thư xác minh. Chưa tính bồi thường và không tự khóa tài khoản."
            : loan.CreatedFineAmount is > 0
                ? $"Đã trả sách. Đã lập phí quá hạn {loan.CreatedFineAmount:0}đ ({loan.OverdueDays} ngày)."
                : loan.OverdueFineAlreadyExists
                    ? $"Đã trả sách quá hạn {loan.OverdueDays} ngày. Phí quá hạn đã được ghi nhận trước đó; không lập trùng. Xem khoản phí trên phiếu."
                : loan.OverdueDays > 0
                    ? $"Đã trả sách quá hạn {loan.OverdueDays} ngày. Chưa lập phí vì chưa cấu hình mức phạt quá hạn."
                    : "Đã ghi nhận trả sách.";
        return Ok(ApiResponse<CirculationLoanDto>.Ok(loan, new { message }));
    }

    [HttpPost("loans/{id:guid}/renew")]
    public async Task<IActionResult> Renew(Guid id, CancellationToken ct)
    {
        var result = await _circulation.RenewAsync(id, CirculationService.ReadUserId(User), byLibrarian: true, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã gia hạn phiếu mượn." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("loans/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        var result = await _circulation.ApproveAsync(id, CirculationService.ReadUserId(User), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã tiếp nhận yêu cầu. Độc giả sẽ hoàn tất mượn khi đến quầy." }));
    }

    [HttpPost("loans/{id:guid}/checkout")]
    public async Task<IActionResult> CompleteCheckout(Guid id, [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] CompleteCheckoutRequest? request, CancellationToken ct)
    {
        var result = await _circulation.CompleteCheckoutAsync(id, CirculationService.ReadUserId(User), ct, request?.Barcode);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã hoàn tất mượn tại quầy." }));
    }

    [HttpPost("loans/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody(EmptyBodyBehavior = Microsoft.AspNetCore.Mvc.ModelBinding.EmptyBodyBehavior.Allow)] RejectLoanRequest? request, CancellationToken ct)
    {
        var existing = await _circulation.GetLoanAsync(id, ct);
        var result = await _circulation.RejectAsync(id, ct, request?.Notes);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        if (existing.IsSuccess)
        {
            await _hub.Clients.Group(NotificationHub.UserGroup(existing.Data!.ReaderId))
                .SendAsync("BorrowStatusUpdated", new { id, status = "Rejected" }, ct);
        }
        await _hub.Clients.Group(NotificationHub.LibrarianGroup)
            .SendAsync("BorrowRequestUpdated", new { id, status = "Rejected" }, ct);
        return Ok(ApiResponse<bool>.Ok(true, new { message = "Đã từ chối yêu cầu và giải phóng bản sao." }));
    }

    [HttpGet("overdue")]
    public async Task<IActionResult> Overdue(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationLoanDto>>.Ok(await _circulation.GetOverdueAsync(ct)));

    [HttpGet("fines")]
    public async Task<IActionResult> Fines([FromQuery] string? search, [FromQuery] string? status, CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationFineDto>>.Ok(await _circulation.GetFinesAsync(search, status, ct)));

    [HttpPost("fines")]
    public async Task<IActionResult> RecordFine([FromBody] RecordFineRequest request, CancellationToken ct)
    {
        var result = await _circulation.RecordFineAsync(request, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationFineDto>.Ok(result.Data!, new { message = "Đã ghi nhận phạt." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("fines/{id:guid}/pay")]
    [HttpPost("fines/{id:guid}/pay/cash")]
    public async Task<IActionResult> PayFine(Guid id, CancellationToken ct)
    {
        try
        {
            var result = await _circulation.PayFineAsync(id, CirculationService.ReadUserId(User), ct);
            return result.IsSuccess
                ? Ok(ApiResponse<CirculationFineDto>.Ok(result.Data!, new { message = "Đã ghi nhận thanh toán tiền mặt." }))
                : BadRequest(ApiResponse<object>.Fail(result.Error!));
        }
        catch (PayOSException ex)
        {
            _logger.LogError(ex, "Could not cancel PayOS link before cash settlement for fine {FineId}.", id);
            return StatusCode(StatusCodes.Status502BadGateway,
                ApiResponse<object>.Fail("PayOS chưa xác nhận hủy liên kết; khoản phí chưa được ghi nhận tiền mặt."));
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Cash settlement blocked because PayOS link cancellation was not confirmed for fine {FineId}.", id);
            return Conflict(ApiResponse<object>.Fail(ex.Message));
        }
    }

    [HttpPost("fines/{id:guid}/pay/payos")]
    public async Task<IActionResult> CreatePayOSFineCheckout(Guid id, CancellationToken ct)
    {
        try
        {
            var result = await _circulation.CreatePayOSCheckoutAsync(
                id, CirculationService.ReadUserId(User), null, ct);
            return result.IsSuccess
                ? Ok(ApiResponse<FinePaymentCheckoutDto>.Ok(result.Data!))
                : BadRequest(ApiResponse<object>.Fail(result.Error!));
        }
        catch (PayOSException ex)
        {
            _logger.LogError(ex, "PayOS could not create a checkout for fine {FineId}.", id);
            return StatusCode(StatusCodes.Status502BadGateway,
                ApiResponse<object>.Fail("PayOS hiện không thể tạo liên kết thanh toán. Vui lòng thử lại."));
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Invalid PayOS configuration while creating checkout for fine {FineId}.", id);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ApiResponse<object>.Fail(ex.Message));
        }
    }

    [HttpGet("pending")]
    public async Task<IActionResult> Pending(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationLoanDto>>.Ok(await _circulation.GetPendingAsync(ct)));

    [HttpGet("reservations")]
    public async Task<IActionResult> Reservations(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationReservationDto>>.Ok(await _circulation.GetReservationsAsync(ct)));

    /// <summary>Search readers for the librarian reservation form.</summary>
    [HttpGet("reservation-reader-options")]
    public async Task<IActionResult> ReservationReaderOptions(
        [FromQuery] string? search, CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationReaderOptionDto>>.Ok(
            await _circulation.SearchReaderOptionsAsync(search, ct)));

    /// <summary>Search library titles for the librarian reservation form.</summary>
    [HttpGet("reservation-book-options")]
    public async Task<IActionResult> ReservationBookOptions(
        [FromQuery] string? search, CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationBookOptionDto>>.Ok(
            await _circulation.SearchBookOptionsAsync(search, ct)));

    /// <summary>Get active borrowed/overdue books for a specific reader for returning books.</summary>
    [HttpGet("reader-active-loans")]
    public async Task<IActionResult> ReaderActiveLoans(
        [FromQuery] string readerKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(readerKey))
            return BadRequest(ApiResponse<object>.Fail("Vui lòng cung cấp thông tin độc giả."));
        var loans = await _circulation.GetActiveLoansForReaderKeyAsync(readerKey, ct);
        return Ok(ApiResponse<IReadOnlyList<CirculationLoanDto>>.Ok(loans));
    }

    [HttpPost("reservations")]
    public async Task<IActionResult> CreateReservation([FromBody] CreateReservationRequest request, CancellationToken ct)
    {
        var result = await _circulation.CreateReservationAsync(request, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationReservationDto>.Ok(result.Data!, new { message = "Đã tạo yêu cầu đặt trước." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    /// <summary>Create a reservation for a selected reader and book that has no borrowable copies.</summary>
    [HttpPost("reservations/by-book")]
    public async Task<IActionResult> CreateReservationByBook(
        [FromBody] CreateLibrarianReservationRequest request, CancellationToken ct)
    {
        var result = await _circulation.CreateLibrarianReservationAsync(request, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationReservationDto>.Ok(result.Data!, new { message = "Đã tạo yêu cầu đặt trước." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("reservations/{id:guid}/cancel")]
    public async Task<IActionResult> CancelReservation(Guid id, CancellationToken ct)
    {
        var result = await _circulation.CancelReservationAsync(id, CirculationService.ReadUserId(User), byLibrarian: true, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true, new { message = "Đã hủy đặt trước." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpGet("activity")]
    public async Task<IActionResult> Activity(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationActivityDto>>.Ok(await _circulation.GetRecentActivityAsync(ct)));

    [HttpGet("copy-issues")]
    public async Task<IActionResult> CopyIssues(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationCopyIssueDto>>.Ok(await _circulation.GetCopyIssuesAsync(ct)));

    [HttpGet("incidents")]
    public async Task<IActionResult> Incidents(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<CirculationIncidentDto>>.Ok(await _circulation.GetIncidentsAsync(ct)));

    [HttpPost("incidents/{id:guid}/confirm")]
    public async Task<IActionResult> ConfirmIncident(Guid id, [FromBody] ConfirmIncidentRequest request, CancellationToken ct)
    {
        var result = await _circulation.ConfirmIncidentAsync(id, request, CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationIncidentDto>.Ok(result.Data!, new
            {
                message = "Đã xác nhận trách nhiệm và lập bồi thường. Không tự khóa tài khoản."
            }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("incidents/{id:guid}/reject")]
    public async Task<IActionResult> RejectIncident(Guid id, [FromBody] RejectIncidentRequest request, CancellationToken ct)
    {
        var result = await _circulation.RejectIncidentAsync(id, request ?? new RejectIncidentRequest(), CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationIncidentDto>.Ok(result.Data!, new { message = "Đã từ chối hồ sơ sau khi đối chiếu." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpGet("loans/{id:guid}/detail")]
    public async Task<IActionResult> LoanDetail(Guid id, CancellationToken ct)
    {
        var data = await _circulation.GetLoanDetailAsync(id, ct);
        return data is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy phiếu.")) : Ok(ApiResponse<StaffLoanDetailDto>.Ok(data));
    }

    [HttpGet("incidents/{id:guid}")]
    public async Task<IActionResult> Incident(Guid id, CancellationToken ct)
    {
        var data = await _circulation.GetIncidentAsync(id, ct);
        return data is null ? NotFound(ApiResponse<object>.Fail("Không tìm thấy hồ sơ.")) : Ok(ApiResponse<CirculationIncidentDto>.Ok(data));
    }

    [HttpPost("incidents/{id:guid}/restore-copy")]
    public async Task<IActionResult> RestoreCopy(Guid id, [FromBody] RestoreIncidentCopyRequest request, CancellationToken ct)
    {
        var result = await _circulation.RestoreIncidentCopyAsync(id, request, CirculationService.ReadUserId(User), ct);
        return result.IsSuccess ? Ok(ApiResponse<CirculationIncidentDto>.Ok(result.Data!, new { message = "Đã kiểm tra, bản sao về kho chờ xếp. Phí được giữ nguyên." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    private async Task BroadcastBorrowUpdateAsync(CirculationLoanDto loan, CancellationToken ct)
    {
        await _hub.Clients.Group(NotificationHub.UserGroup(loan.ReaderId))
            .SendAsync("BorrowStatusUpdated", loan, ct);
        await _hub.Clients.Group(NotificationHub.LibrarianGroup)
            .SendAsync("BorrowRequestUpdated", loan, ct);
    }
}
