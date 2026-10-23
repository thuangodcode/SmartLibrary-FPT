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
    private const long MaximumImportFileSize = 2 * 1024 * 1024;
    private const long MaximumAvatarFileSize = 5 * 1024 * 1024;
    private readonly IAdminUserManagementService _userManagementService;
    private readonly IStorageService _storageService;

    public AdminUsersController(
        IAdminUserManagementService userManagementService,
        IStorageService storageService)
    {
        _userManagementService = userManagementService;
        _storageService = storageService;
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

    [HttpGet("{userId:guid}")]
    public async Task<IActionResult> GetUserById(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _userManagementService.GetUserByIdAsync(userId, cancellationToken);
        return user is null
            ? NotFound(ApiResponse<object>.Fail("Không tìm thấy người dùng."))
            : Ok(ApiResponse<object>.Ok(user));
    }

    [HttpGet("{userId:guid}/registrations/{registrationId:guid}/documents/{documentId:guid}/url")]
    public async Task<IActionResult> GetIdentityDocumentUrl(
        Guid userId,
        Guid registrationId,
        Guid documentId,
        CancellationToken cancellationToken)
    {
        var url = await _userManagementService.GetUserIdentityDocumentUrlAsync(
            userId, registrationId, documentId, cancellationToken);
        return url is null
            ? NotFound(ApiResponse<object>.Fail("Không tìm thấy giấy tờ xác minh của tài khoản này."))
            : Ok(ApiResponse<object>.Ok(new { url }));
    }

    [HttpPut("{userId:guid}")]
    public async Task<IActionResult> UpdateUser(
        Guid userId,
        [FromBody] UpdateManagedUserRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var user = await _userManagementService.UpdateUserAsync(userId, request, cancellationToken);
            return user is null
                ? NotFound(ApiResponse<object>.Fail("Không tìm thấy người dùng."))
                : Ok(ApiResponse<object>.Ok(user));
        }
        catch (ValidationException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    [HttpPut("{userId:guid}/status")]
    public async Task<IActionResult> UpdateUserStatus(
        Guid userId,
        [FromBody] UpdateManagedUserStatusRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var user = await _userManagementService.UpdateUserStatusAsync(userId, request, cancellationToken);
            return user is null
                ? NotFound(ApiResponse<object>.Fail("Không tìm thấy người dùng."))
                : Ok(ApiResponse<object>.Ok(user));
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

    public sealed class CreateLibrarianWithAvatarForm
    {
        public string? FullName { get; set; }
        public string? EmployeeId { get; set; }
        public string? Username { get; set; }
        public string? Password { get; set; }
        public string? Phone { get; set; }
        public IFormFile? Avatar { get; set; }
    }

    [HttpPost("librarians/avatar")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaximumAvatarFileSize + 1024 * 1024)]
    public async Task<IActionResult> CreateLibrarianWithAvatar(
        [FromForm] CreateLibrarianWithAvatarForm form,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var adminId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        string? avatarUrl = null;
        if (form.Avatar is not null)
        {
            if (form.Avatar.Length == 0)
                return BadRequest(ApiResponse<object>.Fail("Ảnh đại diện không được để trống."));
            if (form.Avatar.Length > MaximumAvatarFileSize)
                return BadRequest(ApiResponse<object>.Fail("Ảnh đại diện không được vượt quá 5 MB."));

            var extension = GetAvatarExtension(form.Avatar.ContentType);
            if (extension is null)
                return BadRequest(ApiResponse<object>.Fail("Ảnh đại diện phải có định dạng JPG, PNG hoặc WebP."));

            await using var stream = form.Avatar.OpenReadStream();
            if (!await HasValidImageSignatureAsync(stream, form.Avatar.ContentType, cancellationToken))
                return BadRequest(ApiResponse<object>.Fail("Nội dung ảnh không đúng với định dạng tệp đã chọn."));

            stream.Position = 0;
            var fileName = $"{Guid.NewGuid():N}{extension}";
            avatarUrl = await _storageService.UploadFileAsync(stream, fileName, "staff-avatars", cancellationToken);
        }

        var request = new CreateLibrarianRequest
        {
            FullName = form.FullName,
            EmployeeId = form.EmployeeId,
            Username = form.Username,
            Password = form.Password,
            Phone = form.Phone,
            AvatarUrl = avatarUrl
        };

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
    [RequestSizeLimit(MaximumImportFileSize)]
    public async Task<IActionResult> ImportReaders(
        IFormFile? file,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var adminId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));
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

    private static bool IsSupportedImportFile(string fileName) =>
        Path.GetExtension(fileName).Equals(".csv", StringComparison.OrdinalIgnoreCase) ||
        Path.GetExtension(fileName).Equals(".xlsx", StringComparison.OrdinalIgnoreCase);

    private static string? GetAvatarExtension(string? contentType) => contentType?.ToLowerInvariant() switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        _ => null
    };

    private static async Task<bool> HasValidImageSignatureAsync(
        Stream stream,
        string? contentType,
        CancellationToken cancellationToken)
    {
        var signature = new byte[12];
        var bytesRead = await stream.ReadAsync(signature.AsMemory(), cancellationToken);
        return contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => bytesRead >= 3 &&
                signature[0] == 0xFF && signature[1] == 0xD8 && signature[2] == 0xFF,
            "image/png" => bytesRead >= 8 &&
                signature.AsSpan(0, 8).SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A }),
            "image/webp" => bytesRead >= 12 &&
                signature.AsSpan(0, 4).SequenceEqual("RIFF"u8) &&
                signature.AsSpan(8, 4).SequenceEqual("WEBP"u8),
            _ => false
        };
    }

}
