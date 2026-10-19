using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Users;
using SmartLibrary.Application.Features.Users.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class ReaderRepository : IReaderRepository
{
    private readonly AppDbContext _context;

    public ReaderRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<(IReadOnlyList<ReaderListItemDto> Items, int TotalCount)> GetPagedAsync(
        string? query,
        AccountStatus? status,
        ReaderType? readerType,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var q = _context.UserProfiles
            .Include(u => u.Role)
            .Where(u => !u.IsDeleted && u.Role.Name == "Reader")
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query))
        {
            var lowerQ = query.Trim().ToLower();
            q = q.Where(u =>
                u.FullName.ToLower().Contains(lowerQ) ||
                u.Email.ToLower().Contains(lowerQ) ||
                (u.Phone != null && u.Phone.Contains(lowerQ)) ||
                (u.StudentId != null && u.StudentId.ToLower().Contains(lowerQ)));
        }

        if (status.HasValue)
            q = q.Where(u => u.Status == status.Value);

        if (readerType.HasValue)
            q = q.Where(u => u.ReaderType == readerType.Value);

        var total = await q.CountAsync(ct);

        var items = await q
            .OrderByDescending(u => u.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(u => new ReaderListItemDto
            {
                Id = u.Id,
                FullName = u.FullName,
                Email = u.Email,
                Phone = u.Phone,
                StudentId = u.StudentId,
                Address = u.Address,
                DateOfBirth = u.DateOfBirth,
                AvatarUrl = u.AvatarUrl,
                RoleName = u.Role != null ? u.Role.Name : "Reader",
                Status = u.Status,
                ReaderType = u.ReaderType,
                MembershipExpiresAt = u.MembershipExpiresAt,
                IsActive = u.IsActive,
                LastLoginAt = u.LastLoginAt,
                CreatedAt = u.CreatedAt,
                BorrowingCount = _context.BorrowRecords.Count(b =>
                    b.ReaderId == u.Id && b.Status == BorrowStatus.Borrowed && !b.IsDeleted),
                OverdueCount = _context.BorrowRecords.Count(b =>
                    b.ReaderId == u.Id && b.Status == BorrowStatus.Overdue && !b.IsDeleted),
                UnpaidFines = _context.Fines
                    .Where(f => f.ReaderId == u.Id && f.Status == FineStatus.Pending && !f.IsDeleted)
                    .Sum(f => (decimal?)f.Amount) ?? 0
            })
            .ToListAsync(ct);

        return (items, total);
    }

    public async Task<ReaderStatsDto> GetStatsAsync(CancellationToken ct = default)
    {
        var totalActive = await CountReadersByStatusAsync("Active", ct);
        var totalPending = await _context.Database
            .SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM profiles p JOIN roles r ON p.role_id = r.id WHERE p.is_deleted = false AND r.name = 'Reader' AND p.status::text IN ('PendingApproval', 'PendingVerification')")
            .SingleAsync(ct);
        var totalSuspended = await CountReadersByStatusAsync("Suspended", ct);
        var totalReaders = await _context.UserProfiles.CountAsync(u => !u.IsDeleted && u.Role.Name == "Reader", ct);

        return new ReaderStatsDto
        {
            TotalReaders = totalReaders,
            ActiveReaders = totalActive,
            PendingReaders = totalPending,
            SuspendedReaders = totalSuspended
        };
    }

    private Task<int> CountReadersByStatusAsync(string status, CancellationToken ct) =>
        _context.Database
            .SqlQuery<int>($"SELECT COUNT(*)::int AS \"Value\" FROM profiles p JOIN roles r ON p.role_id = r.id WHERE p.is_deleted = false AND r.name = 'Reader' AND p.status::text = {status}")
            .SingleAsync(ct);

    public async Task<ReaderDetailDto?> GetDetailAsync(Guid id, CancellationToken ct = default)
    {
        return await _context.UserProfiles
            .Include(u => u.Role)
            .Where(u => u.Id == id && !u.IsDeleted && u.Role.Name == "Reader")
            .Select(u => new ReaderDetailDto
            {
                Id = u.Id,
                FullName = u.FullName,
                Email = u.Email,
                Phone = u.Phone,
                StudentId = u.StudentId,
                Address = u.Address,
                DateOfBirth = u.DateOfBirth,
                AvatarUrl = u.AvatarUrl,
                RoleName = u.Role != null ? u.Role.Name : "Reader",
                Status = u.Status,
                ReaderType = u.ReaderType,
                MembershipExpiresAt = u.MembershipExpiresAt,
                IsActive = u.IsActive,
                LastLoginAt = u.LastLoginAt,
                CreatedAt = u.CreatedAt,
                BorrowCount = _context.BorrowRecords.Count(b => b.ReaderId == u.Id && !b.IsDeleted),
                ActiveBorrowCount = _context.BorrowRecords.Count(b =>
                    b.ReaderId == u.Id && b.Status == BorrowStatus.Borrowed && !b.IsDeleted),
                OverdueCount = _context.BorrowRecords.Count(b =>
                    b.ReaderId == u.Id && b.Status == BorrowStatus.Overdue && !b.IsDeleted),
                TotalFines = _context.Fines.Where(f => f.ReaderId == u.Id && !f.IsDeleted).Sum(f => (decimal?)f.Amount) ?? 0,
                Registration = _context.RegistrationRequests
                    .Where(r => r.UserId == u.Id)
                    .OrderByDescending(r => r.SubmittedAt)
                    .Select(r => new ReaderRegistrationSummaryDto
                    {
                        Id = r.Id,
                        DocumentType = r.DocumentType,
                        Status = r.Status,
                        SubmittedAt = r.SubmittedAt,
                        FrontDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Front).Select(d => d.StoragePath).FirstOrDefault(),
                        BackDocUrl = r.Documents.Where(d => d.Side == DocumentSide.Back).Select(d => d.StoragePath).FirstOrDefault(),
                        SelfieUrl = r.Documents.Where(d => d.Side == DocumentSide.Selfie).Select(d => d.StoragePath).FirstOrDefault()
                    }).FirstOrDefault()
            })
            .FirstOrDefaultAsync(ct);
    }

    public Task<UserProfile?> GetByIdAsync(Guid id, CancellationToken ct = default) =>
        _context.UserProfiles.FirstOrDefaultAsync(u => u.Id == id && !u.IsDeleted, ct);

    public Task UpdateAsync(UserProfile profile, CancellationToken ct = default)
    {
        _context.UserProfiles.Update(profile);
        return Task.CompletedTask;
    }
}
