using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Policies;

public interface IPolicyRuleRepository
{
    Task<(IReadOnlyList<PolicyRuleListItemDto> Items, int TotalCount)> GetPagedAsync(
        string? search,
        PolicyRuleType? type,
        PolicyRuleStatus? status,
        int page,
        int pageSize,
        IReadOnlyCollection<PolicyRuleType>? allowedTypes,
        CancellationToken ct = default);

    Task<IReadOnlyList<PolicyCategoryCountDto>> GetCategoryCountsAsync(
        IReadOnlyCollection<PolicyRuleType>? allowedTypes,
        CancellationToken ct = default);

    Task<PolicyRule?> GetByIdWithDetailsAsync(Guid id, CancellationToken ct = default);

    Task<PolicyRule?> GetByKeyWithDetailsAsync(string key, CancellationToken ct = default);

    Task<string> AllocateNextCodeAsync(string prefix, CancellationToken ct = default);

    Task<bool> CodeExistsAsync(string code, Guid? excludeId, CancellationToken ct = default);

    Task AddAsync(PolicyRule entity, CancellationToken ct = default);

    Task UpdateAsync(PolicyRule entity, CancellationToken ct = default);

    Task<Guid?> FindIdByKeyAsync(string key, CancellationToken ct = default);

    Task<int> ReplaceChildrenAsync(
        Guid policyRuleId,
        IReadOnlyList<PolicyRuleParameter> parameters,
        IReadOnlyList<PolicyRuleTarget> targets,
        CancellationToken ct = default);

    Task<int> UpdateScalarsAsync(
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
        CancellationToken ct = default);

    Task AddHistoryAsync(PolicyRuleHistory history, CancellationToken ct = default);

    Task<string?> GetUserDisplayNameAsync(Guid userId, CancellationToken ct = default);
}
