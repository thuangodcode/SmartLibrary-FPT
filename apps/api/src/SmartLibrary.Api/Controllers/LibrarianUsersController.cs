using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Exceptions;

namespace SmartLibrary.Api.Controllers;

/// <summary>
/// Endpoints for Librarian user-management tasks (import readers, etc.).
/// </summary>
[ApiController]
[Route("api/v1/librarian/users")]
[Authorize(Policy = "LibrarianOnly")]
public sealed class LibrarianUsersController : ControllerBase
{
    private const long MaximumImportFileSize = 2 * 1024 * 1024;
    private readonly IAdminUserManagementService _userManagementService;

    public LibrarianUsersController(IAdminUserManagementService userManagementService)
    {
        _userManagementService = userManagementService;
    }

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetReaderById(Guid userId, CancellationToken cancellationToken)
    {
        var reader = await _userManagementService.GetReaderByIdAsync(userId, cancellationToken);
        return reader is null
            ? NotFound(ApiResponse<object>.Fail("Không tìm thấy độc giả."))
            : Ok(ApiResponse<object>.Ok(reader));
    }

    [HttpPost("import")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaximumImportFileSize)]
    public async Task<IActionResult> ImportReaders(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var librarianId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Thủ thư."));
        if (file is null || file.Length == 0)
            return BadRequest(ApiResponse<object>.Fail("Vui lòng chọn tệp CSV hoặc Excel không rỗng."));
        if (file.Length > MaximumImportFileSize)
            return BadRequest(ApiResponse<object>.Fail("Kích thước tệp không được vượt quá 2 MB."));
        if (!IsSupportedImportFile(file.FileName))
            return BadRequest(ApiResponse<object>.Fail("Chỉ hỗ trợ tệp CSV hoặc Excel (.xlsx)."));

        try
        {
            await using var stream = file.OpenReadStream();
            var result = await _userManagementService.ImportReadersAsync(
                file.FileName,
                stream,
                librarianId,
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

    private static bool IsSupportedImportFile(string fileName) =>
        Path.GetExtension(fileName).Equals(".csv", StringComparison.OrdinalIgnoreCase) ||
        Path.GetExtension(fileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase);
}
