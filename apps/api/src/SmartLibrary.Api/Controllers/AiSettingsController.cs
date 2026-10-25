using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/ai")]
[Authorize(Policy = "LibrarianOnly")]
public class AiSettingsController : ControllerBase
{
    private readonly AiSettingsService _settings;
    private readonly RagService _rag;
    private readonly IRagReindexJobQueue _reindexJobs;
    private readonly AiInsightsService _insights;

    public AiSettingsController(
        AiSettingsService settings,
        RagService rag,
        IRagReindexJobQueue reindexJobs,
        AiInsightsService insights)
    {
        _settings = settings;
        _rag = rag;
        _reindexJobs = reindexJobs;
        _insights = insights;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings(CancellationToken ct)
    {
        TryGetCurrentUserId(out var actorId);
        var status = await _settings.GetStatusAsync(CurrentRole(), actorId, ct);
        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(status));
    }

    [HttpPut("settings")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SaveSettings([FromBody] SaveAiSettingsRequest request, CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _settings.SaveAdminAsync(request, CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
        {
            var status = result.Error!.Contains("Chỉ Admin", StringComparison.OrdinalIgnoreCase) ? 403 : 400;
            return StatusCode(status, ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(result.Data!, new { message = "Đã lưu cấu hình AI." }));
    }

    [HttpPatch("librarian-settings")]
    public async Task<IActionResult> SaveLibrarianSettings(
        [FromBody] SaveLibrarianAiSettingsRequest request,
        CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _settings.SaveLibrarianAsync(request, CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
            return StatusCode(403, ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(result.Data!, new { message = "Đã cập nhật cấu hình AI thủ thư." }));
    }

    [HttpPut("my-settings")]
    public async Task<IActionResult> SaveMySettings([FromBody] SaveAiSettingsRequest request, CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _settings.SaveMyProviderAsync(request, CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
        {
            var status = result.Error!.Contains("Chỉ Thủ thư", StringComparison.OrdinalIgnoreCase) ? 403 : 400;
            return StatusCode(status, ApiResponse<object>.Fail(result.Error));
        }

        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(result.Data!, new { message = "Đã lưu cấu hình AI." }));
    }

    [HttpPost("my-settings/use-for-library")]
    public async Task<IActionResult> UseMySettingsForLibrary(CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _settings.UseMyConfigForLibraryAsync(CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(result.Data!, new { message = "Đã dùng cấu hình này cho độc giả." }));
    }

    [HttpPatch("librarians/{userId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SetLibrarianAccount(
        Guid userId,
        [FromBody] SetLibrarianAccountRequest request,
        CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _settings.SetLibrarianAccountEnabledAsync(
            userId, request.IsEnabled, CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
            return StatusCode(403, ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiSettingsStatusDto>.Ok(result.Data!));
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection(
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] TestAiConnectionRequest? request,
        CancellationToken ct)
    {
        TryGetCurrentUserId(out var actorId);
        var result = await _settings.TestConnectionAsync(CurrentRole(), actorId, request?.Provider, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiConnectionTestDto>.Ok(result.Data!));
    }

    [HttpPost("reindex")]
    public async Task<IActionResult> Reindex(CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var access = await _rag.CanReindexAsync(CurrentRole(), actorId, ct);
        if (!access.IsSuccess)
        {
            return StatusCode(403, ApiResponse<object>.Fail(access.Error!));
        }

        var result = await _reindexJobs.StartAsync(CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
            return Conflict(ApiResponse<object>.Fail(result.Error!));

        return Accepted(ApiResponse<RagReindexJobDto>.Ok(result.Data!, new { message = "Đã bắt đầu đồng bộ dữ liệu RAG." }));
    }

    [HttpGet("reindex/{jobId:guid}")]
    public async Task<IActionResult> ReindexStatus(Guid jobId, CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var actorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _reindexJobs.GetAsync(jobId, actorId, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<RagReindexJobDto>.Ok(result.Data!));
    }

    [HttpPost("acquisition-suggestions")]
    public async Task<IActionResult> AcquisitionSuggestions(CancellationToken ct)
    {
        TryGetCurrentUserId(out var actorId);
        var result = await _rag.SuggestAcquisitionsAsync(CurrentRole(), actorId, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<RagAskResultDto>.Ok(result.Data!));
    }

    [HttpGet("librarian-workspace")]
    public async Task<IActionResult> LibrarianWorkspace(CancellationToken ct, [FromQuery] int days = 30)
    {
        var result = await _insights.GetLibrarianWorkspaceAsync(CurrentRole(), days, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiLibrarianWorkspaceDto>.Ok(result.Data!));
    }

    [HttpGet("recommendations")]
    public async Task<IActionResult> Recommendations(CancellationToken ct)
    {
        if (!TryGetCurrentUserId(out var userId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _insights.GetRecommendationsAsync(userId, CurrentRole(), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<IReadOnlyList<AiBookSuggestionDto>>.Ok(result.Data!));
    }

    [HttpGet("reading-trends")]
    public async Task<IActionResult> ReadingTrends(CancellationToken ct)
    {
        var result = await _insights.GetReadingTrendsAsync(CurrentRole(), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiReadingTrendsDto>.Ok(result.Data!));
    }

    [HttpGet("overdue-risks")]
    public async Task<IActionResult> OverdueRisks(CancellationToken ct)
    {
        var result = await _insights.GetOverdueRisksAsync(CurrentRole(), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<AiOverdueRiskDto>.Ok(result.Data!));
    }

    private string CurrentRole()
        => User.FindFirst(ClaimTypes.Role)?.Value
           ?? User.FindFirst("role")?.Value
           ?? string.Empty;

    private bool TryGetCurrentUserId(out Guid userId)
    {
        var value = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? User.FindFirst("sub")?.Value;
        return Guid.TryParse(value, out userId) && userId != Guid.Empty;
    }
}
