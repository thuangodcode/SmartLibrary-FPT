using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Exceptions;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/admin/users")]
[Authorize(Policy = "AdminOnly")]
public sealed class AdminUsersController : ControllerBase
{
    private const long MaximumCsvFileSize = 2 * 1024 * 1024;
    private readonly IAdminUserManagementService _userManagementService;

    public AdminUsersController(IAdminUserManagementService userManagementService)
    {
        _userManagementService = userManagementService;
    }

    [HttpGet]
    public async Task<IActionResult> GetUsers(
        [FromQuery] string? role,
        [FromQuery] string? q,
        [FromQuery] string? status,
        [FromQuery] string? readerType,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var users = await _userManagementService.GetUsersAsync(
                role, q, status, readerType, page, pageSize, cancellationToken);
            return Ok(ApiResponse<object>.Ok(users));
        }
        catch (ValidationException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    [HttpPost("librarians")]
    public async Task<IActionResult> CreateLibrarian(
        [FromBody] CreateLibrarianRequest request,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var adminId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        try
        {
            var librarian = await _userManagementService.CreateLibrarianAsync(request, adminId, cancellationToken);
            return Ok(ApiResponse<object>.Ok(librarian));
        }
        catch (ValidationException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    [HttpPost("import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaximumCsvFileSize)]
    public async Task<IActionResult> ImportReaders(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var adminId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));
        if (file is null || file.Length == 0)
            return BadRequest(ApiResponse<object>.Fail("Vui lòng chọn tệp CSV không rỗng."));
        if (file.Length > MaximumCsvFileSize)
            return BadRequest(ApiResponse<object>.Fail("Kích thước tệp CSV không được vượt quá 2 MB."));
        if (!Path.GetExtension(file.FileName).Equals(".csv", StringComparison.OrdinalIgnoreCase))
            return BadRequest(ApiResponse<object>.Fail("Chỉ hỗ trợ tệp CSV."));

        try
        {
            await using var stream = file.OpenReadStream();
            var result = await _userManagementService.ImportReadersAsync(
                file.FileName,
                stream,
                adminId,
                cancellationToken);
            return Ok(ApiResponse<object>.Ok(result));
        }
        catch (ValidationException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
