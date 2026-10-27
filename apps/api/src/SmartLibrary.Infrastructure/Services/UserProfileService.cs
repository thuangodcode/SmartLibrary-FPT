using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Domain.Exceptions;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public sealed class UserProfileService(
    AppDbContext dbContext,
    IAuthOtpService authOtpService,
    IIdentityProvider identityProvider,
    ILogger<UserProfileService> logger) : IUserProfileService
{
    private const string InternalEmailDomain = "@smartlibrary.local";

    public async Task<UserProfileResponse?> GetAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await dbContext.UserProfiles
            .AsNoTracking()
            .Include(user => user.Role)
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);

        if (profile is null) return null;

        var reg = await dbContext.RegistrationRequests
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.SubmittedAt)
            .Select(r => new
            {
                r.DocumentType,
                FrontDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Front && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
                BackDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Back && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
                SelfieDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Selfie && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return Map(profile, reg?.FrontDocUrl, reg?.BackDocUrl, reg?.SelfieDocUrl, reg?.DocumentType.ToString());
    }

    public async Task<UserProfileResponse?> UpdateAsync(
        Guid userId,
        UpdateUserProfileRequest request,
        CancellationToken cancellationToken)
    {
        var fullName = request.FullName?.Trim();
        if (string.IsNullOrWhiteSpace(fullName) || fullName.Length > 255)
            throw new ArgumentException("Họ và tên phải có từ 1 đến 255 ký tự.");

        var phone = NormalizeOptional(request.Phone);
        var address = NormalizeOptional(request.Address);
        if (phone is not null && phone.Length > 30)
            throw new ArgumentException("Số điện thoại không được vượt quá 30 ký tự.");
        if (address is not null && address.Length > 500)
            throw new ArgumentException("Địa chỉ không được vượt quá 500 ký tự.");

        var profile = await dbContext.UserProfiles
            .Include(user => user.Role)
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);
        if (profile is null)
            return null;

        profile.FullName = fullName;
        profile.Phone = phone;
        profile.Address = address;
        profile.DateOfBirth = request.DateOfBirth;
        if (request.ClearAvatar)
            profile.AvatarUrl = null;
        else if (!string.IsNullOrWhiteSpace(request.AvatarUrl))
            profile.AvatarUrl = request.AvatarUrl;

        await dbContext.SaveChangesAsync(cancellationToken);

        var reg = await dbContext.RegistrationRequests
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.SubmittedAt)
            .Select(r => new
            {
                r.DocumentType,
                FrontDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Front && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
                BackDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Back && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
                SelfieDocUrl = r.Documents.Where(d => d.Side == SmartLibrary.Domain.Enums.DocumentSide.Selfie && !d.IsDeleted).Select(d => d.StoragePath).FirstOrDefault(),
            })
            .FirstOrDefaultAsync(cancellationToken);

        return Map(profile, reg?.FrontDocUrl, reg?.BackDocUrl, reg?.SelfieDocUrl, reg?.DocumentType.ToString());
    }

    public async Task<string> SendEmailVerificationOtpAsync(
        Guid userId,
        string email,
        CancellationToken cancellationToken)
    {
        var profile = await GetImportedStudentAsync(userId, cancellationToken);
        if (string.IsNullOrWhiteSpace(email))
            throw new ArgumentException("Vui lòng nhập email cá nhân.");
        ValidatePersonalEmail(profile, email);
        var normalizedEmail = email.Trim().ToLowerInvariant();
        await EnsureEmailAvailableAsync(userId, normalizedEmail, cancellationToken);

        var result = await authOtpService.SendOtpAsync(normalizedEmail, cancellationToken);
        if (!result.IsSuccess)
            throw new ArgumentException(result.Error ?? "Không thể gửi mã xác minh email.");

        return result.Data?.Message ?? "Mã xác minh đã được gửi đến email của bạn.";
    }

    public async Task<UserProfileResponse?> VerifyAndUpdateEmailAsync(
        Guid userId,
        string email,
        string otp,
        CancellationToken cancellationToken)
    {
        var profile = await GetImportedStudentAsync(userId, cancellationToken);
        if (string.IsNullOrWhiteSpace(email))
            throw new ArgumentException("Vui lòng nhập email cá nhân.");
        ValidatePersonalEmail(profile, email);
        if (string.IsNullOrWhiteSpace(otp))
            throw new ArgumentException("Vui lòng nhập mã OTP.");

        var normalizedEmail = email.Trim().ToLowerInvariant();
        await EnsureEmailAvailableAsync(userId, normalizedEmail, cancellationToken);
        var verification = authOtpService.VerifyOtp(normalizedEmail, otp);
        if (!verification.IsSuccess || verification.Data?.Verified != true)
            throw new ArgumentException(verification.Error ?? "Mã OTP không chính xác hoặc đã hết hạn.");

        var previousEmail = profile.Email;
        await identityProvider.UpdateEmailAsync(profile.Id.ToString(), normalizedEmail, cancellationToken);
        try
        {
            profile.Email = normalizedEmail;
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (Exception updateException)
        {
            try
            {
                await identityProvider.UpdateEmailAsync(
                    profile.Id.ToString(),
                    previousEmail,
                    CancellationToken.None);
            }
            catch (Exception rollbackException)
            {
                logger.LogCritical(
                    rollbackException,
                    "Could not restore auth email for user {UserId} after profile email update failed.",
                    userId);
                throw new InvalidOperationException(
                    "Email đã được cập nhật trên hệ thống xác thực nhưng chưa đồng bộ được hồ sơ. Vui lòng liên hệ quản trị viên.",
                    updateException);
            }

            throw;
        }

        return Map(profile);
    }

    private async Task<UserProfile> GetImportedStudentAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await dbContext.UserProfiles
            .Include(user => user.Role)
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);
        if (profile is null)
            throw new ArgumentException("Không tìm thấy hồ sơ người dùng.");
        if (profile.Role.Name != "Reader" ||
            profile.ReaderType != ReaderType.Student ||
            !profile.Email.EndsWith(InternalEmailDomain, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Chức năng này chỉ áp dụng cho tài khoản sinh viên được nhập từ danh sách.");
        }

        return profile;
    }

    private static void ValidatePersonalEmail(UserProfile profile, string email)
    {
        var normalizedEmail = email?.Trim() ?? string.Empty;
        if (normalizedEmail.Length > 320 ||
            !new EmailAddressAttribute().IsValid(normalizedEmail) ||
            normalizedEmail.EndsWith(InternalEmailDomain, StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException("Vui lòng nhập email cá nhân hợp lệ.");
        }

        if (string.Equals(profile.Email, normalizedEmail, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Email này đã được xác minh cho tài khoản.");
    }

    private async Task EnsureEmailAvailableAsync(
        Guid userId,
        string email,
        CancellationToken cancellationToken)
    {
        if (await dbContext.UserProfiles
                .IgnoreQueryFilters()
                .AnyAsync(profile =>
                    profile.Id != userId &&
                    !profile.IsDeleted &&
                    profile.Email.ToLower() == email,
                    cancellationToken))
        {
            throw new ArgumentException("Email này đã được một tài khoản khác sử dụng.");
        }
    }

    private static UserProfileResponse Map(
        UserProfile profile,
        string? frontDocUrl = null,
        string? backDocUrl = null,
        string? selfieDocUrl = null,
        string? documentType = null) => new(
        profile.Id,
        profile.Email,
        profile.FullName,
        profile.AvatarUrl,
        profile.Phone,
        profile.StudentId,
        profile.TeacherId,
        profile.EmployeeId,
        profile.Address,
        profile.DateOfBirth,
        profile.Role.Name,
        frontDocUrl,
        backDocUrl,
        selfieDocUrl,
        documentType);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
