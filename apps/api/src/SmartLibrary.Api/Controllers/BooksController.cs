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
        [FromQuery] bool sortByReviewCount = false,
        [FromQuery] bool reviewCountAscending = false,
        CancellationToken ct = default)
    {
        var result = await _bookService.GetPagedAsync(page, pageSize, search, categoryId, sortByReviewCount, reviewCountAscending, ct);
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

    [HttpGet("deleted")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> GetDeleted(CancellationToken ct = default)
    {
        var books = await _db.Books.IgnoreQueryFilters().AsNoTracking()
            .Where(book => book.IsDeleted)
            .OrderByDescending(book => book.UpdatedAt)
            .Select(book => new { book.Id, book.Code, book.Title, book.CoverImageUrl, book.TotalCopies, book.UpdatedAt })
            .ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(books));
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
    [Authorize(Policy = "LibrarianOnly")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> CreateFromForm([FromForm] CreateBookForm form, CancellationToken ct = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        if (!string.IsNullOrWhiteSpace(form.Location))
        {
            var location = form.Location.Trim();
            var shelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE name = {location} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
            if (shelf is null) return BadRequest(ApiResponse<object>.Fail("Kệ đã chọn không tồn tại hoặc đã ngừng sử dụng."));
            var occupied = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == location, ct);
            if (form.TotalCopies < 1 || occupied + form.TotalCopies > shelf.Capacity)
                return Conflict(ApiResponse<object>.Fail($"Kệ {shelf.Name} còn {Math.Max(0, shelf.Capacity - occupied)} chỗ, không đủ nhận {form.TotalCopies} bản sao."));
        }
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

        await transaction.CommitAsync(ct);

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
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var currentBook = await _db.Books.FromSqlInterpolated($"SELECT * FROM books WHERE id = {id} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
        if (currentBook is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy đầu sách."));

        var currentCopies = await _db.BookCopies
            .FromSqlInterpolated($"SELECT * FROM book_copies WHERE book_id = {id} AND is_deleted = FALSE FOR UPDATE")
            .ToListAsync(ct);
        var currentTotal = currentCopies.Count;
        var newTotal = form.TotalCopies ?? currentTotal;
        var targetLocation = form.Location is null
            ? (newTotal > currentTotal ? currentCopies.Select(copy => copy.Location).FirstOrDefault(location => !string.IsNullOrWhiteSpace(location)) : null)
            : string.IsNullOrWhiteSpace(form.Location) ? null : form.Location.Trim();
        var shelf = string.IsNullOrWhiteSpace(targetLocation)
            ? null
            : await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE name = {targetLocation} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
        if (!string.IsNullOrWhiteSpace(targetLocation) && shelf is null)
            return BadRequest(ApiResponse<object>.Fail("Kệ đã chọn không tồn tại hoặc đã ngừng sử dụng."));

        if (shelf is not null)
        {
            var occupied = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == targetLocation, ct);
            var targetCopiesAfterSave = form.Location is null
                ? occupied + Math.Max(0, newTotal - currentTotal)
                : occupied - currentCopies.Count(copy => copy.Location == targetLocation) + newTotal;
            if (targetCopiesAfterSave > shelf.Capacity)
                return Conflict(ApiResponse<object>.Fail($"Kệ {shelf.Name} sẽ có {targetCopiesAfterSave}/{shelf.Capacity} bản sao sau khi lưu."));
        }

        var result = await _bookService.UpdateFromFormAsync(id, form, ct);
        if (!result.IsSuccess)
            return BadRequest(ApiResponse<object>.Fail(result.Error!));

        await transaction.CommitAsync(ct);
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

    [HttpPost("{id:guid}/restore")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Restore(Guid id, CancellationToken ct = default)
    {
        var result = await _bookService.RestoreAsync(id, ct);
        if (!result.IsSuccess) return NotFound(ApiResponse<object>.Fail(result.Error!));
        return Ok(ApiResponse<bool>.Ok(true));
    }

    private static bool IsBookCodeConflict(DbUpdateException exception)
        => exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "ix_books_code" or "ux_books_code_case_insensitive"
        };
}
