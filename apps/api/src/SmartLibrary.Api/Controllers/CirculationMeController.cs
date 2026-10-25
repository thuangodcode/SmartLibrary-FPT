using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using PayOS.Exceptions;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Api.Hubs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/me/circulation")]
public class CirculationMeController : ControllerBase
{
    private readonly CirculationService _circulation;
    private readonly IHubContext<NotificationHub> _hub;
    private readonly ILogger<CirculationMeController> _logger;

    public CirculationMeController(
        CirculationService circulation,
        IHubContext<NotificationHub> hub,
        ILogger<CirculationMeController> logger)
    {
        _circulation = circulation;
        _hub = hub;
        _logger = logger;
    }

    [HttpGet("loans")]
    public async Task<IActionResult> MyLoans([FromQuery] int page = 1, [FromQuery] int pageSize = 8, CancellationToken ct = default)
    {
        var result = await _circulation.GetMyLoansAsync(CirculationService.ReadUserId(User), page, pageSize, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationLoanListDto>.Ok(result.Data!))
            : Unauthorized(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpGet("fines")]
    public async Task<IActionResult> MyFines(CancellationToken ct)
    {
        var result = await _circulation.GetMyFinesAsync(CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<IReadOnlyList<CirculationFineDto>>.Ok(result.Data!))
            : Unauthorized(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("fines/{id:guid}/pay/payos")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> CreatePayOSFineCheckout(Guid id, CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        try
        {
            var result = await _circulation.CreatePayOSCheckoutAsync(id, readerId, readerId, ct);
            return result.IsSuccess
                ? Ok(ApiResponse<FinePaymentCheckoutDto>.Ok(result.Data!))
                : BadRequest(ApiResponse<object>.Fail(result.Error!));
        }
        catch (PayOSException ex)
        {
            _logger.LogError(ex, "PayOS could not create a checkout for reader fine {FineId}.", id);
            return StatusCode(StatusCodes.Status502BadGateway,
                ApiResponse<object>.Fail("PayOS hiện không thể tạo liên kết thanh toán. Vui lòng thử lại."));
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogError(ex, "Invalid PayOS configuration while creating reader checkout for fine {FineId}.", id);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, ApiResponse<object>.Fail(ex.Message));
        }
    }

    [HttpPost("loans")]
    public async Task<IActionResult> RequestBorrow([FromBody] BorrowRequest request, CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        var result = await _circulation.RequestBorrowAsync(readerId, request, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã gửi yêu cầu mượn và giữ bản sao. Chờ thủ thư tiếp nhận." }));
    }

    [HttpGet("pickup-slots")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> PickupSlots(CancellationToken ct)
        => Ok(ApiResponse<IReadOnlyList<PickupSlotDto>>.Ok(await _circulation.GetPickupSlotsAsync(ct)));

    /// <summary>Request to borrow a currently available copy by book ID.</summary>
    [HttpPost("book-requests")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> RequestBorrowBook([FromBody] RequestBookBorrowRequest request, CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        var result = await _circulation.RequestBorrowBookAsync(readerId, request.BookId, request.PickupAt, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));
        await BroadcastBorrowUpdateAsync(result.Data!, ct);
        return Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã gửi yêu cầu mượn và giữ bản sao. Chờ thủ thư tiếp nhận." }));
    }

    /// <summary>Renews the authenticated reader's eligible loan according to library policy.</summary>
    [HttpPost("loans/{id:guid}/renew")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> Renew(Guid id, CancellationToken ct)
    {
        var result = await _circulation.RenewAsync(id, CirculationService.ReadUserId(User), byLibrarian: false, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã gia hạn phiếu mượn." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("loans/{id:guid}/incidents")]
    public async Task<IActionResult> ReportIncident(Guid id, [FromBody] ReportIncidentRequest request, CancellationToken ct)
    {
        var result = await _circulation.ReportIncidentAsync(CirculationService.ReadUserId(User), id, request ?? new ReportIncidentRequest(), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationIncidentDto>.Ok(result.Data!, new
            {
                message = "Đã ghi nhận báo cáo. Thủ thư sẽ xác minh trước khi tính bồi thường."
            }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpGet("reservations")]
    public async Task<IActionResult> MyReservations(CancellationToken ct)
    {
        var result = await _circulation.GetMyReservationsAsync(CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<IReadOnlyList<CirculationReservationDto>>.Ok(result.Data!))
            : Unauthorized(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("reservations")]
    public async Task<IActionResult> CreateReservation([FromBody] BorrowRequest request, CancellationToken ct)
    {
        var result = await _circulation.CreateMyReservationAsync(CirculationService.ReadUserId(User), request.Barcode, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationReservationDto>.Ok(result.Data!, new { message = "Đã tạo yêu cầu đặt trước." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    /// <summary>Join the reservation queue for a book that has no available copies.</summary>
    [HttpPost("book-reservations")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> CreateBookReservation(
        [FromBody] RequestBookReservationRequest request, CancellationToken ct)
    {
        var result = await _circulation.CreateMyReservationForBookAsync(
            CirculationService.ReadUserId(User), request.BookId, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationReservationDto>.Ok(result.Data!, new { message = "Đã đặt trước sách." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("reservations/{id:guid}/cancel")]
    public async Task<IActionResult> CancelReservation(Guid id, CancellationToken ct)
    {
        var result = await _circulation.CancelReservationAsync(id, CirculationService.ReadUserId(User), byLibrarian: false, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true, new { message = "Đã hủy đặt trước." }))
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
