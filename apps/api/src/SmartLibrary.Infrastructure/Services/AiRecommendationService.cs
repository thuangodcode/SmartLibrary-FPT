using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public class AiRecommendationService : IAiRecommendationService
{
    private readonly AppDbContext _db;
    private readonly IRagDocumentRepository _documents;
    private readonly IGeminiClient _gemini;
    private readonly AiSettingsService _settings;

    public AiRecommendationService(
        AppDbContext db,
        IRagDocumentRepository documents,
        IGeminiClient gemini,
        AiSettingsService settings)
    {
        _db = db;
        _documents = documents;
        _gemini = gemini;
        _settings = settings;
    }

    public async Task<IReadOnlyList<Book>> GetRecommendationsAsync(Guid userId, int count = 10, CancellationToken ct = default)
    {
        var settings = await _settings.GetEntityAsync(ct);
        if (!settings.IsEnabled || !settings.RecommendEnabled)
            return Array.Empty<Book>();

        var criteria = AiSettingsService.ReadCriteria(settings);
        var take = Math.Clamp(count, 1, 12);
        var categoryIds = new List<Guid>();
        var majorIds = new List<Guid>();

        if (criteria.UseGoals || criteria.UseCategory || criteria.UseMajor)
        {
            var prefs = await _db.ReadingPreferences.AsNoTracking()
                .Where(item => item.UserId == userId)
                .Select(item => new { item.CategoryId, item.MajorId })
                .ToListAsync(ct);
            if (criteria.UseCategory || criteria.UseGoals)
                categoryIds = prefs.Where(item => item.CategoryId != null).Select(item => item.CategoryId!.Value).Distinct().ToList();
            if (criteria.UseMajor)
                majorIds = prefs.Where(item => item.MajorId != null).Select(item => item.MajorId!.Value).Distinct().ToList();
        }

        var borrowedBookIds = criteria.UseHistory
            ? await (
                from loan in _db.BorrowRecords.AsNoTracking()
                join copy in _db.BookCopies.AsNoTracking() on loan.BookCopyId equals copy.Id
                where loan.ReaderId == userId && !loan.IsDeleted
                select copy.BookId)
                .Distinct()
                .ToListAsync(ct)
            : [];

        var likedBookIds = criteria.UseReviews
            ? await _db.Reviews.AsNoTracking()
                .Where(item => item.ReaderId == userId && !item.IsDeleted && item.Rating >= 4)
                .Select(item => item.BookId)
                .Distinct()
                .ToListAsync(ct)
            : [];

        var seedIds = borrowedBookIds.Concat(likedBookIds).Distinct().ToList();
        if (seedIds.Count > 0 && (criteria.UseCategory || criteria.UseGoals))
        {
            var fromHistory = await _db.Books.AsNoTracking()
                .Where(book => seedIds.Contains(book.Id) && !book.IsDeleted)
                .SelectMany(book => book.Categories.Select(category => category.Id))
                .Distinct()
                .ToListAsync(ct);
            categoryIds = categoryIds.Concat(fromHistory).Distinct().ToList();
        }

        if (categoryIds.Count == 0 && majorIds.Count == 0 && seedIds.Count == 0)
            return Array.Empty<Book>();

        var rankedIds = await RankByRagAsync(categoryIds, take, ct);
        var query = _db.Books.AsNoTracking()
            .Include(book => book.Authors)
            .Include(book => book.Categories)
            .Include(book => book.Majors)
            .Where(book => !book.IsDeleted);

        if (rankedIds.Count > 0)
            query = query.Where(book => rankedIds.Contains(book.Id));
        else
            query = query.Where(book =>
                (categoryIds.Count > 0 && book.Categories.Any(category => categoryIds.Contains(category.Id)))
                || (majorIds.Count > 0 && book.Majors.Any(major => majorIds.Contains(major.Id)))
                || (seedIds.Count > 0 && seedIds.Contains(book.Id)));

        return await query
            .OrderByDescending(book => book.AverageRating)
            .ThenByDescending(book => book.AvailableCopies)
            .ThenBy(book => book.Title)
            .Take(take)
            .ToListAsync(ct);
    }

    private async Task<List<Guid>> RankByRagAsync(
        IReadOnlyCollection<Guid> categoryIds,
        int take,
        CancellationToken ct)
    {
        if (await _documents.CountAsync(ct) == 0)
            return [];

        var credential = await _settings.ResolveLibraryAsync(ct);
        if (!credential.IsSuccess || credential.Data is null)
            return [];
        if (!AiSettingsService.SupportsEmbedding(credential.Data.EmbeddingProvider))
            return [];

        try
        {
            var names = await _db.Categories.AsNoTracking()
                .Where(item => categoryIds.Contains(item.Id) && !item.IsDeleted)
                .Select(item => item.Name)
                .Take(8)
                .ToListAsync(ct);
            var prompt = names.Count == 0
                ? "Sách phù hợp với lịch sử đọc của độc giả FPT HCMC"
                : "Sách phù hợp độc giả FPT HCMC, thể loại: " + string.Join(", ", names);
            var cred = credential.Data;
            var embedding = await _gemini.EmbedAsync(
                cred.EmbeddingProvider,
                cred.EmbeddingApiKey,
                cred.EmbeddingModel,
                prompt,
                cred.EmbeddingBaseUrl,
                ct);
            return (await _documents.SearchAsync(embedding, take * 2, ct))
                .Where(hit => hit.SourceType == "book" && hit.Score >= 0.28)
                .Select(hit => hit.SourceId)
                .Distinct()
                .ToList();
        }
        catch (Exception)
        {
            return [];
        }
    }
}
