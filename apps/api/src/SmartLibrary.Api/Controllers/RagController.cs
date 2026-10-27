using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/rag")]
[Authorize(Policy = "ReaderOnly")]
public class RagController : ControllerBase
{
    private readonly RagService _rag;
    private readonly AiInsightsService _insights;
    private readonly AiSettingsService _settings;

    public RagController(RagService rag, AiInsightsService insights, AiSettingsService settings)
    {
        _rag = rag;
        _insights = insights;
        _settings = settings;
    }

    [HttpPost("ask")]
    public async Task<IActionResult> Ask([FromBody] RagAskRequest request, CancellationToken ct)
    {
        TryGetCurrentUserId(out var userId);
        var result = await _rag.AskAsync(request.Question, CurrentRole(), userId, request.ConversationContext, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<RagAskResultDto>.Ok(result.Data!));
    }

    [HttpGet("suggested-questions")]
    public async Task<IActionResult> SuggestedQuestions(CancellationToken ct)
    {
        var questions = await _settings.GetReaderSuggestedQuestionsAsync(ct);
        return Ok(ApiResponse<IReadOnlyList<string>>.Ok(questions));
    }

    [HttpPut("suggested-questions")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> SaveSuggestedQuestions([FromBody] List<string> questions, CancellationToken ct)
    {
        var result = await _settings.SaveReaderSuggestedQuestionsAsync(questions, CurrentRole(), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<IReadOnlyList<string>>.Ok(result.Data!, new { message = "Đã lưu câu hỏi gợi ý." }));
    }

    [HttpGet("recommendations")]
    public async Task<IActionResult> Recommendations(CancellationToken ct)
    {
        var userIdValue = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(userIdValue, out var userId) || userId == Guid.Empty)
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản."));

        var result = await _insights.GetRecommendationsAsync(userId, CurrentRole(), ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<IReadOnlyList<AiBookSuggestionDto>>.Ok(result.Data!));
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
