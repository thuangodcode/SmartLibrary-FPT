using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/v1/me/circulation")]
public class CirculationMeController : ControllerBase
{
    private readonly CirculationService _circulation;

    public CirculationMeController(CirculationService circulation)
    {
        _circulation = circulation;
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

    [HttpPost("loans")]
    public async Task<IActionResult> RequestBorrow([FromBody] BorrowRequest request, CancellationToken ct)
    {
        var result = await _circulation.RequestBorrowAsync(CirculationService.ReadUserId(User), request, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<CirculationLoanDto>.Ok(result.Data!, new { message = "Đã gửi yêu cầu mượn. Chờ thủ thư xác nhận." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }

    [HttpPost("loans/{id:guid}/renew")]
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

    [HttpPost("reservations/{id:guid}/cancel")]
    public async Task<IActionResult> CancelReservation(Guid id, CancellationToken ct)
    {
        var result = await _circulation.CancelReservationAsync(id, CirculationService.ReadUserId(User), byLibrarian: false, ct);
        return result.IsSuccess
            ? Ok(ApiResponse<bool>.Ok(true, new { message = "Đã hủy đặt trước." }))
            : BadRequest(ApiResponse<object>.Fail(result.Error!));
    }
}
