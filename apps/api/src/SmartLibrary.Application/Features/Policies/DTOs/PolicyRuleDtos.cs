using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Policies.DTOs;

public sealed class PolicyRuleParameterDto
{
    public string Key { get; init; } = string.Empty;
    public string Value { get; init; } = string.Empty;
    public string? Label { get; init; }
}

public sealed class PolicyRuleTargetDto
{
    public string TargetType { get; init; } = string.Empty;
    public string TargetValue { get; init; } = string.Empty;
    public string? TargetLabel { get; init; }
}

public sealed class PolicyRuleHistoryDto
{
    public Guid Id { get; init; }
    public string? ChangedByName { get; init; }
    public string ChangeSummary { get; init; } = string.Empty;
    public string? BeforeJson { get; init; }
    public string? AfterJson { get; init; }
    public DateTime CreatedAt { get; init; }
}

public sealed class PolicyRuleListItemDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public PolicyRuleType PolicyType { get; init; }
    public PolicyRuleStatus Status { get; init; }
    public int Priority { get; init; }
    public bool OverridesGeneral { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public string? UpdatedByName { get; init; }
    public IReadOnlyList<PolicyRuleParameterDto> Parameters { get; init; } = Array.Empty<PolicyRuleParameterDto>();
}

public sealed class PolicyRuleDetailDto
{
    public Guid Id { get; init; }
    public string Code { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string? Description { get; init; }
    public PolicyRuleType PolicyType { get; init; }
    public PolicyRuleStatus Status { get; init; }
    public int Priority { get; init; }
    public bool OverridesGeneral { get; init; }
    public DateTime? EffectiveFrom { get; init; }
    public DateTime? EffectiveTo { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime UpdatedAt { get; init; }
    public string? CreatedByName { get; init; }
    public string? UpdatedByName { get; init; }
    public IReadOnlyList<PolicyRuleParameterDto> Parameters { get; init; } = Array.Empty<PolicyRuleParameterDto>();
    public IReadOnlyList<PolicyRuleTargetDto> Targets { get; init; } = Array.Empty<PolicyRuleTargetDto>();
    public IReadOnlyList<PolicyRuleHistoryDto> Histories { get; init; } = Array.Empty<PolicyRuleHistoryDto>();
}

public sealed class PolicyCategoryCountDto
{
    public string Key { get; init; } = string.Empty;
    public string Label { get; init; } = string.Empty;
    public int Count { get; init; }
}

public sealed class PolicyRuleListResultDto
{
    public IReadOnlyList<PolicyRuleListItemDto> Items { get; init; } = Array.Empty<PolicyRuleListItemDto>();
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
    public int TotalPages { get; init; }
    public IReadOnlyList<PolicyCategoryCountDto> Categories { get; init; } = Array.Empty<PolicyCategoryCountDto>();
}

public sealed class UpsertPolicyRuleRequest
{
    public string? Code { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string PolicyType { get; set; } = string.Empty;
    public string Status { get; set; } = "Draft";
    public int Priority { get; set; }
    public bool OverridesGeneral { get; set; }
    public DateTime? EffectiveFrom { get; set; }
    public DateTime? EffectiveTo { get; set; }
    public List<PolicyRuleParameterDto> Parameters { get; set; } = new();
    public List<PolicyRuleTargetDto> Targets { get; set; } = new();
}

public sealed class UpdatePolicyStatusRequest
{
    public string Status { get; set; } = string.Empty;
}
