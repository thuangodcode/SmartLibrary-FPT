using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class PolicyRuleRepository : IPolicyRuleRepository
{
    private readonly AppDbContext _context;

    public PolicyRuleRepository(AppDbContext context)
    {
        _context = context;
    }

    public async Task<(IReadOnlyList<PolicyRuleListItemDto> Items, int TotalCount)> GetPagedAsync(
        string? search,
        PolicyRuleType? type,
        PolicyRuleStatus? status,
        int page,
        int pageSize,
        CancellationToken ct = default)
    {
        var query = _context.PolicyRules.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(p =>
                p.Name.ToLower().Contains(q) ||
                (p.Description != null && p.Description.ToLower().Contains(q)));
        }

        if (type.HasValue)
            query = query.Where(p => p.PolicyType == type.Value);

        if (status.HasValue)
            query = query.Where(p => p.Status == status.Value);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(p => p.UpdatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new PolicyRuleListItemDto
            {
                Id = p.Id,
                Name = p.Name,
                Description = p.Description,
                PolicyType = p.PolicyType,
                Status = p.Status,
                Priority = p.Priority,
                OverridesGeneral = p.OverridesGeneral,
                CreatedAt = p.CreatedAt
            })
            .ToListAsync(ct);

        return (items, total);
    }

    public async Task<IReadOnlyList<PolicyCategoryCountDto>> GetCategoryCountsAsync(CancellationToken ct = default)
    {
        var grouped = await _context.PolicyRules
            .AsNoTracking()
            .GroupBy(p => p.PolicyType)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var total = grouped.Sum(x => x.Count);
        var map = grouped.ToDictionary(x => x.Type, x => x.Count);

        return new List<PolicyCategoryCountDto>
        {
            new() { Key = "All", Label = "Tất cả chính sách", Count = total },
            new() { Key = nameof(PolicyRuleType.BorrowLimit), Label = "Hạn mức mượn", Count = map.GetValueOrDefault(PolicyRuleType.BorrowLimit) },
            new() { Key = nameof(PolicyRuleType.BorrowDuration), Label = "Thời hạn mượn", Count = map.GetValueOrDefault(PolicyRuleType.BorrowDuration) },
            new() { Key = nameof(PolicyRuleType.Renewal), Label = "Gia hạn", Count = map.GetValueOrDefault(PolicyRuleType.Renewal) },
            new() { Key = nameof(PolicyRuleType.Reservation), Label = "Đặt trước sách", Count = map.GetValueOrDefault(PolicyRuleType.Reservation) },
            new() { Key = nameof(PolicyRuleType.FineFee), Label = "Phí phạt & lệ phí", Count = map.GetValueOrDefault(PolicyRuleType.FineFee) },
            new() { Key = nameof(PolicyRuleType.CategoryOverride), Label = "Theo danh mục sách", Count = map.GetValueOrDefault(PolicyRuleType.CategoryOverride) },
            new() { Key = nameof(PolicyRuleType.Other), Label = "Quy định khác", Count = map.GetValueOrDefault(PolicyRuleType.Other) },
        };
    }

    public Task<PolicyRule?> GetByIdWithDetailsAsync(Guid id, CancellationToken ct = default) =>
        _context.PolicyRules
            .Include(p => p.Parameters)
            .Include(p => p.Targets)
            .Include(p => p.Histories)
            .Include(p => p.CreatedByUser)
            .Include(p => p.UpdatedByUser)
            .FirstOrDefaultAsync(p => p.Id == id, ct);

    public async Task AddAsync(PolicyRule entity, CancellationToken ct = default)
    {
        await _context.PolicyRules.AddAsync(entity, ct);
    }

    public Task UpdateAsync(PolicyRule entity, CancellationToken ct = default)
    {
        _context.PolicyRules.Update(entity);
        return Task.CompletedTask;
    }

    public async Task AddHistoryAsync(PolicyRuleHistory history, CancellationToken ct = default)
    {
        await _context.PolicyRuleHistories.AddAsync(history, ct);
    }

    public async Task<string?> GetUserDisplayNameAsync(Guid userId, CancellationToken ct = default)
    {
        return await _context.UserProfiles
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.FullName)
            .FirstOrDefaultAsync(ct);
    }
}
