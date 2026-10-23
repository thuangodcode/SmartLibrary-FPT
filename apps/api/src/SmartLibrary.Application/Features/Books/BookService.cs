using AutoMapper;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Exceptions;

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

    public BookService(
        IBookRepository bookRepository,
        IUnitOfWork unitOfWork,
        IMapper mapper,
        IStorageService? storageService = null)
    {
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
        _storageService = storageService;
    }

    public async Task<PagedResult<BookDto>> GetPagedAsync(int page, int pageSize, string? search = null, Guid? categoryId = null, CancellationToken ct = default)
    {
        var pagedBooks = await _bookRepository.GetPagedAsync(page, pageSize, search, categoryId, ct);
        var dtos = _mapper.Map<IReadOnlyList<BookDto>>(pagedBooks.Items);
        return new PagedResult<BookDto>(dtos, pagedBooks.TotalCount, pagedBooks.Page, pagedBooks.PageSize);
    }

    public async Task<Result<BookDto>> GetByIdAsync(Guid id, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        return Result<BookDto>.Success(_mapper.Map<BookDto>(book));
    }

    public async Task<Result<BookDto>> CreateAsync(CreateBookRequest request, CancellationToken ct = default)
    {
        var book = _mapper.Map<Book>(request);
        await _bookRepository.AddAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<BookDto>.Success(_mapper.Map<BookDto>(book));
    }

    public async Task<Result<BookDto>> CreateFromFormAsync(CreateBookForm form, CancellationToken ct = default)
    {
        var trimmedTitle = form.Title?.Trim();
        if (string.IsNullOrWhiteSpace(trimmedTitle))
        {
            return Result<BookDto>.Failure("Tiêu đề sách không được để trống.");
        }

        string? coverUrl = null;
        if (form.CoverImage != null && form.CoverImage.Length > 0 && _storageService != null)
        {
            var ext = Path.GetExtension(form.CoverImage.FileName).ToLowerInvariant();
            await using var stream = form.CoverImage.OpenReadStream();
            var safeName = $"{Guid.NewGuid():N}{ext}";
            coverUrl = await _storageService.UploadFileAsync(stream, safeName, "books", ct);
        }

        var copies = Math.Max(1, form.TotalCopies);
        var book = new Book
        {
            Id = Guid.NewGuid(),
            Title = trimmedTitle,
            Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim(),
            Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim(),
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
                Barcode = $"BC-{book.Id.ToString()[..8].ToUpper()}-{i:D3}",
                Condition = SmartLibrary.Domain.Enums.BookCondition.New,
                IsAvailable = true,
                IsDeleted = false
            };
            book.Copies.Add(copy);
        }

        await _bookRepository.AddAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        var createdBook = await _bookRepository.GetWithDetailsAsync(book.Id, ct);
        return Result<BookDto>.Success(_mapper.Map<BookDto>(createdBook ?? book));
    }

    public async Task<Result<BookDto>> UpdateAsync(Guid id, UpdateBookRequest request, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetByIdAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        _mapper.Map(request, book);
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<BookDto>.Success(_mapper.Map<BookDto>(book));
    }

    public async Task<Result<BookDto>> UpdateFromFormAsync(Guid id, UpdateBookForm form, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetWithDetailsAsync(id, ct);
        if (book is null)
            return Result<BookDto>.Failure(Errors.NotFound);

        book.Title = form.Title.Trim();
        book.Isbn = string.IsNullOrWhiteSpace(form.Isbn) ? null : form.Isbn.Trim();
        book.Description = string.IsNullOrWhiteSpace(form.Description) ? null : form.Description.Trim();
        book.PublishedYear = form.PublishedYear;
        book.Language = string.IsNullOrWhiteSpace(form.Language) ? "vi" : form.Language.Trim();
        book.PageCount = form.PageCount;

        if (form.RemoveCoverImage)
        {
            book.CoverImageUrl = null;
        }
        else if (form.CoverImage != null && form.CoverImage.Length > 0)
        {
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

        var updatedBook = await _bookRepository.GetWithDetailsAsync(id, ct);
        return Result<BookDto>.Success(_mapper.Map<BookDto>(updatedBook ?? book));
    }

    public async Task<Result<bool>> DeleteAsync(Guid id, CancellationToken ct = default)
    {
        var book = await _bookRepository.GetByIdAsync(id, ct);
        if (book is null)
            return Result<bool>.Failure(Errors.NotFound);

        book.IsDeleted = true;
        await _bookRepository.UpdateAsync(book, ct);
        await _unitOfWork.SaveChangesAsync(ct);

        return Result<bool>.Success(true);
    }
}
