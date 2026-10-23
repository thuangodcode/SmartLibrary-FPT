using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Features.Circulation;

namespace SmartLibrary.Api.Controllers;

/// <summary>Public book reviews with reader-owned review management.</summary>
[ApiController]
[Route("api/v1/books/{bookId:guid}/reviews")]
public sealed class BookReviewsController(IBookReviewService reviews) : ControllerBase
{
    /// <summary>List active reviews for a book.</summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> Get(Guid bookId, CancellationToken ct)
    {
        var result = await reviews.GetAsync(bookId, CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? Ok(ApiResponse<IReadOnlyList<BookReviewDto>>.Ok(result.Data!))
            : NotFound(ApiResponse<object>.Fail(result.Error!));
    }

    /// <summary>Create the signed-in reader's rating and review for a book.</summary>
    [HttpPost]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> Create(
        Guid bookId, [FromBody] SaveBookReviewRequest request, CancellationToken ct)
    {
        var result = await reviews.CreateAsync(
            bookId, CirculationService.ReadUserId(User), request, ct);
        if (!result.IsSuccess)
        {
            var status = result.Error?.Contains("đã đánh giá", StringComparison.OrdinalIgnoreCase) == true
                ? StatusCodes.Status409Conflict
                : StatusCodes.Status400BadRequest;
            return StatusCode(status, ApiResponse<object>.Fail(result.Error!));
        }

        return CreatedAtAction(nameof(Get), new { bookId },
            ApiResponse<BookReviewDto>.Ok(result.Data!));
    }

    /// <summary>Update the signed-in reader's own review.</summary>
    [HttpPut("{reviewId:guid}")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> Update(
        Guid bookId, Guid reviewId, [FromBody] SaveBookReviewRequest request, CancellationToken ct)
    {
        var result = await reviews.UpdateAsync(
            bookId, reviewId, CirculationService.ReadUserId(User), request, ct);
        if (!result.IsSuccess)
        {
            var isMissing = result.Error?.Contains("Không tìm thấy", StringComparison.OrdinalIgnoreCase) == true;
            return isMissing
                ? NotFound(ApiResponse<object>.Fail(result.Error!))
                : BadRequest(ApiResponse<object>.Fail(result.Error!));
        }

        return Ok(ApiResponse<BookReviewDto>.Ok(result.Data!));
    }

    /// <summary>Soft-delete the signed-in reader's own review.</summary>
    [HttpDelete("{reviewId:guid}")]
    [Authorize(Roles = "Reader")]
    public async Task<IActionResult> Delete(Guid bookId, Guid reviewId, CancellationToken ct)
    {
        var result = await reviews.DeleteAsync(
        bookId, reviewId, CirculationService.ReadUserId(User), ct);
        return result.IsSuccess
            ? NoContent()
            : NotFound(ApiResponse<object>.Fail(result.Error!));
    }
}
