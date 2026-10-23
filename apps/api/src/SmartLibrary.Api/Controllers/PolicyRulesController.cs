using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/policy-rules")]
[Authorize(Policy = "AdminOnly")]
public class PolicyRulesController : ControllerBase
{
    private readonly PolicyRuleService _policyRuleService;

    public PolicyRulesController(PolicyRuleService policyRuleService)
    {
        _policyRuleService = policyRuleService;
    }

    [HttpGet]
    public async Task<IActionResult> GetList(
        [FromQuery] string? search,
        [FromQuery] string? type,
        [FromQuery] string? status,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var result = await _policyRuleService.GetPagedAsync(
            search, type, status, page, pageSize, PolicyRuleKinds.PolicyTypes, ct);
        return Ok(ApiResponse<PolicyRuleListResultDto>.Ok(result));
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> GetByKey(string key, CancellationToken ct = default)
    {
        var result = await _policyRuleService.GetByKeyAsync(key, ct);
        if (!result.IsSuccess || !PolicyRuleKinds.IsPolicy(result.Data!.PolicyType))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy chính sách."));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        if (!TryEnsurePolicyType(request.PolicyType, out var typeError))
            return BadRequest(ApiResponse<object>.Fail(typeError));

        var result = await _policyRuleService.CreateAsync(request, actorId, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Tạo chính sách thành công." }));
    }

    [HttpPut("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var existing = await _policyRuleService.GetByKeyAsync(key, ct);
        if (!existing.IsSuccess || !PolicyRuleKinds.IsPolicy(existing.Data!.PolicyType))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy chính sách."));
        if (!TryEnsurePolicyType(request.PolicyType, out var typeError))
            return BadRequest(ApiResponse<object>.Fail(typeError));

        var result = await _policyRuleService.UpdateAsync(key, request, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Cập nhật chính sách thành công." }));
    }

    [HttpPut("{key}/status")]
    public async Task<IActionResult> UpdateStatus(
        string key,
        [FromBody] UpdatePolicyStatusRequest request,
        CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var existing = await _policyRuleService.GetByKeyAsync(key, ct);
        if (!existing.IsSuccess || !PolicyRuleKinds.IsPolicy(existing.Data!.PolicyType))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy chính sách."));

        var result = await _policyRuleService.UpdateStatusAsync(key, request, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Cập nhật trạng thái thành công." }));
    }

    [HttpDelete("{key}")]
    public async Task<IActionResult> Delete(string key, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var existing = await _policyRuleService.GetByKeyAsync(key, ct);
        if (!existing.IsSuccess || !PolicyRuleKinds.IsPolicy(existing.Data!.PolicyType))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy chính sách."));

        var result = await _policyRuleService.DeleteAsync(key, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<bool>.Ok(true, new { message = "Đã xóa chính sách." }));
    }

    private static bool TryEnsurePolicyType(string? policyType, out string error)
    {
        error = "Loại chính sách không hợp lệ.";
        if (string.IsNullOrWhiteSpace(policyType)
            || !Enum.TryParse<PolicyRuleType>(policyType, true, out var parsed)
            || !PolicyRuleKinds.IsPolicy(parsed))
            return false;
        error = string.Empty;
        return true;
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
