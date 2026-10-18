using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize(Policy = "LibrarianOnly")]
public class RegistrationsController : ControllerBase
{
    private readonly IRegistrationService _registrationService;

    public RegistrationsController(IRegistrationService registrationService)
    {
        _registrationService = registrationService;
    }

    [HttpGet]
    public async Task<IActionResult> GetRegistrations([FromQuery] string? status, [FromQuery] string? q, [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] int page = 1)
    {
        var result = await _registrationService.GetPendingRegistrationsAsync(status, q, from, to, page, 20);
        return Ok(ApiResponse<object>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetRegistrationDetail(Guid id)
    {
        var result = await _registrationService.GetRegistrationDetailAsync(id);
        return Ok(ApiResponse<object>.Ok(result));
    }

    [HttpGet("{id:guid}/documents/{docId:guid}/url")]
    public async Task<IActionResult> GetDocumentUrl(Guid id, Guid docId)
    {
        // TODO: Audit logging DocumentViewed
        var url = await _registrationService.GetDocumentPresignedUrlAsync(id, docId);
        return Ok(ApiResponse<object>.Ok(new { url }));
    }

    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> ApproveRegistration(Guid id, [FromBody] ApproveRequest request)
    {
        if (!TryGetCurrentUserId(out var reviewerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản người duyệt."));

        await _registrationService.ApproveRegistrationAsync(id, reviewerId, request.MembershipExpiresAt, request.Note);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Approved successfully." }));
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> RejectRegistration(Guid id, [FromBody] RejectRequest request)
    {
        if (!TryGetCurrentUserId(out var reviewerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản người duyệt."));

        await _registrationService.RejectRegistrationAsync(id, reviewerId, request.Reason);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Rejected successfully." }));
    }
    
    [HttpPost("{id:guid}/request-more-info")]
    public async Task<IActionResult> RequestMoreInfo(Guid id, [FromBody] RejectRequest request)
    {
        if (!TryGetCurrentUserId(out var reviewerId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản người duyệt."));

        await _registrationService.RequestMoreInfoAsync(id, reviewerId, request.Reason);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Requested more info." }));
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var val = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
               ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(val, out userId) && userId != Guid.Empty;
    }
}

public class ApproveRequest
{
    public DateTime? MembershipExpiresAt { get; set; }
    public string? Note { get; set; }
}

public class RejectRequest
{
    public string Reason { get; set; } = string.Empty;
}
