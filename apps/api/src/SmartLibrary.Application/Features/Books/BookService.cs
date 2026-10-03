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

    public BookService(IBookRepository bookRepository, IUnitOfWork unitOfWork, IMapper mapper)
    {
        _bookRepository = bookRepository;
        _unitOfWork = unitOfWork;
        _mapper = mapper;
    }

    public async Task<PagedResult<BookDto>> GetPagedAsync(int page, int pageSize, string? search = null, CancellationToken ct = default)
    {
        var pagedBooks = await _bookRepository.GetPagedAsync(page, pageSize, search, ct);
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
