using AutoMapper;
using System.Text.Json;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Books;

/// <summary>
/// Book business logic service – vertical slice example.
/// </summary>
public class BookService
{
    private readonly IBookRepository _bookRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IMapper _mapper;
    private readonly IBookCodeGenerator _codeGenerator;
    private readonly IStorageService? _storageService;
    private readonly IRagIndexer? _ragIndexer;
    private readonly IBookCatalogCache? _catalogCache;

    public BookService(
        IBookRepository bookRepository,
        IUnitOfWork unitOfWork,
        IMapper mapper,
        IBookCodeGenerator codeGenerator,
        IStorageService? storageService = null,
        IRagIndexer? ragIndexer = null,
        IBookCatalogCache? catalogCache = null)
    {
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
        _codeGenerator = codeGenerator;
        _storageService = storageService;
        _ragIndexer = ragIndexer;
        _catalogCache = catalogCache;
    }

    public async Task<PagedResult<BookDto>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, bool sortByReviewCount = false, bool reviewCountAscending = false, CancellationToken ct = default, bool sortByBorrowCount = false)
    {
        var pagedBooks = await _bookRepository.GetPagedAsync(page, pageSize, search, categoryId, sortByReviewCount, reviewCountAscending, ct, sortByBorrowCount);
        var dtos = pagedBooks.Items.Select(ToBookDto).ToList();
        return new PagedResult<BookDto>(dtos, pagedBooks.TotalCount, pagedBooks.Page, pagedBooks.PageSize);
    }

    public async Task<Result<BookDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        return Result<BookDto>.Success(ToBookDto(book));
    }

    public async Task<Result<BookAvailabilityDto>> GetAvailabilityAsync(Guid id, CancellationToken ct = default)
    {
        if (await _bookRepository.GetByIdAsync(id, ct) is null)
            return Result<BookAvailabilityDto>.Failure(Errors.NotFound);

        var (total, available) = await _bookRepository.GetCopyAvailabilityAsync(id, ct);
        return Result<BookAvailabilityDto>.Success(new BookAvailabilityDto(total, available, available > 0));
    }

    public async Task<Result<BookDto>> CreateAsync(CreateBookRequest request, CancellationToken ct = default)
    {
        var categoryIds = request.CategoryIds.Where(id => id != Guid.Empty).Distinct().ToList();
        var primaryId = request.CodeCategoryId ?? (categoryIds.Count == 1 ? categoryIds[0] : (Guid?)null);
        if (!primaryId.HasValue || !categoryIds.Contains(primaryId.Value))
            return Result<BookDto>.Failure("Chọn một danh mục cấp mã trong các danh mục của đầu sách.");
        var categories = new List<Category>();
        foreach (var id in categoryIds)
        {
            var category = await _unitOfWork.Repository<Category>().GetByIdAsync(id, ct);
            if (category is null || category.IsDeleted)
                return Result<BookDto>.Failure("Một hoặc nhiều danh mục không còn tồn tại.");
            categories.Add(category);
        }
        var generated = await _codeGenerator.GetNextAsync(primaryId.Value, true, ct);
        if (!generated.IsSuccess) return Result<BookDto>.Failure(generated.Error!);
        var book = _mapper.Map<Book>(request);
        book.Code = generated.Data!;
        book.CodeCategoryId = primaryId;
        book.Categories = categories;
        await _bookRepository.AddAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<BookDto>.Success(ToBookDto(book));
    }

    public async Task<Result<bool>> AddCategoryAsync(Guid bookId, Guid categoryId, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(bookId, ct);
        if (book is null) return Result<bool>.Failure(Errors.NotFound);

        var category = await _unitOfWork.Repository<Category>().GetByIdAsync(categoryId, ct);
        if (category is null || category.IsDeleted) return Result<bool>.Failure(Errors.NotFound);
        if (book.Categories.Any(existing => existing.Id == categoryId))
            return Result<bool>.Failure("Đầu sách đã có trong danh mục này.");

        book.Categories.Add(category);
        book.UpdatedAt = DateTime.UtcNow;
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: false, ct);
        return Result<bool>.Success(true);
    }

    public async Task<bool> IsBookCodeAvailableAsync(string? code, CancellationToken ct = default)
    {
        var normalizedCode = NormalizeBookCode(code);
        return normalizedCode is not null && !await _bookRepository.IsCodeTakenAsync(normalizedCode, ct);
    }

    public async Task<Result<BookDto>> CreateFromFormAsync(CreateBookForm form, CancellationToken ct = default)
    {
        var trimmedTitle = form.Title?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedTitle))
        {
            return Result<BookDto>.Failure("Tiêu đề sách không được để trống.");
        }

        if (form.TotalCopies is < 1 or > 500)
        {
            return Result<BookDto>.Failure("Số lượng bản sao phải từ 1 đến 500.");
        }

        var copies = form.TotalCopies;
        var location = string.IsNullOrWhiteSpace(form.Location) ? null : form.Location.Trim();
        var shelfQuantity = form.ShelfQuantity ?? (location is null ? 0 : copies);
        if (shelfQuantity < 0 || shelfQuantity > copies || (shelfQuantity > 0 && location is null))
            return Result<BookDto>.Failure("Số bản đưa lên kệ phải từ 0 đến tổng số bản sao và cần chọn kệ nếu số lượng lớn hơn 0.");
        if (location?.Length > 255)
        {
            return Result<BookDto>.Failure("Vị trí lưu trữ không được vượt quá 255 ký tự.");
        }

        var categoryIds = form.CategoryIds
            .Concat(form.CategoryId.HasValue ? new[] { form.CategoryId.Value } : Array.Empty<Guid>())
            .Where(id => id != Guid.Empty)
            .Distinct()
            .ToList();
        if (categoryIds.Count == 0)
            return Result<BookDto>.Failure("Vui lòng chọn ít nhất một danh mục cho đầu sách.");
        var primaryId = form.CodeCategoryId ?? (categoryIds.Count == 1 ? categoryIds[0] : (Guid?)null);
        if (!primaryId.HasValue || !categoryIds.Contains(primaryId.Value))
            return Result<BookDto>.Failure("Chọn một danh mục cấp mã trong các danh mục của đầu sách.");

        var bookCategories = new List<Category>(categoryIds.Count);
        foreach (var categoryId in categoryIds)
        {
            var category = await _unitOfWork.Repository<Category>().GetByIdAsync(categoryId, ct);
            if (category is null || category.IsDeleted)
                return Result<BookDto>.Failure("Một hoặc nhiều danh mục đã chọn không còn tồn tại.");
            bookCategories.Add(category);
        }
        if (form.CoverImage is { Length: > 0 } && _storageService is null)
            return Result<BookDto>.Failure("Dịch vụ lưu trữ ảnh chưa được cấu hình.");
        string? coverUrl = null;
        if (form.CoverImage != null && form.CoverImage.Length > 0 && _storageService != null)
        {
            var ext = Path.GetExtension(form.CoverImage.FileName).ToLowerInvariant();
            await using var stream = form.CoverImage.OpenReadStream();
            var safeName = $"{Guid.NewGuid():N}{ext}";
            coverUrl = await _storageService.UploadFileAsync(stream, safeName, "books", ct);
        }

        var generated = await _codeGenerator.GetNextAsync(primaryId.Value, true, ct);
        if (!generated.IsSuccess) return Result<BookDto>.Failure(generated.Error!);
        var code = generated.Data!;
        var book = new Book
        {
            Id = Guid.NewGuid(),
            Code = code,
            CodeCategoryId = primaryId,
            Title = trimmedTitle,
            Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim(),
            Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim(),
            CustomFieldsJson = NormalizeCustomFieldsJson(form.CustomFieldsJson),
            CoverImageUrl = coverUrl,
            PublishedYear = form.PublishedYear,
            Language = string.IsNullOrWhiteSpace(form.Language) ? "vi" : form.Language.Trim(),
            PageCount = form.PageCount,
            TotalCopies = copies,
            AvailableCopies = shelfQuantity,
            AverageRating = 0m,
            IsDeleted = false
        };

        foreach (var category in bookCategories) book.Categories.Add(category);

        if (!string.IsNullOrWhiteSpace(form.AuthorName))
        {
            var authorName = form.AuthorName.Trim();
            var authors = await _unitOfWork.Repository<Author>().FindAsync(a => a.Name.ToLower() == authorName.ToLower() && !a.IsDeleted, ct);
            var author = authors.FirstOrDefault();
            if (author == null)
            {
                author = new Author
                {
                    Id = Guid.NewGuid(),
                    Name = authorName,
                    IsDeleted = false
                };
                await _unitOfWork.Repository<Author>().AddAsync(author, ct);
            }
            book.Authors.Add(author);
        }

        for (int i = 1; i <= copies; i++)
        {
            var copy = new BookCopy
            {
                Id = Guid.NewGuid(),
                BookId = book.Id,
                Barcode = $"{code}-{i:D2}",
                Condition = SmartLibrary.Domain.Enums.BookCondition.New,
                Location = i <= shelfQuantity ? location : null,
                IsAvailable = true,
                IsDeleted = false
            };
            book.Copies.Add(copy);
        }

        await _bookRepository.AddAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: false, ct);

        var createdBook = await _bookRepository.GetWithDetailsAsync(book.Id, ct);
        return Result<BookDto>.Success(ToBookDto(createdBook ?? book));
    }

    public async Task<Result<BookDto>> UpdateAsync(Guid id, UpdateBookRequest request, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        var requestedCategoryIds = request.CategoryIds.Where(categoryId => categoryId != Guid.Empty).Distinct().ToList();
        if (requestedCategoryIds.Count > 0 && book.CodeCategoryId.HasValue && !requestedCategoryIds.Contains(book.CodeCategoryId.Value))
            return Result<BookDto>.Failure("Cần giữ danh mục cấp mã của đầu sách để bảo toàn mã bản sao và QR. Có thể thêm các danh mục khác.");
        var requestedCategories = new List<Category>(requestedCategoryIds.Count);
        foreach (var categoryId in requestedCategoryIds)
        {
            var category = await _unitOfWork.Repository<Category>().GetByIdAsync(categoryId, ct);
            if (category is null || category.IsDeleted)
                return Result<BookDto>.Failure("Một hoặc nhiều danh mục đã chọn không còn tồn tại.");
            requestedCategories.Add(category);
        }

        _mapper.Map(request, book);
        if (requestedCategoryIds.Count > 0)
        {
            book.Categories.Clear();
            foreach (var category in requestedCategories) book.Categories.Add(category);
        }
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: false, ct);

        return Result<BookDto>.Success(ToBookDto(book));
    }

    public async Task<Result<BookDto>> UpdateFromFormAsync(Guid id, UpdateBookForm form, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        if (form.Location?.Trim().Length > 255)
        {
            return Result<BookDto>.Failure("Vị trí lưu trữ không được vượt quá 255 ký tự.");
        }
        var requestedTotalCopies = form.TotalCopies ?? book.TotalCopies;
        if (requestedTotalCopies is < 1 or > 500)
        {
            return Result<BookDto>.Failure("Số lượng bản sao phải từ 1 đến 500.");
        }

        var activeCopies = book.Copies.Where(copy => !copy.IsDeleted).ToList();
        if (form.TotalCopies.HasValue && form.TotalCopies.Value != book.TotalCopies)
        {
            var copyCountDifference = requestedTotalCopies - activeCopies.Count;
            if (copyCountDifference < 0)
            {
                var removableCopies = activeCopies
                    .Where(copy => copy.IsAvailable)
                    .OrderByDescending(copy => copy.CreatedAt)
                    .Take(-copyCountDifference)
                    .ToList();
                if (removableCopies.Count != -copyCountDifference)
                {
                    return Result<BookDto>.Failure(
                        "Không thể giảm số lượng xuống dưới số bản sao hiện có thể thu hồi. Kiểm tra các bản sao đang mượn hoặc không khả dụng.");
                }

                foreach (var copy in removableCopies)
                {
                    copy.IsDeleted = true;
                }
            }
            else if (copyCountDifference > 0)
            {
                var nextCopyNumber = await _bookRepository.GetNextCopyNumberAsync(id, book.Code, ct);
                // Newly added copies enter the warehouse; shelf placement is managed per copy.
                const string? locationForNewCopies = null;

                for (var index = 0; index < copyCountDifference; index++)
                {
                    var copy = new BookCopy
                    {
                        Id = Guid.NewGuid(),
                        BookId = book.Id,
                        Barcode = $"{book.Code}-{nextCopyNumber + index:D2}",
                        Condition = BookCondition.New,
                        Location = locationForNewCopies,
                        IsAvailable = true,
                        IsDeleted = false
                    };
                    book.Copies.Add(copy);
                    activeCopies.Add(copy);
                }
            }

            book.TotalCopies = requestedTotalCopies;
        }

        book.AvailableCopies = activeCopies.Count(copy => !copy.IsDeleted && copy.IsAvailable && copy.Location is not null && copy.Condition is not (SmartLibrary.Domain.Enums.BookCondition.Damaged or SmartLibrary.Domain.Enums.BookCondition.Lost));

        book.Title = form.Title.Trim();
        book.Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim();
        book.Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim();
        if (form.CustomFieldsJson is not null)
            book.CustomFieldsJson = NormalizeCustomFieldsJson(form.CustomFieldsJson);
        book.PublishedYear = form.PublishedYear;
        book.Language = string.IsNullOrWhiteSpace(form.Language) ? "vi" : form.Language.Trim();
        book.PageCount = form.PageCount;
        if (form.RemoveCoverImage)
        {
            book.CoverImageUrl = null;
        }
        else if (form.CoverImage != null && form.CoverImage.Length > 0)
        {
            if (_storageService is null)
            {
                return Result<BookDto>.Failure("Dịch vụ lưu trữ ảnh chưa được cấu hình.");
            }

            await using var stream = form.CoverImage.OpenReadStream();
            var ext = Path.GetExtension(form.CoverImage.FileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".jpg";
            var safeName = $"{Guid.NewGuid():N}{ext}";
            book.CoverImageUrl = await _storageService.UploadFileAsync(stream, safeName, "books", ct);
        }

        if (!string.IsNullOrWhiteSpace(form.AuthorName))
        {
            var authorName = form.AuthorName.Trim();
            var authors = await _unitOfWork.Repository<Author>().FindAsync(a => a.Name.ToLower() == authorName.ToLower() && !a.IsDeleted, ct);
            var author = authors.FirstOrDefault();
            if (author == null)
            {
                author = new Author
                {
                    Id = Guid.NewGuid(),
                    Name = authorName,
                    IsDeleted = false
                };
                await _unitOfWork.Repository<Author>().AddAsync(author, ct);
            }
            book.Authors.Clear();
            book.Authors.Add(author);
        }

        var requestedCategoryIds = (form.CategoryIds ?? Enumerable.Empty<Guid>())
            .Concat(form.CategoryId.HasValue ? new[] { form.CategoryId.Value } : Array.Empty<Guid>())
            .Where(categoryId => categoryId != Guid.Empty)
            .Distinct()
            .ToList();
        if (requestedCategoryIds.Count > 0)
        {
            if (book.CodeCategoryId.HasValue && !requestedCategoryIds.Contains(book.CodeCategoryId.Value))
                return Result<BookDto>.Failure("Cần giữ danh mục cấp mã của đầu sách. Có thể thêm các danh mục khác.");
            book.Categories.Clear();
            foreach (var categoryId in requestedCategoryIds)
            {
                var category = await _unitOfWork.Repository<Category>().GetByIdAsync(categoryId, ct);
                if (category is null || category.IsDeleted)
                    return Result<BookDto>.Failure("Một hoặc nhiều danh mục không còn tồn tại. Vui lòng tải lại danh sách.");
                if (!book.Categories.Any(existing => existing.Id == category.Id))
                    book.Categories.Add(category);
            }
        }

        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: false, ct);

        var updatedBook = await _bookRepository.GetWithDetailsAsync(id, ct);
        return Result<BookDto>.Success(ToBookDto(updatedBook ?? book));
    }

    private BookDto ToBookDto(Book book)
    {
        var dto = _mapper.Map<BookDto>(book);
        dto.CustomFields = ParseCustomFields(book.CustomFieldsJson);
        dto.ReviewCount = book.ReviewCount;
        dto.BorrowCount = book.BorrowCount;
        return dto;
    }

    private static string NormalizeCustomFieldsJson(string? json)
        => JsonSerializer.Serialize(ParseCustomFields(json));

    private static Dictionary<string, string> ParseCustomFields(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new Dictionary<string, string>();
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? new Dictionary<string, string>();
        }
        catch (JsonException)
        {
            return new Dictionary<string, string>();
        }
    }

    private static string? NormalizeBookCode(string? code)
    {
        var normalizedCode = code?.Trim();
        if (string.IsNullOrEmpty(normalizedCode) ||
            normalizedCode.Length > 32 ||
            !normalizedCode.All(char.IsAsciiLetterOrDigit))
        {
            return null;
        }

        return normalizedCode;
    }

    public async Task<Result<bool>> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetByIdAsync(id, ct);
        if (book is null)
            return Result<bool>.Failure(Errors.NotFound);

        book.IsDeleted = true;
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: true, ct);

        return Result<bool>.Success(true);
    }

    public async Task<Result<bool>> RestoreAsync(Guid id, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetDeletedWithDetailsAsync(id, ct);
        if (book is null) return Result<bool>.Failure(Errors.NotFound);

        book.IsDeleted = false;
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);
        await SyncRagBookAsync(book.Id, deleted: false, ct);
        return Result<bool>.Success(true);
    }

    private async Task SyncRagBookAsync(Guid bookId, bool deleted, CancellationToken ct)
    {
        _catalogCache?.Invalidate();
        if (_ragIndexer is null)
            return;

        try
        {
            if (deleted)
                await _ragIndexer.DeleteAsync("book", bookId, ct);
            else
                await _ragIndexer.UpsertBookAsync(bookId, ct);
        }
        catch
        {
            // Không chặn lưu sách nếu Gemini/RAG lỗi.
        }
    }
}
