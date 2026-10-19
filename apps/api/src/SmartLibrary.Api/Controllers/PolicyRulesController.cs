using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Policies.DTOs;

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
        var result = await _policyRuleService.GetPagedAsync(search, type, status, page, pageSize, ct);
        return Ok(ApiResponse<PolicyRuleListResultDto>.Ok(result));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var result = await _policyRuleService.GetByIdAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _policyRuleService.CreateAsync(request, actorId, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Tạo chính sách thành công." }));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _policyRuleService.UpdateAsync(id, request, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Cập nhật chính sách thành công." }));
    }

    [HttpPut("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(
        Guid id,
        [FromBody] UpdatePolicyStatusRequest request,
        CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _policyRuleService.UpdateStatusAsync(id, request, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Cập nhật trạng thái thành công." }));
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
