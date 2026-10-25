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
        IReadOnlyCollection<PolicyRuleType>? allowedTypes,
        CancellationToken ct = default)
    {
        var query = _context.PolicyRules.AsNoTracking().AsQueryable();

        if (allowedTypes is { Count: > 0 })
            query = query.Where(p => allowedTypes.Contains(p.PolicyType));

        if (!string.IsNullOrWhiteSpace(search))
        {
            var q = search.Trim().ToLower();
            query = query.Where(p =>
                p.Code.ToLower().Contains(q) ||
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
                Code = p.Code,
                Name = p.Name,
                Description = p.Description,
                PolicyType = p.PolicyType,
                Status = p.Status,
                Priority = p.Priority,
                OverridesGeneral = p.OverridesGeneral,
                CreatedAt = p.CreatedAt,
                UpdatedAt = p.UpdatedAt,
                UpdatedByName = p.UpdatedByUser != null ? p.UpdatedByUser.FullName : null,
                Parameters = p.Parameters.Select(x => new PolicyRuleParameterDto
                {
                    Key = x.ParamKey,
                    Value = x.ParamValue,
                    Label = x.DisplayLabel
                }).ToList()
            })
            .ToListAsync(ct);

        return (items, total);
    }

    public async Task<IReadOnlyList<PolicyCategoryCountDto>> GetCategoryCountsAsync(
        IReadOnlyCollection<PolicyRuleType>? allowedTypes,
        CancellationToken ct = default)
    {
        var query = _context.PolicyRules.AsNoTracking().AsQueryable();
        if (allowedTypes is { Count: > 0 })
            query = query.Where(p => allowedTypes.Contains(p.PolicyType));

        var grouped = await query
            .GroupBy(p => p.PolicyType)
            .Select(g => new { Type = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var total = grouped.Sum(x => x.Count);
        var map = grouped.ToDictionary(x => x.Type, x => x.Count);
        var types = allowedTypes is { Count: > 0 }
            ? allowedTypes
            : PolicyRuleKinds.PolicyTypes.Concat(PolicyRuleKinds.RegulationTypes).ToArray();

        var items = new List<PolicyCategoryCountDto>
        {
            new() { Key = "All", Label = "Tất cả danh mục", Count = total }
        };

        foreach (var policyType in types)
        {
            items.Add(new PolicyCategoryCountDto
            {
                Key = policyType.ToString(),
                Label = LabelFor(policyType),
                Count = map.GetValueOrDefault(policyType)
            });
        }

        return items;
    }

    private static string LabelFor(PolicyRuleType type) => type switch
    {
        PolicyRuleType.BorrowLimit => "Hạn mức mượn",
        PolicyRuleType.BorrowDuration => "Thời hạn mượn",
        PolicyRuleType.Renewal => "Gia hạn",
        PolicyRuleType.Reservation => "Đặt trước sách",
        PolicyRuleType.FineFee => "Phí phạt & lệ phí",
        PolicyRuleType.CategoryOverride => "Theo danh mục sách",
        PolicyRuleType.LibraryUse => "Sử dụng thư viện",
        PolicyRuleType.OpeningHours => "Thời gian hoạt động",
        PolicyRuleType.LibraryService => "Dịch vụ",
        PolicyRuleType.Conduct => "Trật tự và vệ sinh",
        PolicyRuleType.Safety => "An toàn thư viện",
        PolicyRuleType.DocumentCare => "Bảo quản tài liệu",
        PolicyRuleType.DocumentUse => "Mượn tài liệu",
        PolicyRuleType.QuotaInfo => "Hạn mức và thời hạn",
        PolicyRuleType.ReturnRule => "Trả tài liệu",
        PolicyRuleType.RenewalInfo => "Gia hạn",
        PolicyRuleType.Compensation => "Vi phạm và bồi thường",
        PolicyRuleType.General => "Quy định chung",
        PolicyRuleType.Violation => "Kỷ luật và vi phạm",
        _ => "Quy định khác"
    };

    public Task<PolicyRule?> GetByIdWithDetailsAsync(Guid id, CancellationToken ct = default) =>
        QueryWithDetails().FirstOrDefaultAsync(p => p.Id == id, ct);

    public Task<PolicyRule?> GetByKeyWithDetailsAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return Task.FromResult<PolicyRule?>(null);

        var trimmed = key.Trim();
        if (Guid.TryParse(trimmed, out var id))
            return GetByIdWithDetailsAsync(id, ct);

        var code = trimmed.ToUpperInvariant();
        return QueryWithDetails().FirstOrDefaultAsync(p => p.Code.ToUpper() == code, ct);
    }

    public async Task<string> AllocateNextCodeAsync(string prefix, CancellationToken ct = default)
    {
        var normalized = string.IsNullOrWhiteSpace(prefix) ? "CS" : prefix.Trim().ToUpperInvariant();
        var codes = await _context.PolicyRules
            .IgnoreQueryFilters()
            .Select(p => p.Code)
            .ToListAsync(ct);

        var max = 0;
        foreach (var code in codes)
        {
            if (code.Length <= normalized.Length || !code.StartsWith(normalized, StringComparison.OrdinalIgnoreCase))
                continue;
            if (int.TryParse(code.AsSpan(normalized.Length), out var number) && number > max)
                max = number;
        }

        return $"{normalized}{(max + 1).ToString("D2")}";
    }

    public Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default)
    {
        var normalized = code.Trim().ToUpperInvariant();
        var query = _context.PolicyRules.IgnoreQueryFilters().Where(p => p.Code.ToUpper() == normalized);
        if (excludeId.HasValue)
            query = query.Where(p => p.Id != excludeId.Value);
        return query.AnyAsync(ct);
    }

    private IQueryable<PolicyRule> QueryWithDetails() =>
        _context.PolicyRules
            .AsNoTracking()
            .AsSingleQuery()
            .Include(p => p.Parameters)
            .Include(p => p.Targets)
            .Include(p => p.Histories)
            .Include(p => p.CreatedByUser)
            .Include(p => p.UpdatedByUser);

    public async Task AddAsync(PolicyRule entity, CancellationToken ct = default)
    {
        await _context.PolicyRules.AddAsync(entity, ct);
    }

    public Task UpdateAsync(PolicyRule entity, CancellationToken ct = default)
    {
        var entry = _context.Entry(entity);
        if (entry.State == EntityState.Detached)
            _context.Attach(entity);
        if (entry.State is EntityState.Unchanged or EntityState.Detached)
            entry.State = EntityState.Modified;
        return Task.CompletedTask;
    }

    public async Task<Guid?> FindIdByKeyAsync(string key, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(key))
            return null;

        var trimmed = key.Trim();
        if (Guid.TryParse(trimmed, out var id))
        {
            var exists = await _context.PolicyRules.AsNoTracking().AnyAsync(p => p.Id == id, ct);
            return exists ? id : null;
        }

        var code = trimmed.ToUpperInvariant();
        return await _context.PolicyRules.AsNoTracking()
            .Where(p => p.Code.ToUpper() == code)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(ct);
    }

    public async Task<int> ReplaceChildrenAsync(
        Guid policyRuleId,
        IReadOnlyList<PolicyRuleParameter> parameters,
        IReadOnlyList<PolicyRuleTarget> targets,
        CancellationToken ct = default)
    {
        _context.ChangeTracker.Clear();
        var deleted = await _context.PolicyRuleParameters
            .IgnoreQueryFilters()
            .Where(p => p.PolicyRuleId == policyRuleId)
            .ExecuteDeleteAsync(ct);
        deleted += await _context.PolicyRuleTargets
            .IgnoreQueryFilters()
            .Where(t => t.PolicyRuleId == policyRuleId)
            .ExecuteDeleteAsync(ct);

        foreach (var parameter in parameters)
        {
            parameter.Id = parameter.Id == Guid.Empty ? Guid.NewGuid() : parameter.Id;
            parameter.PolicyRuleId = policyRuleId;
            parameter.PolicyRule = null;
            await _context.PolicyRuleParameters.AddAsync(parameter, ct);
        }

        foreach (var target in targets)
        {
            target.Id = target.Id == Guid.Empty ? Guid.NewGuid() : target.Id;
            target.PolicyRuleId = policyRuleId;
            target.PolicyRule = null;
            await _context.PolicyRuleTargets.AddAsync(target, ct);
        }

        return deleted;
    }

    public Task<int> UpdateScalarsAsync(
        Guid id,
        string name,
        string? description,
        PolicyRuleType policyType,
        PolicyRuleStatus status,
        int priority,
        bool overridesGeneral,
        DateTime? effectiveFrom,
        DateTime? effectiveTo,
        Guid? updatedBy,
        bool isDeleted,
        CancellationToken ct = default)
    {
        _context.ChangeTracker.Clear();
        var now = DateTime.UtcNow;
        return _context.PolicyRules
            .IgnoreQueryFilters()
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(p => p.Name, name)
                .SetProperty(p => p.Description, description)
                .SetProperty(p => p.PolicyType, policyType)
                .SetProperty(p => p.Status, status)
                .SetProperty(p => p.Priority, priority)
                .SetProperty(p => p.OverridesGeneral, overridesGeneral)
                .SetProperty(p => p.EffectiveFrom, effectiveFrom)
                .SetProperty(p => p.EffectiveTo, effectiveTo)
                .SetProperty(p => p.UpdatedBy, updatedBy)
                .SetProperty(p => p.UpdatedAt, now)
                .SetProperty(p => p.IsDeleted, isDeleted), ct);
    }

    public async Task AddHistoryAsync(PolicyRuleHistory history, CancellationToken ct = default)
    {
        history.PolicyRule = null;
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
