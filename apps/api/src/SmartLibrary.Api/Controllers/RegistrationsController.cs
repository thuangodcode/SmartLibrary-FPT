using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class RegistrationsController : ControllerBase
{
    private readonly IRegistrationService _registrationService;

    public RegistrationsController(IRegistrationService registrationService)
    {
        _registrationService = registrationService;
    }

    [HttpGet]
    // [Authorize(Policy = "RequireLibrarianOrAdmin")]
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
        var reviewerId = GetCurrentUserId();
        await _registrationService.ApproveRegistrationAsync(id, reviewerId, request.MembershipExpiresAt, request.Note);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Approved successfully." }));
    }

    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> RejectRegistration(Guid id, [FromBody] RejectRequest request)
    {
        var reviewerId = GetCurrentUserId();
        await _registrationService.RejectRegistrationAsync(id, reviewerId, request.Reason);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Rejected successfully." }));
    }
    
    [HttpPost("{id:guid}/request-more-info")]
    public async Task<IActionResult> RequestMoreInfo(Guid id, [FromBody] RejectRequest request)
    {
        var reviewerId = GetCurrentUserId();
        await _registrationService.RequestMoreInfoAsync(id, reviewerId, request.Reason);
        return Ok(ApiResponse<object>.Ok(true, new { message = "Requested more info." }));
    }

    private Guid GetCurrentUserId()
    {
        var val = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
               ?? User.FindFirst("sub")?.Value;
        if (Guid.TryParse(val, out var id) && id != Guid.Empty)
            return id;

        // Default librarian reviewer ID if token is missing/dev
        return Guid.Parse("e464f184-a8eb-4b04-b5a8-88ea49946354");
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
