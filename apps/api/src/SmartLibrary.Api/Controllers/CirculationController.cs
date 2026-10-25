using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Api.Hubs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/circulation")]
[Authorize(Policy = "LibrarianOnly")]
public class CirculationController : ControllerBase
{
    private readonly CirculationService _circulation;
    private readonly IHubContext<SupportChatHub> _hub;

    public CirculationController(CirculationService circulation, IHubContext<SupportChatHub> hub)
    {
        _circulation = circulation;
        _hub = hub;
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
            await _hub.Clients.Group(SupportChatHub.ReaderGroup(readerId))
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
                : loan.OverdueDays > 0
                    ? $"Đã trả sách quá hạn {loan.OverdueDays} ngày. Chưa lập phí vì chưa cấu hình mức phạt hoặc đã có khoản phí."
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
    public async Task<IActionResult> CompleteCheckout(Guid id, CancellationToken ct)
    {
        var result = await _circulation.CompleteCheckoutAsync(id, CirculationService.ReadUserId(User), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã hoàn tất mượn tại quầy." }));
    }

    [HttpPost("loans/{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, CancellationToken ct)
    {
        var existing = await _circulation.GetLoanAsync(id, ct);
        var result = await _circulation.RejectAsync(id, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        if (existing.IsSuccess)
        {
            await _hub.Clients.Group(SupportChatHub.ReaderGroup(existing.Data!.ReaderId))
                .SendAsync("BorrowStatusUpdated", new { id, status = "Rejected" }, ct);
        }
        await _hub.Clients.Group(SupportChatHub.LibrarianGroup)
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
    public async Task<IActionResult> PayFine(Guid id, CancellationToken ct)
    {
        var result = await _circulation.PayFineAsync(id, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationFineDto>.Ok(result.Data!, new { message = "Đã ghi nhận thanh toán." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
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

    private async Task BroadcastBorrowUpdateAsync(CirculationLoanDto loan, CancellationToken ct)
    {
        await _hub.Clients.Group(SupportChatHub.ReaderGroup(loan.ReaderId))
            .SendAsync("BorrowStatusUpdated", loan, ct);
        await _hub.Clients.Group(SupportChatHub.LibrarianGroup)
            .SendAsync("BorrowRequestUpdated", loan, ct);
    }
}
