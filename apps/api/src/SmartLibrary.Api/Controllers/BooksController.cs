using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Books.DTOs;

namespace SmartLibrary.Api.Controllers;

/// <summary>
/// Books CRUD controller – vertical slice example.
/// </summary>
[ApiController]
[Route("api/v1/[controller]")]
public class BooksController : ControllerBase
{
    private readonly BookService _bookService;

    public BooksController(BookService bookService)
    {
        _bookService = bookService;
    }

    /// <summary>
    /// Get paginated list of books with optional search.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var result = await _bookService.GetPagedAsync(page, pageSize, search, ct);
        return Ok(ApiResponse<object>.Ok(result.Items, new
        {
            result.TotalCount,
            result.Page,
            result.PageSize,
            result.TotalPages,
            result.HasPrevious,
            result.HasNext
        }));
    }

    /// <summary>
    /// Get a book by its ID.
    /// </summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var result = await _bookService.GetByIdAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<BookDto>.Ok(result.Data!));
    }

    /// <summary>
    /// Create a new book (Librarian/Admin only).
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Create([FromBody] CreateBookRequest request, CancellationToken ct = default)
    {
        var result = await _bookService.CreateAsync(request, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id },
            ApiResponse<BookDto>.Ok(result.Data));
    }

    /// <summary>
    /// Update a book (Librarian/Admin only).
    /// </summary>
    [HttpPut("{id:guid}")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBookRequest request, CancellationToken ct = default)
    {
        var result = await _bookService.UpdateAsync(id, request, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<BookDto>.Ok(result.Data!));
    }

    /// <summary>
    /// Soft delete a book (Admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var result = await _bookService.DeleteAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
