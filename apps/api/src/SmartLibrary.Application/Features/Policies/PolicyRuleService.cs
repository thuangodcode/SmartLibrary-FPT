using System.Text.Json;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Policies;

public class PolicyRuleService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    private readonly IPolicyRuleRepository _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IRagIndexer? _ragIndexer;

    public PolicyRuleService(
        IPolicyRuleRepository repository,
        IUnitOfWork unitOfWork,
        IRagIndexer? ragIndexer = null)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _ragIndexer = ragIndexer;
    }

    public Task<PolicyRuleListResultDto> GetPagedAsync(
        string? search,
        string? type,
        string? status,
        int page,
        int pageSize,
        CancellationToken ct = default)
        => GetPagedAsync(search, type, status, page, pageSize, null, ct);

    public async Task<PolicyRuleListResultDto> GetPagedAsync(
        string? search,
        string? type,
        string? status,
        int page,
        int pageSize,
        IReadOnlyCollection<PolicyRuleType>? allowedTypes,
        CancellationToken ct = default)
    {
        PolicyRuleType? parsedType = null;
        if (!string.IsNullOrWhiteSpace(type) && !type.Equals("All", StringComparison.OrdinalIgnoreCase)
            && Enum.TryParse<PolicyRuleType>(type, true, out var typeValue))
        {
            parsedType = typeValue;
        }

        PolicyRuleStatus? parsedStatus = null;
        if (!string.IsNullOrWhiteSpace(status) && !status.Equals("All", StringComparison.OrdinalIgnoreCase)
            && Enum.TryParse<PolicyRuleStatus>(status, true, out var statusValue))
        {
            parsedStatus = statusValue;
        }

        var safePage = page < 1 ? 1 : page;
        var safePageSize = pageSize < 1 ? 10 : Math.Min(pageSize, 50);

        var (items, total) = await _repository.GetPagedAsync(
            search, parsedType, parsedStatus, safePage, safePageSize, allowedTypes, ct);
        var categories = await _repository.GetCategoryCountsAsync(allowedTypes, ct);

        return new PolicyRuleListResultDto
        {
            Items = items,
            TotalCount = total,
            Page = safePage,
            PageSize = safePageSize,
            TotalPages = (int)Math.Ceiling(total / (double)safePageSize),
            Categories = categories
        };
    }

    public async Task<Result<PolicyRuleDetailDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var entity = await _repository.GetByIdWithDetailsAsync(id, ct);
        if (entity is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");

        return Result<PolicyRuleDetailDto>.Success(MapDetail(entity));
    }

    public async Task<Result<PolicyRuleDetailDto>> GetByKeyAsync(string key, CancellationToken ct = default)
    {
        var entity = await _repository.GetByKeyWithDetailsAsync(key, ct);
        if (entity is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");

        return Result<PolicyRuleDetailDto>.Success(MapDetail(entity));
    }

    public async Task<Result<PolicyRuleDetailDto>> CreateAsync(
        UpsertPolicyRuleRequest request,
        Guid actorId,
        CancellationToken ct = default)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
            return Result<PolicyRuleDetailDto>.Failure(validationError);

        var policyType = Enum.Parse<PolicyRuleType>(request.PolicyType, true);
        var code = await ResolveCodeAsync(request.Code, policyType, excludeId: null, ct);
        if (!code.IsSuccess)
            return Result<PolicyRuleDetailDto>.Failure(code.Error!);

        var entity = new PolicyRule
        {
            Code = code.Data!,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            PolicyType = policyType,
            Status = Enum.Parse<PolicyRuleStatus>(request.Status, true),
            Priority = request.Priority,
            OverridesGeneral = request.OverridesGeneral || policyType == PolicyRuleType.CategoryOverride,
            EffectiveFrom = request.EffectiveFrom,
            EffectiveTo = request.EffectiveTo,
            CreatedBy = actorId,
            UpdatedBy = actorId
        };

        ApplyChildren(entity, request);

        await _repository.AddAsync(entity, ct);
        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct) ?? "Admin";
        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = entity.Id,
            ChangedBy = actorId,
            ChangedByName = actorName,
            ChangeSummary = "Tạo quy định mới",
            AfterJson = SerializeSnapshot(entity)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);
        QueueRagPolicySync(entity.Id, entity.Status, deleted: false);

        var created = await _repository.GetByIdWithDetailsAsync(entity.Id, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(created!));
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateAsync(
        string key,
        UpsertPolicyRuleRequest request,
        Guid actorId,
        CancellationToken ct = default)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
            return Result<PolicyRuleDetailDto>.Failure(validationError);

        var id = await _repository.FindIdByKeyAsync(key, ct);
        if (id is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");

        var existing = await _repository.GetByIdWithDetailsAsync(id.Value, ct);
        if (existing is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");

        var before = SerializeSnapshot(existing);
        var policyType = Enum.Parse<PolicyRuleType>(request.PolicyType, true);
        var status = Enum.Parse<PolicyRuleStatus>(request.Status, true);
        var overridesGeneral = request.OverridesGeneral || policyType == PolicyRuleType.CategoryOverride;

        var parameters = request.Parameters
            .Where(x => !string.IsNullOrWhiteSpace(x.Key) && !string.IsNullOrWhiteSpace(x.Value))
            .GroupBy(x => x.Key.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(g => g.Last())
            .Select(p => new PolicyRuleParameter
            {
                Id = Guid.NewGuid(),
                PolicyRuleId = id.Value,
                ParamKey = p.Key.Trim(),
                ParamValue = p.Value!.Trim(),
                DisplayLabel = p.Label?.Trim()
            }).ToList();
        var targets = request.Targets
            .Where(x => !string.IsNullOrWhiteSpace(x.TargetType))
            .Select(t => new PolicyRuleTarget
            {
                Id = Guid.NewGuid(),
                PolicyRuleId = id.Value,
                TargetType = t.TargetType.Trim(),
                TargetValue = string.IsNullOrWhiteSpace(t.TargetValue) ? "*" : t.TargetValue.Trim(),
                TargetLabel = t.TargetLabel?.Trim()
            }).ToList();

        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct);
        Guid? updatedBy = actorName is null ? null : actorId;

        var affected = await _repository.UpdateScalarsAsync(
            id.Value,
            request.Name.Trim(),
            request.Description?.Trim(),
            policyType,
            status,
            request.Priority,
            overridesGeneral,
            request.EffectiveFrom,
            request.EffectiveTo,
            updatedBy,
            existing.IsDeleted,
            ct);
        if (affected == 0)
            return Result<PolicyRuleDetailDto>.Failure("Không lưu được quy định. Tải lại trang rồi thử lại.");

        await _repository.ReplaceChildrenAsync(id.Value, parameters, targets, ct);

        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = id.Value,
            ChangedBy = updatedBy,
            ChangedByName = actorName ?? "Admin",
            ChangeSummary = "Cập nhật quy định",
            BeforeJson = before,
            AfterJson = JsonSerializer.Serialize(new
            {
                existing.Code,
                Name = request.Name.Trim(),
                Description = request.Description?.Trim(),
                PolicyType = policyType.ToString(),
                Status = status.ToString()
            }, JsonOptions)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);
        QueueRagPolicySync(id.Value, status, deleted: false);

        var updated = await _repository.GetByIdWithDetailsAsync(id.Value, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(updated!));
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateStatusAsync(
        string key,
        UpdatePolicyStatusRequest request,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PolicyRuleStatus>(request.Status, true, out var newStatus))
            return Result<PolicyRuleDetailDto>.Failure("Trạng thái không hợp lệ.");

        var entity = await _repository.GetByKeyWithDetailsAsync(key, ct);
        if (entity is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy quy định.");

        var statusError = PolicyParameterRules.Validate(
            entity.PolicyType.ToString(),
            newStatus.ToString(),
            entity.Parameters.Select(p => new PolicyRuleParameterDto
            {
                Key = p.ParamKey,
                Value = p.ParamValue,
                Label = p.DisplayLabel
            }));
        if (statusError is not null)
            return Result<PolicyRuleDetailDto>.Failure(statusError);

        var before = SerializeSnapshot(entity);
        var oldStatus = entity.Status;
        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct);
        Guid? updatedBy = actorName is null ? null : actorId;
        var affected = await _repository.UpdateScalarsAsync(
            entity.Id,
            entity.Name,
            entity.Description,
            entity.PolicyType,
            newStatus,
            entity.Priority,
            entity.OverridesGeneral,
            entity.EffectiveFrom,
            entity.EffectiveTo,
            updatedBy,
            entity.IsDeleted,
            ct);
        if (affected == 0)
            return Result<PolicyRuleDetailDto>.Failure("Không đổi được trạng thái. Tải lại trang rồi thử lại.");

        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = entity.Id,
            ChangedBy = updatedBy,
            ChangedByName = actorName ?? "Admin",
            ChangeSummary = $"Đổi trạng thái: {oldStatus} → {newStatus}",
            BeforeJson = before,
            AfterJson = JsonSerializer.Serialize(new { entity.Code, Status = newStatus.ToString() }, JsonOptions)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);
        QueueRagPolicySync(entity.Id, newStatus, deleted: false);

        var updated = await _repository.GetByIdWithDetailsAsync(entity.Id, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(updated!));
    }

    public async Task<Result<bool>> DeleteAsync(string key, Guid actorId, CancellationToken ct = default)
    {
        var entity = await _repository.GetByKeyWithDetailsAsync(key, ct);
        if (entity is null)
            return Result<bool>.Failure("Không tìm thấy quy định.");

        var before = SerializeSnapshot(entity);
        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct);
        Guid? updatedBy = actorName is null ? null : actorId;
        var affected = await _repository.UpdateScalarsAsync(
            entity.Id,
            entity.Name,
            entity.Description,
            entity.PolicyType,
            entity.Status,
            entity.Priority,
            entity.OverridesGeneral,
            entity.EffectiveFrom,
            entity.EffectiveTo,
            updatedBy,
            true,
            ct);
        if (affected == 0)
            return Result<bool>.Failure("Không xóa được quy định. Tải lại trang rồi thử lại.");

        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = entity.Id,
            ChangedBy = updatedBy,
            ChangedByName = actorName ?? "Admin",
            ChangeSummary = "Xóa quy định",
            BeforeJson = before
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);
        QueueRagPolicySync(entity.Id, entity.Status, deleted: true);
        return Result<bool>.Success(true);
    }

    private void QueueRagPolicySync(Guid policyId, PolicyRuleStatus status, bool deleted)
    {
        if (_ragIndexer is null)
            return;
        _ = SyncRagPolicyAsync(policyId, status, deleted, CancellationToken.None);
    }

    private async Task SyncRagPolicyAsync(Guid policyId, PolicyRuleStatus status, bool deleted, CancellationToken ct)
    {
        if (_ragIndexer is null)
            return;

        try
        {
            if (deleted || status != PolicyRuleStatus.Active)
                await _ragIndexer.DeleteAsync("policy", policyId, ct);
            else
                await _ragIndexer.UpsertPolicyAsync(policyId, ct);
        }
        catch
        {
            // Không chặn lưu chính sách nếu Gemini/RAG lỗi.
        }
    }

    private async Task<Result<string>> ResolveCodeAsync(
        string? requestedCode,
        PolicyRuleType policyType,
        Guid? excludeId,
        CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(requestedCode))
        {
            var code = requestedCode.Trim().ToUpperInvariant();
            if (code.Length > 20 || !code.All(ch => char.IsLetterOrDigit(ch)))
                return Result<string>.Failure("Mã quy định chỉ gồm chữ và số, tối đa 20 ký tự.");
            if (await _repository.CodeExistsAsync(code, excludeId, ct))
                return Result<string>.Failure("Mã quy định đã tồn tại.");
            return Result<string>.Success(code);
        }

        var prefix = PolicyRuleKinds.IsRegulation(policyType) ? "QD" : "CS";
        return Result<string>.Success(await _repository.AllocateNextCodeAsync(prefix, ct));
    }

    private static string? ValidateRequest(UpsertPolicyRuleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return "Vui lòng nhập tên quy định.";
        if (!Enum.TryParse<PolicyRuleType>(request.PolicyType, true, out _))
            return "Loại quy định không hợp lệ.";
        if (!Enum.TryParse<PolicyRuleStatus>(request.Status, true, out _))
            return "Trạng thái không hợp lệ.";
        if (request.EffectiveFrom.HasValue && request.EffectiveTo.HasValue
            && request.EffectiveTo < request.EffectiveFrom)
            return "Ngày kết thúc phải sau ngày bắt đầu.";
        return PolicyParameterRules.Validate(request.PolicyType, request.Status, request.Parameters);
    }

    private static void ApplyChildren(PolicyRule entity, UpsertPolicyRuleRequest request)
    {
        foreach (var p in request.Parameters.Where(x => !string.IsNullOrWhiteSpace(x.Key) && !string.IsNullOrWhiteSpace(x.Value)))
        {
            entity.Parameters.Add(new PolicyRuleParameter
            {
                ParamKey = p.Key.Trim(),
                ParamValue = p.Value!.Trim(),
                DisplayLabel = p.Label?.Trim()
            });
        }

        foreach (var t in request.Targets.Where(x => !string.IsNullOrWhiteSpace(x.TargetType)))
        {
            entity.Targets.Add(new PolicyRuleTarget
            {
                TargetType = t.TargetType.Trim(),
                TargetValue = string.IsNullOrWhiteSpace(t.TargetValue) ? "*" : t.TargetValue.Trim(),
                TargetLabel = t.TargetLabel?.Trim()
            });
        }
    }

    private static string SerializeSnapshot(PolicyRule entity) =>
        JsonSerializer.Serialize(new
        {
            entity.Code,
            entity.Name,
            entity.Description,
            PolicyType = entity.PolicyType.ToString(),
            Status = entity.Status.ToString(),
            entity.Priority,
            entity.OverridesGeneral,
            Parameters = entity.Parameters.Select(p => new { p.ParamKey, p.ParamValue }),
            Targets = entity.Targets.Select(t => new { t.TargetType, t.TargetValue, t.TargetLabel })
        }, JsonOptions);

    private static PolicyRuleDetailDto MapDetail(PolicyRule entity) => new()
    {
        Id = entity.Id,
        Code = entity.Code,
        Name = entity.Name,
        Description = entity.Description,
        PolicyType = entity.PolicyType,
        Status = entity.Status,
        Priority = entity.Priority,
        OverridesGeneral = entity.OverridesGeneral,
        EffectiveFrom = entity.EffectiveFrom,
        EffectiveTo = entity.EffectiveTo,
        CreatedAt = entity.CreatedAt,
        UpdatedAt = entity.UpdatedAt,
        CreatedByName = entity.CreatedByUser?.FullName,
        UpdatedByName = entity.UpdatedByUser?.FullName,
        Parameters = entity.Parameters
            .OrderBy(p => p.ParamKey)
            .Select(p => new PolicyRuleParameterDto
            {
                Key = p.ParamKey,
                Value = p.ParamValue,
                Label = p.DisplayLabel
            }).ToList(),
        Targets = entity.Targets
            .Select(t => new PolicyRuleTargetDto
            {
                TargetType = t.TargetType,
                TargetValue = t.TargetValue,
                TargetLabel = t.TargetLabel
            }).ToList(),
        Histories = entity.Histories
            .OrderByDescending(h => h.CreatedAt)
            .Select(h => new PolicyRuleHistoryDto
            {
                Id = h.Id,
                ChangedByName = h.ChangedByName,
                ChangeSummary = h.ChangeSummary,
                BeforeJson = h.BeforeJson,
                AfterJson = h.AfterJson,
                CreatedAt = h.CreatedAt
            }).ToList()
    };
}
