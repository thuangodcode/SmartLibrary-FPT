using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public sealed class UserProfileService(AppDbContext dbContext) : IUserProfileService
{
    public async Task<UserProfileResponse?> GetAsync(Guid userId, CancellationToken cancellationToken)
    {
        var profile = await dbContext.UserProfiles
            .AsNoTracking()
            .Include(user => user.Role)
            .FirstOrDefaultAsync(user => user.Id == userId, cancellationToken);

        return profile is null ? null : Map(profile);
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
        return Map(profile);
    }

    private static UserProfileResponse Map(UserProfile profile) => new(
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
        profile.Role.Name);

    private static string? NormalizeOptional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
