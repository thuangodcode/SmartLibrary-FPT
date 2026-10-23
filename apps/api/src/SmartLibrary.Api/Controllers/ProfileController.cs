using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/profile")]
[Authorize]
public sealed class ProfileController(
    IUserProfileService profileService,
    IStorageService storageService) : ControllerBase
{
    private const long MaximumAvatarFileSize = 5 * 1024 * 1024;

    /// <summary>Returns the profile belonging to the authenticated user.</summary>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<UserProfileResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản hiện tại."));

        var profile = await profileService.GetAsync(userId, cancellationToken);
        return profile is null
            ? NotFound(ApiResponse<object>.Fail("Không tìm thấy hồ sơ người dùng."))
            : Ok(ApiResponse<UserProfileResponse>.Ok(profile));
    }

    /// <summary>Updates editable profile fields for the authenticated user.</summary>
    [HttpPut]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(MaximumAvatarFileSize + 1024 * 1024)]
    [ProducesResponseType(typeof(ApiResponse<UserProfileResponse>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(
        [FromForm] UpdateProfileForm form,
        CancellationToken cancellationToken)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản hiện tại."));
        if (string.IsNullOrWhiteSpace(form.FullName) || form.FullName.Trim().Length > 255)
            return BadRequest(ApiResponse<object>.Fail("Họ và tên phải có từ 1 đến 255 ký tự."));
        if (form.Phone is not null && form.Phone.Trim().Length > 30)
            return BadRequest(ApiResponse<object>.Fail("Số điện thoại không được vượt quá 30 ký tự."));
        if (form.Address is not null && form.Address.Trim().Length > 500)
            return BadRequest(ApiResponse<object>.Fail("Địa chỉ không được vượt quá 500 ký tự."));

        DateOnly? dateOfBirth = null;
        if (!string.IsNullOrWhiteSpace(form.DateOfBirth))
        {
            if (!DateOnly.TryParseExact(
                    form.DateOfBirth,
                    "yyyy-MM-dd",
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.None,
                    out var parsedDate))
                return BadRequest(ApiResponse<object>.Fail("Ngày sinh không hợp lệ."));
            dateOfBirth = parsedDate;
        }

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
            avatarUrl = await storageService.UploadFileAsync(
                stream, $"{Guid.NewGuid():N}{extension}", "profile-avatars", cancellationToken);
        }

        try
        {
            var profile = await profileService.UpdateAsync(
                userId,
                new UpdateUserProfileRequest(
                    form.FullName,
                    form.Phone,
                    form.Address,
                    dateOfBirth,
                    form.ClearAvatar,
                    avatarUrl),
                cancellationToken);
            return profile is null
                ? NotFound(ApiResponse<object>.Fail("Không tìm thấy hồ sơ người dùng."))
                : Ok(ApiResponse<UserProfileResponse>.Ok(profile));
        }
        catch (ArgumentException exception)
        {
            return BadRequest(ApiResponse<object>.Fail(exception.Message));
        }
    }

    /// <summary>Editable profile fields and an optional avatar upload.</summary>
    public sealed class UpdateProfileForm
    {
        public string? FullName { get; set; }
        public string? Phone { get; set; }
        public string? Address { get; set; }
        public string? DateOfBirth { get; set; }
        public bool ClearAvatar { get; set; }
        public IFormFile? Avatar { get; set; }
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }

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
