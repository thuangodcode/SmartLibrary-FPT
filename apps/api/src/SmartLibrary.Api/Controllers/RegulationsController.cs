using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Policies.DTOs;
using SmartLibrary.Application.Features.Regulations;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/regulations")]
[Authorize(Policy = "AdminOnly")]
public class RegulationsController : ControllerBase
{
    private readonly RegulationService _regulations;

    public RegulationsController(RegulationService regulations)
    {
        _regulations = regulations;
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
        var result = await _regulations.GetPagedAsync(search, type, status, page, pageSize, ct);
        return Ok(ApiResponse<PolicyRuleListResultDto>.Ok(result));
    }

    [HttpGet("{key}")]
    public async Task<IActionResult> GetByKey(string key, CancellationToken ct = default)
    {
        var result = await _regulations.GetByKeyAsync(key, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _regulations.CreateAsync(request, actorId, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Tạo quy định thành công." }));
    }

    [HttpPut("{key}")]
    public async Task<IActionResult> Update(string key, [FromBody] UpsertPolicyRuleRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _regulations.UpdateAsync(key, request, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<PolicyRuleDetailDto>.Ok(result.Data!, new { message = "Cập nhật quy định thành công." }));
    }

    [HttpPut("{key}/status")]
    public async Task<IActionResult> UpdateStatus(string key, [FromBody] UpdatePolicyStatusRequest request, CancellationToken ct = default)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản Admin."));

        var result = await _regulations.UpdateStatusAsync(key, request, actorId, ct);
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

        var result = await _regulations.DeleteAsync(key, actorId, ct);
        if (!result.IsSuccess)
        {
            if (result.Error!.Contains("không tìm thấy", StringComparison.OrdinalIgnoreCase))
                return NotFound(ApiResponse<object>.Fail(result.Error));
            return BadRequest(ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<bool>.Ok(true, new { message = "Đã xóa quy định." }));
    }

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
