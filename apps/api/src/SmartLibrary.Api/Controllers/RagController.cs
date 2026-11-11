using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/rag")]
[Authorize(Policy = "ReaderOnly")]
public class RagController : ControllerBase
{
    private readonly RagService _rag;
    private readonly AiInsightsService _insights;
    private readonly AiSettingsService _settings;
    private readonly PolicyRuleService _policyRules;

    public RagController(RagService rag, AiInsightsService insights, AiSettingsService settings, PolicyRuleService policyRules)
    {
        _rag = rag;
        _insights = insights;
        _settings = settings;
        _policyRules = policyRules;
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

    [HttpGet("reader-policies")]
    public async Task<IActionResult> ReaderPolicies(CancellationToken ct)
    {
        var policies = await _policyRules.GetPagedAsync(
            search: null,
            type: null,
            status: "Active",
            page: 1,
            pageSize: 50,
            allowedTypes: PolicyRuleKinds.PolicyTypes,
            ct: ct);
        var regulations = await _policyRules.GetPagedAsync(
            search: null,
            type: null,
            status: "Active",
            page: 1,
            pageSize: 50,
            allowedTypes: PolicyRuleKinds.RegulationTypes,
            ct: ct);
        var libraryKnowledge = policies.Items.Concat(regulations.Items).Select(policy => new
        {
            policy.Code,
            policy.Name,
            policy.Description,
            PolicyType = policy.PolicyType.ToString(),
            policy.Parameters
        }).ToArray();
        return Ok(ApiResponse<object>.Ok(libraryKnowledge));
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
