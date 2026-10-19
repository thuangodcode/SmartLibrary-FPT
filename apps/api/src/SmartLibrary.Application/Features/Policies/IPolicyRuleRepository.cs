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
        CancellationToken ct = default);

    Task<IReadOnlyList<PolicyCategoryCountDto>> GetCategoryCountsAsync(CancellationToken ct = default);

    Task<PolicyRule?> GetByIdWithDetailsAsync(Guid id, CancellationToken ct = default);

    Task AddAsync(PolicyRule entity, CancellationToken ct = default);

    Task UpdateAsync(PolicyRule entity, CancellationToken ct = default);

    Task AddHistoryAsync(PolicyRuleHistory history, CancellationToken ct = default);

    Task<string?> GetUserDisplayNameAsync(Guid userId, CancellationToken ct = default);
}
