using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Regulations;

/// <summary>
/// Admin "Quản lý quy định" over policy_rules. Configurable borrow/fine types stay in Policies.
/// </summary>
public class RegulationService
{
    private readonly PolicyRuleService _policies;

    public RegulationService(PolicyRuleService policies)
    {
        _policies = policies;
    }

    public Task<PolicyRuleListResultDto> GetPagedAsync(
        string? search, string? type, string? status, int page, int pageSize, CancellationToken ct = default)
        => _policies.GetPagedAsync(search, type, status, page, pageSize, PolicyRuleKinds.RegulationTypes, ct);

    public async Task<Result<PolicyRuleDetailDto>> GetByKeyAsync(string key, CancellationToken ct = default)
    {
        var result = await _policies.GetByKeyAsync(key, ct);
        if (!result.IsSuccess)
            return result;
        if (!PolicyRuleKinds.IsRegulation(result.Data!.PolicyType))
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");
        return result;
    }

    public Task<Result<PolicyRuleDetailDto>> CreateAsync(UpsertPolicyRuleRequest request, Guid actorId, CancellationToken ct = default)
    {
        if (!TryEnsureRegulationType(request.PolicyType, out var error))
            return Task.FromResult(Result<PolicyRuleDetailDto>.Failure(error));
        return _policies.CreateAsync(request, actorId, ct);
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateAsync(string key, UpsertPolicyRuleRequest request, Guid actorId, CancellationToken ct = default)
    {
        var existing = await GetByKeyAsync(key, ct);
        if (!existing.IsSuccess)
            return existing;
        if (!TryEnsureRegulationType(request.PolicyType, out var error))
            return Result<PolicyRuleDetailDto>.Failure(error);
        return await _policies.UpdateAsync(key, request, actorId, ct);
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateStatusAsync(string key, UpdatePolicyStatusRequest request, Guid actorId, CancellationToken ct = default)
    {
        var existing = await GetByKeyAsync(key, ct);
        if (!existing.IsSuccess)
            return existing;
        return await _policies.UpdateStatusAsync(key, request, actorId, ct);
    }

    public async Task<Result<bool>> DeleteAsync(string key, Guid actorId, CancellationToken ct = default)
    {
        var existing = await GetByKeyAsync(key, ct);
        if (!existing.IsSuccess)
            return Result<bool>.Failure(existing.Error!);
        return await _policies.DeleteAsync(key, actorId, ct);
    }

    private static bool TryEnsureRegulationType(string? policyType, out string error)
    {
        error = "Loại quy định không hợp lệ.";
        if (string.IsNullOrWhiteSpace(policyType)
            || !Enum.TryParse<PolicyRuleType>(policyType, true, out var parsed)
            || !PolicyRuleKinds.IsRegulation(parsed))
            return false;
        error = string.Empty;
        return true;
    }
}
