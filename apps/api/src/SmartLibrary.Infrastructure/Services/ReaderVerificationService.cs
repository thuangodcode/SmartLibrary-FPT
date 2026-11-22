using Microsoft.EntityFrameworkCore;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

/// <summary>Centralizes the reader verification rule used by sign-in, profile, circulation, and support.</summary>
public static class ReaderVerificationService
{
    public static async Task<bool> IsVerifiedAsync(AppDbContext db, Guid readerId, CancellationToken cancellationToken)
    {
        var profile = await db.UserProfiles.AsNoTracking()
            .FirstOrDefaultAsync(user => user.Id == readerId, cancellationToken);
        if (profile is null || !profile.IsActive || profile.IsDeleted
            || profile.Status != AccountStatus.Active)
            return false;

        if (await db.RegistrationRequests.AsNoTracking().AnyAsync(
                request => request.UserId == readerId && request.Status == RegistrationRequestStatus.Approved,
                cancellationToken))
            return true;

        // Library-provisioned active readers already passed the internal student/lecturer account approval flow.
        if (profile.Status == AccountStatus.Active
            && (!string.IsNullOrWhiteSpace(profile.StudentId)
                || !string.IsNullOrWhiteSpace(profile.TeacherId)
                || !string.IsNullOrWhiteSpace(profile.EmployeeId)))
            return true;

        // Existing readers with a librarian-approved or completed loan have already passed the library's approval flow.
        if (await db.BorrowRecords.IgnoreQueryFilters().AsNoTracking().AnyAsync(
                record => record.ReaderId == readerId && !record.IsDeleted
                    && (record.Status == BorrowStatus.Approved
                        || record.Status == BorrowStatus.Borrowed
                        || record.Status == BorrowStatus.Returned
                        || record.Status == BorrowStatus.Overdue),
                cancellationToken))
            return true;

        if (string.IsNullOrWhiteSpace(profile.Phone)
            || string.IsNullOrWhiteSpace(profile.Address) || profile.DateOfBirth is null
            || (profile.StudentId is null && profile.TeacherId is null && profile.EmployeeId is null))
            return false;

        var approvedDocumentSides = await db.IdentityDocuments.IgnoreQueryFilters().AsNoTracking()
            .Where(document => document.Request.UserId == readerId && !document.IsDeleted
                && document.Request.Status == RegistrationRequestStatus.Approved)
            .Select(document => document.Side)
            .Distinct()
            .CountAsync(cancellationToken);

        return approvedDocumentSides == 3;
    }
}
