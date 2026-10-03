using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IRegistrationService _registrationService;

    public MeController(IRegistrationService registrationService)
    {
        _registrationService = registrationService;
    }

    [HttpGet("verification")]
    public async Task<IActionResult> GetVerificationStatus()
    {
        // TODO: Get user's current profile status and latest registration request
        return Ok(ApiResponse<object>.Ok(new { status = "PendingDocuments" }));
    }

    [HttpPost("verification/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadDocuments(
        [FromForm] DocumentType documentType,
        [FromForm] IFormFile? front,
        [FromForm] IFormFile? back,
        [FromForm] IFormFile? selfie)
    {
        var userId = Guid.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? Guid.Empty.ToString());
        
        await _registrationService.SubmitDocumentsAsync(userId, documentType, front, back, selfie);
        
        return Ok(ApiResponse<object>.Ok(true, new { message = "Documents submitted successfully." }));
    }
}
