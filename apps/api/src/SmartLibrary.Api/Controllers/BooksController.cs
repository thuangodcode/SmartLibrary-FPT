using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Features.Circulation;

namespace SmartLibrary.Api.Controllers;

/// <summary>
/// Books CRUD controller – vertical slice example.
/// </summary>
[ApiController]
[Route("api/v1/[controller]")]
public class BooksController : ControllerBase
{
    private readonly BookService _bookService;
    private readonly CirculationService _circulation;
    private readonly SmartLibrary.Infrastructure.Persistence.AppDbContext _db;

    public BooksController(BookService bookService, CirculationService circulation, SmartLibrary.Infrastructure.Persistence.AppDbContext db)
    {
        _bookService = bookService;
        _circulation = circulation;
        _db = db;
    }

    [HttpGet("field-config")]
    public async Task<IActionResult> GetFieldConfig(CancellationToken ct)
    {
        var config = await _db.BookFieldConfigurations.AsNoTracking().OrderByDescending(item => item.UpdatedAt).FirstOrDefaultAsync(ct);
        return Ok(ApiResponse<object>.Ok(config is null ? new { fields = (object?)null } : new { fields = System.Text.Json.JsonSerializer.Deserialize<object>(config.FieldsJson) }));
    }

    [HttpPut("field-config")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> UpdateFieldConfig([FromBody] System.Text.Json.JsonElement body, CancellationToken ct)
    {
        if (!body.TryGetProperty("fields", out var fields) || fields.ValueKind != System.Text.Json.JsonValueKind.Array)
            return BadRequest(ApiResponse<object>.Fail("Danh sách trường thông tin không hợp lệ."));
        var json = fields.GetRawText();
        var config = await _db.BookFieldConfigurations.FirstOrDefaultAsync(ct);
        if (config is null)
            _db.BookFieldConfigurations.Add(new SmartLibrary.Domain.Entities.BookFieldConfiguration { FieldsJson = json, UpdatedAt = DateTime.UtcNow });
        else
        {
            config.FieldsJson = json;
            config.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { fields }));
    }

    /// <summary>
    /// Get paginated list of books with optional search.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] string? search = null,
        [FromQuery] Guid? categoryId = null,
        CancellationToken ct = default)
    {
        var result = await _bookService.GetPagedAsync(page, pageSize, search, categoryId, ct);
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

    [HttpGet("highlights")]
    public async Task<IActionResult> GetHighlights(CancellationToken ct = default)
    {
        var books = await _db.Books.AsNoTracking()
            .Where(book => !book.IsDeleted)
            .Select(book => new
            {
                book.Id,
                book.Code,
                book.Title,
                book.Isbn,
                book.Description,
                book.CoverImageUrl,
                book.PublishedYear,
                book.Language,
                book.TotalCopies,
                book.AvailableCopies,
                book.AverageRating,
                AuthorNames = book.Authors.OrderBy(author => author.Name).Select(author => author.Name).ToList(),
                CategoryNames = book.Categories.OrderBy(category => category.Name).Select(category => category.Name).ToList(),
                ReviewCount = _db.Reviews.Count(review => review.BookId == book.Id && !review.IsDeleted),
                BorrowCount = _db.BorrowRecords.Count(record => record.BookCopy.BookId == book.Id
                    && !record.IsDeleted
                    && (record.Status == SmartLibrary.Domain.Enums.BorrowStatus.Borrowed
                        || record.Status == SmartLibrary.Domain.Enums.BorrowStatus.Returned
                        || record.Status == SmartLibrary.Domain.Enums.BorrowStatus.Overdue))
            })
            .ToListAsync(ct);

        var topRated = books.Where(book => book.ReviewCount > 0)
            .OrderByDescending(book => book.AverageRating)
            .ThenByDescending(book => book.ReviewCount)
            .ThenByDescending(book => book.BorrowCount)
            .Take(8).Select(book => new
            {
                book.Id, book.Code, book.Title, book.Isbn, book.Description,
                CustomFields = new Dictionary<string, string>(), book.CoverImageUrl,
                book.PublishedYear, book.Language, book.TotalCopies, book.AvailableCopies,
                book.AverageRating, book.AuthorNames, book.CategoryNames, book.ReviewCount, book.BorrowCount
            }).ToList();
        var mostBorrowed = books.Where(book => book.BorrowCount > 0)
            .OrderByDescending(book => book.BorrowCount)
            .ThenByDescending(book => book.AverageRating)
            .ThenByDescending(book => book.ReviewCount)
            .Take(8).Select(book => new
            {
                book.Id, book.Code, book.Title, book.Isbn, book.Description,
                CustomFields = new Dictionary<string, string>(), book.CoverImageUrl,
                book.PublishedYear, book.Language, book.TotalCopies, book.AvailableCopies,
                book.AverageRating, book.AuthorNames, book.CategoryNames, book.ReviewCount, book.BorrowCount
            }).ToList();

        return Ok(ApiResponse<object>.Ok(new { topRated, mostBorrowed }));
    }

    [HttpGet("code-availability")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> CheckCodeAvailability([FromQuery] string? code, CancellationToken ct = default)
    {
        var available = await _bookService.IsBookCodeAvailableAsync(code, ct);
        var message = available
            ? "Mã sách có thể sử dụng."
            : "Mã sách không hợp lệ hoặc đã được sử dụng.";
        return Ok(ApiResponse<object>.Ok(new { available, message }));
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
    /// Get current copy availability for a book, excluding unavailable or actively loaned copies.
    /// </summary>
    [HttpGet("{id:guid}/availability")]
    public async Task<IActionResult> GetAvailability(Guid id, CancellationToken ct = default)
    {
        var result = await _bookService.GetAvailabilityAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));
        var availableCopies = await _circulation.GetBorrowableCopyCountAsync(id, ct);
        return Ok(ApiResponse<BookAvailabilityDto>.Ok(
            new BookAvailabilityDto(result.Data!.TotalCopies, availableCopies, availableCopies > 0)));
    }

    /// <summary>
    /// Create a new book (Librarian/Admin only).
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Create([FromBody] CreateBookRequest request, CancellationToken ct = default)
    {
        Result<BookDto> result;
        try
        {
            result = await _bookService.CreateAsync(request, ct);
        }
        catch (DbUpdateException exception) when (IsBookCodeConflict(exception))
        {
            return Conflict(ApiResponse<object>.Fail("Mã sách đã được sử dụng. Vui lòng nhập mã khác."));
        }
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return CreatedAtAction(nameof(GetById), new { id = result.Data!.Id },
            ApiResponse<BookDto>.Ok(result.Data));
    }

    /// <summary>
    /// Create a new book from form with cover image upload to Cloudinary.
    /// </summary>
    [HttpPost("form")]
    [Authorize]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> CreateFromForm([FromForm] CreateBookForm form, CancellationToken ct = default)
    {
        Result<BookDto> result;
        try
        {
            result = await _bookService.CreateFromFormAsync(form, ct);
        }
        catch (DbUpdateException exception) when (IsBookCodeConflict(exception))
        {
            return Conflict(ApiResponse<object>.Fail("Mã sách đã được sử dụng. Vui lòng nhập mã khác."));
        }
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
    /// Update a book from form with optional cover image upload (Librarian/Admin only).
    /// </summary>
    [HttpPut("{id:guid}/form")]
    [Authorize(Policy = "LibrarianOnly")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UpdateFromForm(Guid id, [FromForm] UpdateBookForm form, CancellationToken ct = default)
    {
        var result = await _bookService.UpdateFromFormAsync(id, form, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<BookDto>.Ok(result.Data!));
    }

    /// <summary>
    /// Soft delete a book (Librarian/Admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var result = await _bookService.DeleteAsync(id, ct);
        if (!result.IsSuccess)
            return NotFound(ApiResponse<object>.Fail(result.Error!));

        return Ok(ApiResponse<bool>.Ok(true));
    }

    private static bool IsBookCodeConflict(DbUpdateException exception)
        => exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "ix_books_code" or "ux_books_code_case_insensitive"
        };
}
