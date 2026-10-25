using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books.DTOs;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Authorize(Roles = "Reader")]
[Route("api/v1/me/favorites")]
public sealed class ReaderFavoritesController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        var favorites = await db.ReaderFavorites
            .AsNoTracking()
            .Where(favorite => favorite.ReaderId == readerId)
            .OrderByDescending(favorite => favorite.CreatedAt)
            .Include(favorite => favorite.Book)
                .ThenInclude(book => book.Authors)
            .Include(favorite => favorite.Book)
                .ThenInclude(book => book.Categories)
            .Select(favorite => new BookDto
            {
                Id = favorite.Book.Id,
                Code = favorite.Book.Code,
                Title = favorite.Book.Title,
                Isbn = favorite.Book.Isbn,
                Description = favorite.Book.Description,
                CoverImageUrl = favorite.Book.CoverImageUrl,
                PublishedYear = favorite.Book.PublishedYear,
                Language = favorite.Book.Language,
                PageCount = favorite.Book.PageCount,
                TotalCopies = favorite.Book.TotalCopies,
                AvailableCopies = favorite.Book.AvailableCopies,
                AverageRating = favorite.Book.AverageRating,
                AuthorNames = favorite.Book.Authors.Select(author => author.Name).ToList(),
                CategoryNames = favorite.Book.Categories.Select(category => category.Name).ToList(),
                CopyLocations = new List<string>(),
                CreatedAt = favorite.Book.CreatedAt,
                UpdatedAt = favorite.Book.UpdatedAt
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IReadOnlyList<BookDto>>.Ok(favorites));
    }

    [HttpPost("{bookId:guid}")]
    public async Task<IActionResult> Add(Guid bookId, CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        var bookExists = await db.Books.AnyAsync(book => book.Id == bookId, ct);
        if (!bookExists)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy sách."));

        var favorite = await db.ReaderFavorites.FindAsync([readerId, bookId], ct);
        if (favorite is null)
        {
            db.ReaderFavorites.Add(new ReaderFavorite
            {
                ReaderId = readerId,
                BookId = bookId,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync(ct);
        }

        return Ok(ApiResponse<bool>.Ok(true, new { message = "Đã thêm sách vào danh sách yêu thích." }));
    }

    [HttpDelete("{bookId:guid}")]
    public async Task<IActionResult> Remove(Guid bookId, CancellationToken ct)
    {
        var readerId = CirculationService.ReadUserId(User);
        var favorite = await db.ReaderFavorites.FindAsync([readerId, bookId], ct);
        if (favorite is not null)
        {
            db.ReaderFavorites.Remove(favorite);
            await db.SaveChangesAsync(ct);
        }

        return NoContent();
    }
}
