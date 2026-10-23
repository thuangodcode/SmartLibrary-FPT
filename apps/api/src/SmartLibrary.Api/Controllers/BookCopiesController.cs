using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using SmartLibrary.Application.Common;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/copies")]
[Authorize(Policy = "LibrarianOnly")]
public class BookCopiesController : ControllerBase
{
    private readonly AppDbContext _db;

    public BookCopiesController(AppDbContext db) => _db = db;

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken ct = default)
    {
        var copies = _db.BookCopies.AsNoTracking().Where(copy => !copy.IsDeleted);
        var summary = new
        {
            totalCopies = await copies.CountAsync(ct),
            availableCopies = await copies.CountAsync(copy => copy.IsAvailable, ct),
            unavailableCopies = await copies.CountAsync(copy => !copy.IsAvailable, ct),
            locations = await copies
                .Where(copy => copy.Location != null && copy.Location != "")
                .Select(copy => copy.Location!)
                .Distinct()
                .CountAsync(ct)
        };
        return Ok(ApiResponse<object>.Ok(summary));
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] string? location = null,
        [FromQuery] Guid? bookId = null,
        CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 500);

        var query = _db.BookCopies
            .AsNoTracking()
            .Where(copy => !copy.IsDeleted)
            .Include(copy => copy.Book)
                .ThenInclude(book => book.Authors)
            .Include(copy => copy.Book)
                .ThenInclude(book => book.Categories)
            .Where(copy => !copy.Book.IsDeleted);

        if (bookId.HasValue)
        {
            query = query.Where(copy => copy.BookId == bookId.Value);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(copy =>
                copy.Barcode.ToLower().Contains(term) ||
                copy.Book.Title.ToLower().Contains(term) ||
                (copy.Book.Isbn != null && copy.Book.Isbn.ToLower().Contains(term)) ||
                (copy.Location != null && copy.Location.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(location))
        {
            var selectedLocation = location.Trim().ToLower();
            query = query.Where(copy => copy.Location != null && copy.Location.ToLower() == selectedLocation);
        }

        var totalCount = await query.CountAsync(ct);
        var copies = await query
            .OrderBy(copy => copy.Book.Title)
            .ThenBy(copy => copy.Barcode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(copy => new
            {
                copy.Id,
                copy.BookId,
                BookTitle = copy.Book.Title,
                copy.Barcode,
                Condition = copy.Condition.ToString(),
                copy.Location,
                copy.IsAvailable,
                Categories = copy.Book.Categories.Where(category => !category.IsDeleted).Select(category => category.Name),
                Authors = copy.Book.Authors.Where(author => !author.IsDeleted).Select(author => author.Name),
                copy.CreatedAt
            })
            .ToListAsync(ct);

        var copyIds = copies.Select(copy => copy.Id).ToArray();
        var statusesByCopy = await GetBorrowStatusesByCopyAsync(copyIds, ct);

        var responseCopies = copies.Select(copy =>
        {
            var statuses = statusesByCopy.GetValueOrDefault(copy.Id) ?? [];
            return new
            {
                copy.Id,
                copy.BookId,
                copy.BookTitle,
                copy.Barcode,
                copy.Condition,
                copy.Location,
                copy.IsAvailable,
                HasOverdueLoan = statuses.Contains("overdue", StringComparer.OrdinalIgnoreCase),
                HasActiveLoan = statuses.Contains("borrowed", StringComparer.OrdinalIgnoreCase) ||
                                statuses.Contains("overdue", StringComparer.OrdinalIgnoreCase),
                HasApprovedLoan = statuses.Contains("approved", StringComparer.OrdinalIgnoreCase),
                copy.Categories,
                copy.Authors,
                copy.CreatedAt
            };
        }).ToList();

        return Ok(ApiResponse<object>.Ok(responseCopies, new
        {
            totalCount,
            page,
            pageSize,
            totalPages = (int)Math.Ceiling(totalCount / (double)pageSize)
        }));
    }

    [HttpGet("locations")]
    public async Task<IActionResult> GetLocations(CancellationToken ct = default)
    {
        var locations = await _db.BookCopies
            .AsNoTracking()
            .Where(copy => !copy.IsDeleted && copy.Location != null && copy.Location != "")
            .GroupBy(copy => copy.Location!)
            .Select(group => new { name = group.Key, copyCount = group.Count() })
            .OrderBy(item => item.name)
            .ToListAsync(ct);

        return Ok(ApiResponse<object>.Ok(locations));
    }

    [HttpPost("intake")]
    public async Task<IActionResult> Intake([FromBody] IntakeBookCopiesRequest request, CancellationToken ct = default)
    {
        if (request.Quantity is < 1 or > 500)
            return BadRequest(ApiResponse<object>.Fail("Số lượng bản sao phải từ 1 đến 500."));
        if (request.Location?.Trim().Length > 255)
            return BadRequest(ApiResponse<object>.Fail("Vị trí lưu trữ không được vượt quá 255 ký tự."));
        if (!Enum.IsDefined(request.Condition))
            return BadRequest(ApiResponse<object>.Fail("Tình trạng sách không hợp lệ."));

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var lockedBooks = await _db.Books
            .FromSqlInterpolated($"SELECT * FROM books WHERE id = {request.BookId} AND is_deleted = FALSE FOR UPDATE")
            .ToListAsync(ct);
        var book = lockedBooks.FirstOrDefault();
        if (book is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy đầu sách cần nhập."));

        var location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        var existingBarcodes = await _db.BookCopies
            .Where(copy => copy.BookId == book.Id)
            .Select(copy => copy.Barcode)
            .ToListAsync(ct);
        var nextCopyNumber = existingBarcodes
            .Select(barcode =>
            {
                var prefix = $"{book.Code}-";
                return barcode.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) &&
                       int.TryParse(barcode[prefix.Length..], out var number)
                    ? number
                    : 0;
            })
            .DefaultIfEmpty(0)
            .Max() + 1;
        var copies = Enumerable.Range(0, request.Quantity)
            .Select(index => new BookCopy
            {
                Id = Guid.NewGuid(),
                BookId = book.Id,
                Barcode = $"{book.Code}-{nextCopyNumber + index:D2}",
                Condition = request.Condition,
                Location = location,
                IsAvailable = request.Condition is not (BookCondition.Damaged or BookCondition.Lost),
                IsDeleted = false
            })
            .ToList();

        _db.BookCopies.AddRange(copies);
        book.TotalCopies += copies.Count;
        book.AvailableCopies += copies.Count(copy => copy.IsAvailable);
        book.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);

        return Ok(ApiResponse<object>.Ok(new
        {
            bookId = book.Id,
            bookTitle = book.Title,
            addedCopies = copies.Count,
            totalCopies = book.TotalCopies,
            availableCopies = book.AvailableCopies
        }));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBookCopyRequest request, CancellationToken ct = default)
    {
        if (request.Location?.Trim().Length > 255)
            return BadRequest(ApiResponse<object>.Fail("Vị trí lưu trữ không được vượt quá 255 ký tự."));
        if (!Enum.IsDefined(request.Condition))
            return BadRequest(ApiResponse<object>.Fail("Tình trạng sách không hợp lệ."));

        var copy = await _db.BookCopies
            .Include(item => item.Book)
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted && !item.Book.IsDeleted, ct);
        if (copy is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bản sao sách."));

        var wasAvailable = copy.IsAvailable;
        copy.Location = string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        copy.Condition = request.Condition;
        var borrowStatuses = await GetBorrowStatusesByCopyAsync([copy.Id], ct);
        var hasActiveLoan = borrowStatuses.GetValueOrDefault(copy.Id)?.Any(status =>
            status.Equals("approved", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("borrowed", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("overdue", StringComparison.OrdinalIgnoreCase)) ?? false;
        copy.IsAvailable = request.Condition is not (BookCondition.Damaged or BookCondition.Lost) && !hasActiveLoan;

        if (wasAvailable != copy.IsAvailable)
        {
            copy.Book.AvailableCopies += copy.IsAvailable ? 1 : -1;
            copy.Book.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new
        {
            copy.Id,
            copy.BookId,
            copy.Barcode,
            Condition = copy.Condition.ToString(),
            copy.Location,
            copy.IsAvailable
        }));
    }

    private async Task<Dictionary<Guid, string[]>> GetBorrowStatusesByCopyAsync(
        Guid[] copyIds,
        CancellationToken ct)
    {
        if (copyIds.Length == 0)
        {
            return [];
        }

        var connection = _db.Database.GetDbConnection();
        var openedHere = connection.State != System.Data.ConnectionState.Open;
        if (openedHere)
        {
            await _db.Database.OpenConnectionAsync(ct);
        }

        try
        {
            await using var command = new NpgsqlCommand(
                """
                SELECT book_copy_id, status::text
                FROM borrow_records
                WHERE book_copy_id = ANY (@copy_ids)
                  AND is_deleted = FALSE
                """,
                (NpgsqlConnection)connection);
            command.Parameters.AddWithValue(
                "copy_ids",
                NpgsqlDbType.Array | NpgsqlDbType.Uuid,
                copyIds);

            var statuses = new Dictionary<Guid, List<string>>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var copyId = reader.GetGuid(0);
                if (!statuses.TryGetValue(copyId, out var copyStatuses))
                {
                    copyStatuses = [];
                    statuses.Add(copyId, copyStatuses);
                }
                copyStatuses.Add(reader.GetString(1));
            }

            return statuses.ToDictionary(pair => pair.Key, pair => pair.Value.ToArray());
        }
        finally
        {
            if (openedHere)
            {
                await _db.Database.CloseConnectionAsync();
            }
        }
    }
}

public sealed record IntakeBookCopiesRequest(Guid BookId, int Quantity, string? Location, BookCondition Condition);

public sealed record UpdateBookCopyRequest(string? Location, BookCondition Condition);
