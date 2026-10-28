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
    private readonly IStorageService? _storageService;
    private readonly IRagIndexer? _ragIndexer;
    private readonly IBookCatalogCache? _catalogCache;

    public BookService(
        IBookRepository bookRepository,
        IUnitOfWork unitOfWork,
        IMapper mapper,
        IStorageService? storageService = null,
        IRagIndexer? ragIndexer = null,
        IBookCatalogCache? catalogCache = null)
    {
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
        _storageService = storageService;
        _ragIndexer = ragIndexer;
        _catalogCache = catalogCache;
    }

    public async Task<PagedResult<BookDto>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, bool sortByReviewCount = false, bool reviewCountAscending = false, CancellationToken ct = default)
    {
        var pagedBooks = await _bookRepository.GetPagedAsync(page, pageSize, search, categoryId, sortByReviewCount, reviewCountAscending, ct);
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
        var code = NormalizeBookCode(request.Code);
        if (code is null)
        {
            return Result<BookDto>.Failure("Mã sách chỉ được gồm 1–32 chữ cái hoặc chữ số.");
        }
        if (await _bookRepository.IsCodeTakenAsync(code, ct))
        {
            return Result<BookDto>.Failure("Mã sách đã được sử dụng. Vui lòng nhập mã khác.");
        }

        var book = _mapper.Map<Book>(request);
        book.Code = code;
        await _bookRepository.AddAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<BookDto>.Success(ToBookDto(book));
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

        var code = NormalizeBookCode(form.Code);
        if (code is null)
        {
            return Result<BookDto>.Failure("Mã sách chỉ được gồm 1–32 chữ cái hoặc chữ số.");
        }
        if (await _bookRepository.IsCodeTakenAsync(code, ct))
        {
            return Result<BookDto>.Failure("Mã sách đã được sử dụng. Vui lòng nhập mã khác.");
        }

        if (form.TotalCopies is < 1 or > 500)
        {
            return Result<BookDto>.Failure("Số lượng bản sao phải từ 1 đến 500.");
        }

        var copies = form.TotalCopies;
        var location = string.IsNullOrWhiteSpace(form.Location) ? null : form.Location.Trim();
        if (location?.Length > 255)
        {
            return Result<BookDto>.Failure("Vị trí lưu trữ không được vượt quá 255 ký tự.");
        }

        string? coverUrl = null;
        if (form.CoverImage != null && form.CoverImage.Length > 0 && _storageService != null)
        {
            var ext = Path.GetExtension(form.CoverImage.FileName).ToLowerInvariant();
            await using var stream = form.CoverImage.OpenReadStream();
            var safeName = $"{Guid.NewGuid():N}{ext}";
            coverUrl = await _storageService.UploadFileAsync(stream, safeName, "books", ct);
        }

        var book = new Book
        {
            Id = Guid.NewGuid(),
            Code = code,
            Title = trimmedTitle,
            Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim(),
            Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim(),
            CustomFieldsJson = NormalizeCustomFieldsJson(form.CustomFieldsJson),
            CoverImageUrl = coverUrl,
            PublishedYear = form.PublishedYear,
            Language = string.IsNullOrWhiteSpace(form.Language) ? "vi" : form.Language.Trim(),
            PageCount = form.PageCount,
            TotalCopies = copies,
            AvailableCopies = copies,
            AverageRating = 0m,
            IsDeleted = false
        };

        if (form.CategoryId.HasValue)
        {
            var category = await _unitOfWork.Repository<Category>().GetByIdAsync(form.CategoryId.Value, ct);
            if (category != null)
            {
                book.Categories.Add(category);
            }
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
                Location = location,
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
        var book = await _bookRepository.GetByIdAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        _mapper.Map(request, book);
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
            var locationForNewCopies = form.Location is null
                ? activeCopies.Select(copy => copy.Location).FirstOrDefault(location => !string.IsNullOrWhiteSpace(location))
                : string.IsNullOrWhiteSpace(form.Location) ? null : form.Location.Trim();

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
        book.AvailableCopies = activeCopies.Count(copy => !copy.IsDeleted && copy.IsAvailable);

        book.Title = form.Title.Trim();
        book.Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim();
        book.Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim();
        if (form.CustomFieldsJson is not null)
            book.CustomFieldsJson = NormalizeCustomFieldsJson(form.CustomFieldsJson);
        book.PublishedYear = form.PublishedYear;
        book.Language = string.IsNullOrWhiteSpace(form.Language) ? "vi" : form.Language.Trim();
        book.PageCount = form.PageCount;
        if (form.Location is not null)
        {
            var location = string.IsNullOrWhiteSpace(form.Location) ? null : form.Location.Trim();
            foreach (var copy in book.Copies.Where(copy => !copy.IsDeleted))
            {
                copy.Location = location;
            }
        }

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

        if (form.CategoryId.HasValue)
        {
            var category = await _unitOfWork.Repository<Category>().GetByIdAsync(form.CategoryId.Value, ct);
            if (category != null)
            {
                book.Categories.Clear();
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
