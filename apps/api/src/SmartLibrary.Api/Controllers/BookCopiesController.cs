using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NpgsqlTypes;
using System.Text.RegularExpressions;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
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
    private static bool IsValidShelfName(string? name) =>
        !string.IsNullOrWhiteSpace(name) && name.Trim().Length <= 100
        && Regex.IsMatch(name.Trim(), @"^Tầng [\p{L}\p{N}-]+ · Kệ [\p{L}\p{N}-]+$", RegexOptions.CultureInvariant);

    public BookCopiesController(AppDbContext db) => _db = db;

    // A scan identifies one physical copy, never a partial search result or an ISBN.
    [HttpGet("lookup")]
    public async Task<IActionResult> Lookup(
        [FromQuery] string? barcode,
        [FromServices] CirculationService circulation,
        CancellationToken ct = default)
    {
        var code = barcode?.Trim();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 100)
            return BadRequest(ApiResponse<object>.Fail("Nhập mã bản sao hợp lệ, tối đa 100 ký tự."));
        var normalizedCode = code.ToUpperInvariant();
        var copy = await _db.BookCopies.AsNoTracking()
            .Where(item => !item.IsDeleted && !item.Book.IsDeleted && item.Barcode.ToUpper() == normalizedCode)
            .Select(item => new
            {
                item.Id, item.BookId, item.Barcode, item.Condition, item.Location, item.IsAvailable,
                BookTitle = item.Book.Title, item.Book.CoverImageUrl
            }).SingleOrDefaultAsync(ct);
        if (copy is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy mã bản sao. Hãy quét QR của thư viện hoặc nhập mã bên dưới QR."));

        var openLoanId = await _db.BorrowRecords.AsNoTracking()
            .Where(loan => !loan.IsDeleted && loan.BookCopyId == copy.Id &&
                (loan.Status == BorrowStatus.Pending || loan.Status == BorrowStatus.Approved ||
                 loan.Status == BorrowStatus.Borrowed || loan.Status == BorrowStatus.Overdue))
            .OrderByDescending(loan => loan.CreatedAt)
            .Select(loan => (Guid?)loan.Id).FirstOrDefaultAsync(ct);
        CirculationLoanDto? openLoan = null;
        if (openLoanId.HasValue)
        {
            var result = await circulation.GetLoanAsync(openLoanId.Value, ct);
            if (!result.IsSuccess)
                return Conflict(ApiResponse<object>.Fail("Phiếu mượn vừa thay đổi. Hãy tra cứu lại bản sao."));
            openLoan = result.Data;
        }
        return Ok(ApiResponse<object>.Ok(new
        {
            copy.Id, copy.BookId, copy.Barcode, copy.BookTitle, copy.CoverImageUrl,
            Condition = copy.Condition.ToString(), copy.Location, copy.IsAvailable, OpenLoan = openLoan,
            CanReturn = CopyScanRules.CanReturn(openLoan?.Status),
            CanShelve = CopyScanRules.CanShelve(copy.IsAvailable, copy.Location, copy.Condition, openLoan is not null)
        }));
    }

    [HttpGet("{id:guid}/history")]
    public async Task<IActionResult> History(Guid id, [FromServices] CirculationService circulation, CancellationToken ct)
    {
        if (!await _db.BookCopies.AnyAsync(copy => copy.Id == id && !copy.IsDeleted, ct))
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bản sao."));
        return Ok(ApiResponse<CopyCirculationHistoryDto>.Ok(await circulation.GetCopyHistoryAsync(id, ct)));
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken ct = default)
    {
        var copies = _db.BookCopies.AsNoTracking().Where(copy => !copy.IsDeleted);
        var summary = new
        {
            totalCopies = await copies.CountAsync(ct),
            availableCopies = await copies.CountAsync(copy => copy.IsAvailable && copy.Location != null && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost, ct),
            warehouseCopies = await copies.CountAsync(copy => copy.IsAvailable && copy.Location == null && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost, ct),
            unavailableCopies = await copies.CountAsync(copy => !copy.IsAvailable || copy.Condition == BookCondition.Damaged || copy.Condition == BookCondition.Lost, ct),
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
            if (location.Equals("__warehouse__", StringComparison.OrdinalIgnoreCase))
                query = query.Where(copy => copy.Location == null && copy.IsAvailable
                    && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost);
            else
            {
                var selectedLocation = location.Trim().ToLower();
                query = query.Where(copy => copy.Location != null && copy.Location.ToLower() == selectedLocation);
            }
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
        var occupancy = await _db.BookCopies
            .AsNoTracking()
            .Where(copy => !copy.IsDeleted && copy.Location != null && copy.Location != "")
            .GroupBy(copy => copy.Location!)
            .Select(group => new { name = group.Key, copyCount = group.Count(), bookCount = group.Where(copy => !copy.Book.IsDeleted).Select(copy => copy.BookId).Distinct().Count() })
            .ToDictionaryAsync(item => item.name, item => new { item.copyCount, item.bookCount }, ct);
        var shelves = await _db.StorageShelves.AsNoTracking().Where(shelf => !shelf.IsDeleted)
            .OrderBy(shelf => shelf.Name).ToListAsync(ct);
        var locations = shelves.Select(shelf => new
        {
            id = shelf.Id,
            name = shelf.Name,
            copyCount = occupancy.GetValueOrDefault(shelf.Name)?.copyCount ?? 0,
            bookCount = occupancy.GetValueOrDefault(shelf.Name)?.bookCount ?? 0,
            capacity = shelf.Capacity,
            availableCapacity = Math.Max(0, shelf.Capacity - (occupancy.GetValueOrDefault(shelf.Name)?.copyCount ?? 0))
        }).ToList();

        return Ok(ApiResponse<object>.Ok(locations));
    }

    [HttpGet("restock-alerts")]
    public async Task<IActionResult> GetRestockAlerts(CancellationToken ct = default)
    {
        var rows = await _db.Books.AsNoTracking().Where(book => !book.IsDeleted)
            .Select(book => new
            {
                book.Id,
                book.Title,
                OnShelf = book.Copies.Count(copy => !copy.IsDeleted && copy.IsAvailable && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost && copy.Location != null),
                InWarehouse = book.Copies.Count(copy => !copy.IsDeleted && copy.IsAvailable && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost && copy.Location == null)
            })
            .Where(book => book.OnShelf == 0 && book.InWarehouse > 0)
            .OrderBy(book => book.Title)
            .ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(rows));
    }

    [HttpGet("book-groups")]
    public async Task<IActionResult> GetBookCopyGroups([FromQuery] string? search = null, [FromQuery] Guid? categoryId = null, [FromQuery] string? location = null, CancellationToken ct = default)
    {
        var selectedLocation = string.IsNullOrWhiteSpace(location) ? null : location.Trim();
        var query = _db.Books.AsNoTracking().Where(book => !book.IsDeleted);
        if (categoryId.HasValue)
            query = query.Where(book => book.Categories.Any(category => !category.IsDeleted && category.Id == categoryId.Value));
        if (selectedLocation is not null)
        {
            query = selectedLocation == "__warehouse__"
                ? query.Where(book => book.Copies.Any(copy => !copy.IsDeleted && copy.Location == null && copy.IsAvailable && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost))
                : query.Where(book => book.Copies.Any(copy => !copy.IsDeleted && copy.Location == selectedLocation));
        }
        var projected = query
            .Select(book => new
            {
                book.Id,
                book.Title,
                book.Code,
                TotalCopies = book.Copies.Count(copy => !copy.IsDeleted),
                OnShelfCopies = book.Copies.Count(copy => !copy.IsDeleted && copy.Location != null),
                CopiesAtLocation = selectedLocation == null ? 0 : selectedLocation == "__warehouse__"
                    ? book.Copies.Count(copy => !copy.IsDeleted && copy.Location == null && copy.IsAvailable && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost)
                    : book.Copies.Count(copy => !copy.IsDeleted && copy.Location == selectedLocation),
                InWarehouseCopies = book.Copies.Count(copy => !copy.IsDeleted && copy.IsAvailable && copy.Location == null
                    && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost),
                UnavailableCopies = book.Copies.Count(copy => !copy.IsDeleted && (!copy.IsAvailable || copy.Condition == BookCondition.Damaged || copy.Condition == BookCondition.Lost))
            });
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            projected = projected.Where(book => book.Title.ToLower().Contains(term) || book.Code.ToLower().Contains(term));
        }
        var rows = await projected.Where(book => book.TotalCopies > 0).OrderBy(book => book.Title).ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(rows));
    }

    [HttpGet("sorting/books")]
    public async Task<IActionResult> GetBooksForSorting([FromQuery] string? search = null, CancellationToken ct = default)
    {
        var query = _db.Books.AsNoTracking().Where(book => !book.IsDeleted)
            .Select(book => new
            {
                book.Id,
                book.Title,
                book.Code,
                OnShelfCopies = book.Copies.Count(copy => !copy.IsDeleted && copy.Location != null),
                InWarehouseCopies = book.Copies.Count(copy => !copy.IsDeleted && copy.IsAvailable && copy.Location == null
                    && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost)
            });
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(book => book.Title.ToLower().Contains(term) || book.Code.ToLower().Contains(term));
        }
        var rows = await query.Where(book => book.InWarehouseCopies > 0)
            .OrderBy(book => book.Title).ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(rows));
    }

    [HttpGet("sorting/books/{bookId:guid}")]
    public async Task<IActionResult> GetBookSortingDetails(Guid bookId, CancellationToken ct = default)
    {
        var book = await _db.Books.AsNoTracking().Where(item => item.Id == bookId && !item.IsDeleted)
            .Select(item => new { item.Id, item.Title, item.Code }).FirstOrDefaultAsync(ct);
        if (book is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy đầu sách."));
        var onShelfCopies = await _db.BookCopies.CountAsync(copy => copy.BookId == bookId && !copy.IsDeleted && copy.Location != null, ct);
        var copies = await _db.BookCopies.AsNoTracking()
            .Where(copy => copy.BookId == bookId && !copy.IsDeleted && copy.IsAvailable && copy.Location == null
                && copy.Condition != BookCondition.Damaged && copy.Condition != BookCondition.Lost)
            .OrderBy(copy => copy.Barcode)
            .Select(copy => new
            {
                copy.Id,
                copy.Barcode,
                Condition = copy.Condition.ToString(),
                HasBeenReturned = _db.BorrowRecords.Any(loan => loan.BookCopyId == copy.Id && !loan.IsDeleted && loan.Status == BorrowStatus.Returned)
            })
            .ToListAsync(ct);
        return Ok(ApiResponse<object>.Ok(new
        {
            bookId = book.Id,
            book.Title,
            book.Code,
            onShelfCopies,
            inWarehouseCopies = copies.Count,
            returnedInWarehouseCopies = copies.Count(copy => copy.HasBeenReturned),
            copies
        }));
    }

    [HttpPost("locations")]
    public async Task<IActionResult> CreateLocation([FromBody] SaveShelfRequest request, CancellationToken ct = default)
    {
        var name = request.Name?.Trim();
        if (!IsValidShelfName(name) || request.Capacity is < 1 or > 10000)
            return BadRequest(ApiResponse<object>.Fail("Tên kệ hoặc sức chứa không hợp lệ."));
        var shelfName = name!;
        if (await _db.StorageShelves.AnyAsync(shelf => !shelf.IsDeleted && shelf.Name.ToLower() == shelfName.ToLower(), ct))
            return Conflict(ApiResponse<object>.Fail("Tên kệ này đã được sử dụng."));
        var shelf = new StorageShelf { Id = Guid.NewGuid(), Name = shelfName, Capacity = request.Capacity };
        _db.StorageShelves.Add(shelf);
        await _db.SaveChangesAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { shelf.Id, shelf.Name, shelf.Capacity, copyCount = 0, availableCapacity = shelf.Capacity }));
    }

    [HttpPut("locations/{id:guid}")]
    public async Task<IActionResult> UpdateLocation(Guid id, [FromBody] SaveShelfRequest request, CancellationToken ct = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var shelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE id = {id} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
        if (shelf is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy kệ sách."));
        var name = request.Name?.Trim();
        if (!IsValidShelfName(name) || request.Capacity is < 1 or > 10000)
            return BadRequest(ApiResponse<object>.Fail("Tên kệ hoặc sức chứa không hợp lệ."));
        var shelfName = name!;
        if (await _db.StorageShelves.AnyAsync(item => item.Id != id && !item.IsDeleted && item.Name.ToLower() == shelfName.ToLower(), ct))
            return Conflict(ApiResponse<object>.Fail("Tên kệ này đã được sử dụng."));
        var occupied = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == shelf.Name, ct);
        if (request.Capacity < occupied)
            return Conflict(ApiResponse<object>.Fail($"Kệ đang có {occupied} bản sao; sức chứa mới không thể thấp hơn số này."));
        var oldName = shelf.Name;
        shelf.Name = shelfName;
        shelf.Capacity = request.Capacity;
        await _db.BookCopies.Where(copy => !copy.IsDeleted && copy.Location == oldName)
            .ExecuteUpdateAsync(update => update.SetProperty(copy => copy.Location, shelfName), ct);
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { shelf.Id, shelf.Name, shelf.Capacity, copyCount = occupied, availableCapacity = shelf.Capacity - occupied }));
    }

    [HttpDelete("locations/{id:guid}")]
    public async Task<IActionResult> DeleteLocation(Guid id, CancellationToken ct = default)
    {
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var shelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE id = {id} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
        if (shelf is null) return NotFound(ApiResponse<object>.Fail("Không tìm thấy kệ sách."));
        var occupied = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == shelf.Name, ct);
        if (occupied > 0)
            return Conflict(ApiResponse<object>.Fail($"Kệ còn {occupied} bản sao. Hãy chuyển hết sách sang kệ khác hoặc vào kho trước khi xóa."));
        shelf.IsDeleted = true;
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return Ok(ApiResponse<bool>.Ok(true));
    }

    [HttpPost("locations/transfer")]
    public async Task<IActionResult> TransferLocations([FromBody] TransferCopiesRequest request, [FromServices] CirculationService circulation, CancellationToken ct = default)
    {
        if (request.Assignments is null || request.Assignments.Count == 0 || request.Assignments.Count > 500)
            return BadRequest(ApiResponse<object>.Fail("Cần chọn từ 1 đến 500 bản sao để điều chuyển."));
        if (request.Assignments.Select(item => item.CopyId).Distinct().Count() != request.Assignments.Count)
            return BadRequest(ApiResponse<object>.Fail("Một bản sao chỉ được khai báo một lần trong đợt điều chuyển."));
        await using var transaction = await _db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);
        var copyIds = request.Assignments.Select(item => item.CopyId).ToArray();
        // The UI represents “Trong kho” with an empty select value. Persist that
        // as SQL NULL so warehouse queries (Location == null) include the copy.
        var assignments = request.Assignments.ToDictionary(
            item => item.CopyId,
            item => string.IsNullOrWhiteSpace(item.Location) ? null : item.Location.Trim());
        var targetNames = assignments.Values.Where(name => !string.IsNullOrWhiteSpace(name)).Distinct().ToArray();
        // Use a PostgreSQL array parameter here instead of a captured EF Contains
        // expression. This avoids provider evaluation failures on large selections.
        var copies = await _db.BookCopies
            .FromSqlInterpolated($"SELECT * FROM book_copies WHERE id = ANY({copyIds}) AND is_deleted = FALSE FOR UPDATE")
            .ToListAsync(ct);
        if (copies.Count != copyIds.Length) return NotFound(ApiResponse<object>.Fail("Một hoặc nhiều bản sao không còn tồn tại."));
        var sourceNames = copies.Select(copy => copy.Location).ToList();
        var affectedNames = sourceNames.Concat(targetNames).Where(name => !string.IsNullOrWhiteSpace(name))
            .Distinct(StringComparer.Ordinal).OrderBy(name => name, StringComparer.Ordinal).ToArray();
        var shelves = new List<StorageShelf>();
        foreach (var name in affectedNames)
        {
            var lockedShelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE name = {name} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
            if (lockedShelf is not null) shelves.Add(lockedShelf);
        }
        if (targetNames.Any(name => !shelves.Any(shelf => shelf.Name == name)) ||
            sourceNames.Where(name => !string.IsNullOrWhiteSpace(name)).Any(name => !shelves.Any(shelf => shelf.Name == name)))
            return BadRequest(ApiResponse<object>.Fail("Một hoặc nhiều kệ nguồn hoặc kệ đích không còn hoạt động."));
        if (copies.Any(copy => !string.IsNullOrWhiteSpace(assignments[copy.Id]) &&
                               (!copy.IsAvailable || copy.Condition is BookCondition.Damaged or BookCondition.Lost)))
            return Conflict(ApiResponse<object>.Fail("Chỉ bản sao đang ở kho và còn tốt mới được chuyển lên kệ."));
        var shelfCopyIds = request.Assignments.Where(item => !string.IsNullOrWhiteSpace(item.Location)).Select(item => item.CopyId).ToList();
        if (await _db.BorrowRecords.AnyAsync(loan => shelfCopyIds.Contains(loan.BookCopyId) && !loan.IsDeleted &&
            (loan.Status == BorrowStatus.Pending || loan.Status == BorrowStatus.Approved || loan.Status == BorrowStatus.Borrowed || loan.Status == BorrowStatus.Overdue), ct))
            return Conflict(ApiResponse<object>.Fail("Có bản sao đang gắn với phiếu mở. Không thể xếp kệ."));
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var shelf in shelves)
            counts[shelf.Name] = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == shelf.Name, ct);
        foreach (var copy in copies)
        {
            var oldName = copy.Location;
            var newName = assignments[copy.Id];
            if (oldName == newName) continue;
            if (!string.IsNullOrWhiteSpace(oldName)) counts[oldName] = counts.GetValueOrDefault(oldName) - 1;
            if (!string.IsNullOrWhiteSpace(newName)) counts[newName] = counts.GetValueOrDefault(newName) + 1;
        }
        foreach (var shelf in shelves)
            if (counts.GetValueOrDefault(shelf.Name) > shelf.Capacity)
                return Conflict(ApiResponse<object>.Fail($"Kệ {shelf.Name} sẽ vượt sức chứa ({counts[shelf.Name]}/{shelf.Capacity}). Không có thay đổi nào được lưu."));
        var availableShelfDeltaByBook = new Dictionary<Guid, int>();
        foreach (var copy in copies)
        {
            var nextName = assignments[copy.Id];
            if (copy.Location != nextName && copy.IsAvailable && copy.Condition is not (BookCondition.Damaged or BookCondition.Lost))
                availableShelfDeltaByBook[copy.BookId] = availableShelfDeltaByBook.GetValueOrDefault(copy.BookId)
                    + CopyScanRules.ShelfAvailabilityDelta(copy.Location, nextName);
            copy.Location = nextName;
        }
        foreach (var (bookId, delta) in availableShelfDeltaByBook)
        {
            var book = await _db.Books.FirstAsync(item => item.Id == bookId, ct);
            book.AvailableCopies = Math.Max(0, book.AvailableCopies + delta);
            book.UpdatedAt = DateTime.UtcNow;
        }
        await _db.SaveChangesAsync(ct);
        await circulation.ReadyReservationsAfterShelvingAsync(copies.Where(copy => copy.Location != null).Select(copy => copy.BookId), ct);
        await transaction.CommitAsync(ct);
        return Ok(ApiResponse<object>.Ok(new { movedCopies = copies.Count }));
    }

    [HttpPost("intake")]
    public async Task<IActionResult> Intake([FromBody] IntakeBookCopiesRequest request, [FromServices] CirculationService circulation, CancellationToken ct = default)
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
        var shelfQuantity = request.ShelfQuantity ?? (location is null ? 0 : request.Quantity);
        if (shelfQuantity < 0 || shelfQuantity > request.Quantity || (shelfQuantity > 0 && location is null))
            return BadRequest(ApiResponse<object>.Fail("Số bản đưa lên kệ phải từ 0 đến tổng số lượng; hãy chọn kệ nếu số bản trên kệ lớn hơn 0."));
        if (shelfQuantity > 0 && (request.Condition is BookCondition.Damaged or BookCondition.Lost))
            return BadRequest(ApiResponse<object>.Fail("Bản sao hỏng hoặc thất lạc phải được lưu ngoài kệ."));
        if (location is not null)
        {
            if (!IsValidShelfName(location)) return BadRequest(ApiResponse<object>.Fail("Tên vị trí phải theo dạng Tầng X · Kệ Y, ví dụ Tầng 4 · Kệ A."));
            var shelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE name = {location} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
            if (shelf is null) return BadRequest(ApiResponse<object>.Fail("Kệ đã chọn không tồn tại hoặc đã ngừng sử dụng."));
            var occupied = await _db.BookCopies.CountAsync(copy => !copy.IsDeleted && copy.Location == location, ct);
            if (occupied + shelfQuantity > shelf.Capacity)
                return Conflict(ApiResponse<object>.Fail($"Kệ {shelf.Name} còn {Math.Max(0, shelf.Capacity - occupied)} chỗ, không đủ nhận {shelfQuantity} bản sao."));
        }
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
                Location = index < shelfQuantity ? location : null,
                IsAvailable = request.Condition is not (BookCondition.Damaged or BookCondition.Lost),
                IsDeleted = false
            })
            .ToList();

        _db.BookCopies.AddRange(copies);
        book.TotalCopies += copies.Count;
        book.AvailableCopies += copies.Count(copy => copy.IsAvailable && copy.Location is not null);
        book.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        if (shelfQuantity > 0) await circulation.ReadyReservationsAfterShelvingAsync([request.BookId], ct);
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
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateBookCopyRequest request, [FromServices] CirculationService circulation, CancellationToken ct = default)
    {
        if (request.Location?.Trim().Length > 255)
            return BadRequest(ApiResponse<object>.Fail("Vị trí lưu trữ không được vượt quá 255 ký tự."));
        if (!Enum.IsDefined(request.Condition))
            return BadRequest(ApiResponse<object>.Fail("Tình trạng sách không hợp lệ."));

        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var copy = await _db.BookCopies
            .Include(item => item.Book)
            .FirstOrDefaultAsync(item => item.Id == id && !item.IsDeleted && !item.Book.IsDeleted, ct);
        if (copy is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bản sao sách."));

        if (copy.Condition != request.Condition && await _db.BookIncidents.AnyAsync(item => item.BookCopyId == id && !item.IsDeleted &&
            (item.Status == BookIncidentStatus.PendingReview || copy.Condition == BookCondition.Damaged || copy.Condition == BookCondition.Lost), ct))
            return Conflict(ApiResponse<object>.Fail("Bản sao có hồ sơ sự cố. Hãy cập nhật tình trạng qua hồ sơ để lưu kết quả kiểm tra."));

        var nextLocation = request.Condition is BookCondition.Damaged or BookCondition.Lost
            ? null
            : string.IsNullOrWhiteSpace(request.Location) ? null : request.Location.Trim();
        if (nextLocation is not null && !IsValidShelfName(nextLocation))
            return BadRequest(ApiResponse<object>.Fail("Tên vị trí phải theo dạng Tầng X · Kệ Y, ví dụ Tầng 4 · Kệ A."));
        if (nextLocation != copy.Location && nextLocation is not null)
        {
            var shelf = await _db.StorageShelves.FromSqlInterpolated($"SELECT * FROM storage_shelves WHERE name = {nextLocation} AND is_deleted = FALSE FOR UPDATE").FirstOrDefaultAsync(ct);
            if (shelf is null) return BadRequest(ApiResponse<object>.Fail("Kệ đã chọn không tồn tại hoặc đã ngừng sử dụng."));
            var occupied = await _db.BookCopies.CountAsync(item => !item.IsDeleted && item.Location == nextLocation, ct);
            if (occupied >= shelf.Capacity) return Conflict(ApiResponse<object>.Fail($"Kệ {shelf.Name} đã đầy ({occupied}/{shelf.Capacity})."));
        }
        var wasAvailableOnShelf = copy.IsAvailable && copy.Location is not null && copy.Condition is not (BookCondition.Damaged or BookCondition.Lost);
        copy.Condition = request.Condition;
        var borrowStatuses = await GetBorrowStatusesByCopyAsync([copy.Id], ct);
        var hasActiveLoan = borrowStatuses.GetValueOrDefault(copy.Id)?.Any(status =>
            status.Equals("pending", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("approved", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("borrowed", StringComparison.OrdinalIgnoreCase) ||
            status.Equals("overdue", StringComparison.OrdinalIgnoreCase)) ?? false;
        if (hasActiveLoan && nextLocation is not null)
            return Conflict(ApiResponse<object>.Fail("Bản sao đang được mượn hoặc giữ chỗ nên không thể xếp lên kệ."));
        copy.Location = nextLocation;
        copy.IsAvailable = request.Condition is not (BookCondition.Damaged or BookCondition.Lost) && !hasActiveLoan;

        var isAvailableOnShelf = copy.IsAvailable && copy.Location is not null;
        if (wasAvailableOnShelf != isAvailableOnShelf)
        {
            copy.Book.AvailableCopies = Math.Max(0, copy.Book.AvailableCopies + (isAvailableOnShelf ? 1 : -1));
            copy.Book.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);
        if (isAvailableOnShelf) await circulation.ReadyReservationsAfterShelvingAsync([copy.BookId], ct);
        await transaction.CommitAsync(ct);
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

public sealed record IntakeBookCopiesRequest(Guid BookId, int Quantity, string? Location, BookCondition Condition, int? ShelfQuantity = null);

public sealed record UpdateBookCopyRequest(string? Location, BookCondition Condition);

public sealed record SaveShelfRequest(string Name, int Capacity = 100);

public sealed record TransferCopiesRequest(IReadOnlyList<CopyLocationAssignment> Assignments);

public sealed record CopyLocationAssignment(Guid CopyId, string? Location);
