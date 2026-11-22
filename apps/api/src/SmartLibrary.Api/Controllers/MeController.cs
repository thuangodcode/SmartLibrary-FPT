using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
[Authorize]
public class MeController : ControllerBase
{
    private readonly IRegistrationService _registrationService;
    private readonly AppDbContext _db;

    public MeController(IRegistrationService registrationService, AppDbContext db)
    {
        _registrationService = registrationService;
        _db = db;
    }

    [HttpGet("verification")]
    public async Task<IActionResult> GetVerificationStatus(CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
        var profile = await _db.UserProfiles.AsNoTracking().FirstOrDefaultAsync(user => user.Id == userId, ct);
        if (profile is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy hồ sơ."));
        var registration = await _db.RegistrationRequests.AsNoTracking()
            .Where(request => request.UserId == userId)
            .OrderByDescending(request => request.SubmittedAt)
            .Select(request => new { request.Id, status = request.Status.ToString(), request.SubmittedAt, request.Note, request.RejectReason })
            .FirstOrDefaultAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { status = profile.Status.ToString(), registration }));
    }

    public class UploadDocumentsForm
    {
        public DocumentType DocumentType { get; set; }
        public IFormFile? Front { get; set; }
        public IFormFile? Back { get; set; }
        public IFormFile? Selfie { get; set; }
    }

    [HttpPost("verification/documents")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UploadDocuments([FromForm] UploadDocumentsForm form)
    {
        if (!Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Phiên đăng nhập không hợp lệ."));
        
        await _registrationService.SubmitDocumentsAsync(userId, form.DocumentType, form.Front, form.Back, form.Selfie);
        
        return Ok(ApiResponse<object>.Ok(true, new { message = "Documents submitted successfully." }));
    }
}
