using System.Text.Json;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Policies;

public class PolicyRuleService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = false };

    private readonly IPolicyRuleRepository _repository;
    private readonly IUnitOfWork _unitOfWork;

    public PolicyRuleService(IPolicyRuleRepository repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<PolicyRuleListResultDto> GetPagedAsync(
        string? search,
        string? type,
        string? status,
        int page,
        int pageSize,
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

        var (items, total) = await _repository.GetPagedAsync(search, parsedType, parsedStatus, safePage, safePageSize, ct);
        var categories = await _repository.GetCategoryCountsAsync(ct);

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
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy chính sách.");

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

        var entity = new PolicyRule
        {
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            PolicyType = Enum.Parse<PolicyRuleType>(request.PolicyType, true),
            Status = Enum.Parse<PolicyRuleStatus>(request.Status, true),
            Priority = request.Priority,
            OverridesGeneral = request.OverridesGeneral || request.PolicyType.Equals(nameof(PolicyRuleType.CategoryOverride), StringComparison.OrdinalIgnoreCase),
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
            ChangeSummary = "Tạo chính sách mới",
            AfterJson = SerializeSnapshot(entity)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);

        var created = await _repository.GetByIdWithDetailsAsync(entity.Id, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(created!));
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateAsync(
        Guid id,
        UpsertPolicyRuleRequest request,
        Guid actorId,
        CancellationToken ct = default)
    {
        var validationError = ValidateRequest(request);
        if (validationError is not null)
            return Result<PolicyRuleDetailDto>.Failure(validationError);

        var entity = await _repository.GetByIdWithDetailsAsync(id, ct);
        if (entity is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy chính sách.");

        var before = SerializeSnapshot(entity);

        entity.Name = request.Name.Trim();
        entity.Description = request.Description?.Trim();
        entity.PolicyType = Enum.Parse<PolicyRuleType>(request.PolicyType, true);
        entity.Status = Enum.Parse<PolicyRuleStatus>(request.Status, true);
        entity.Priority = request.Priority;
        entity.OverridesGeneral = request.OverridesGeneral || entity.PolicyType == PolicyRuleType.CategoryOverride;
        entity.EffectiveFrom = request.EffectiveFrom;
        entity.EffectiveTo = request.EffectiveTo;
        entity.UpdatedBy = actorId;

        entity.Parameters.Clear();
        entity.Targets.Clear();
        ApplyChildren(entity, request);

        await _repository.UpdateAsync(entity, ct);

        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct) ?? "Admin";
        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = entity.Id,
            ChangedBy = actorId,
            ChangedByName = actorName,
            ChangeSummary = "Cập nhật chính sách",
            BeforeJson = before,
            AfterJson = SerializeSnapshot(entity)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);

        var updated = await _repository.GetByIdWithDetailsAsync(entity.Id, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(updated!));
    }

    public async Task<Result<PolicyRuleDetailDto>> UpdateStatusAsync(
        Guid id,
        UpdatePolicyStatusRequest request,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!Enum.TryParse<PolicyRuleStatus>(request.Status, true, out var newStatus))
            return Result<PolicyRuleDetailDto>.Failure("Trạng thái không hợp lệ.");

        var entity = await _repository.GetByIdWithDetailsAsync(id, ct);
        if (entity is null)
            return Result<PolicyRuleDetailDto>.Failure("Không tìm thấy chính sách.");

        var before = SerializeSnapshot(entity);
        var oldStatus = entity.Status;
        entity.Status = newStatus;
        entity.UpdatedBy = actorId;

        await _repository.UpdateAsync(entity, ct);

        var actorName = await _repository.GetUserDisplayNameAsync(actorId, ct) ?? "Admin";
        await _repository.AddHistoryAsync(new PolicyRuleHistory
        {
            PolicyRuleId = entity.Id,
            ChangedBy = actorId,
            ChangedByName = actorName,
            ChangeSummary = $"Đổi trạng thái: {oldStatus} → {newStatus}",
            BeforeJson = before,
            AfterJson = SerializeSnapshot(entity)
        }, ct);

        await _unitOfWork.SaveChangesAsync(ct);

        var updated = await _repository.GetByIdWithDetailsAsync(entity.Id, ct);
        return Result<PolicyRuleDetailDto>.Success(MapDetail(updated!));
    }

    private static string? ValidateRequest(UpsertPolicyRuleRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            return "Vui lòng nhập tên chính sách.";
        if (!Enum.TryParse<PolicyRuleType>(request.PolicyType, true, out _))
            return "Loại chính sách không hợp lệ.";
        if (!Enum.TryParse<PolicyRuleStatus>(request.Status, true, out _))
            return "Trạng thái không hợp lệ.";
        if (request.EffectiveFrom.HasValue && request.EffectiveTo.HasValue
            && request.EffectiveTo < request.EffectiveFrom)
            return "Ngày kết thúc phải sau ngày bắt đầu.";
        return null;
    }

    private static void ApplyChildren(PolicyRule entity, UpsertPolicyRuleRequest request)
    {
        foreach (var p in request.Parameters.Where(x => !string.IsNullOrWhiteSpace(x.Key)))
        {
            entity.Parameters.Add(new PolicyRuleParameter
            {
                ParamKey = p.Key.Trim(),
                ParamValue = p.Value?.Trim() ?? string.Empty,
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
