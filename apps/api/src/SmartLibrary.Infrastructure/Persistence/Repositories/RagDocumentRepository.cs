using System.Data;
using System.Data.Common;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Text;

namespace SmartLibrary.Infrastructure.Persistence.Repositories;

public class RagDocumentRepository : IRagDocumentRepository
{
    private readonly AppDbContext _context;
    private readonly IBookCatalogCache _catalog;

    public RagDocumentRepository(AppDbContext context, IBookCatalogCache catalog)
    {
        _context = context;
        _catalog = catalog;
    }

    public Task<RagDocument?> FindBySourceAsync(string sourceType, Guid sourceId, CancellationToken ct = default)
        => _context.RagDocuments.FirstOrDefaultAsync(
            doc => doc.SourceType == sourceType && doc.SourceId == sourceId, ct);

    public async Task UpsertAsync(RagDocument document, float[] embedding, CancellationToken ct = default)
    {
        var vector = ToVectorLiteral(embedding);
        var now = DateTime.UtcNow;
        document.IndexedAt = now;
        document.UpdatedAt = now;
        if (document.CreatedAt == default)
            document.CreatedAt = now;

        await _context.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO rag_documents (
                id, source_type, source_id, title, content, content_hash, embedding, indexed_at, created_at, updated_at)
            VALUES (
                {document.Id}, {document.SourceType}, {document.SourceId}, {document.Title},
                {document.Content}, {document.ContentHash}, CAST({vector} AS extensions.vector),
                {document.IndexedAt}, {document.CreatedAt}, {document.UpdatedAt})
            ON CONFLICT (source_type, source_id) DO UPDATE SET
                title = EXCLUDED.title,
                content = EXCLUDED.content,
                content_hash = EXCLUDED.content_hash,
                embedding = EXCLUDED.embedding,
                indexed_at = EXCLUDED.indexed_at,
                updated_at = EXCLUDED.updated_at
            """, ct);
    }

    public async Task DeleteBySourceAsync(string sourceType, Guid sourceId, CancellationToken ct = default)
    {
        await _context.Database.ExecuteSqlInterpolatedAsync($"""
            DELETE FROM rag_documents
            WHERE source_type = {sourceType} AND source_id = {sourceId}
            """, ct);
    }

    public Task<IReadOnlyList<RagSearchHit>> SearchAsync(float[] embedding, int limit, CancellationToken ct = default)
        => SearchBySourceAsync(embedding, limit, null, ct);

    public Task<IReadOnlyList<RagSearchHit>> SearchPoliciesAsync(float[] embedding, int limit, CancellationToken ct = default)
        => SearchBySourceAsync(embedding, limit, "policy", ct);

    private async Task<IReadOnlyList<RagSearchHit>> SearchBySourceAsync(
        float[] embedding,
        int limit,
        string? sourceType,
        CancellationToken ct)
    {
        var vector = ToVectorLiteral(embedding);
        var safeLimit = Math.Clamp(limit, 1, 20);
        var connection = _context.Database.GetDbConnection();
        var shouldClose = connection.State != ConnectionState.Open;
        if (shouldClose)
            await _context.Database.OpenConnectionAsync(ct);

        try
        {
            await using var command = connection.CreateCommand();
            var sourceFilter = sourceType is null ? string.Empty : "AND source_type = @sourceType";
            command.CommandText = $"""
                SELECT id, source_type, source_id, title, left(content, 900) AS content,
                       (1 - (embedding <=> CAST(@vector AS extensions.vector)))::float8 AS score
                FROM rag_documents
                WHERE embedding IS NOT NULL
                  {sourceFilter}
                ORDER BY embedding <=> CAST(@vector AS extensions.vector)
                LIMIT @limit
                """;
            AddParameter(command, "vector", vector);
            AddParameter(command, "limit", safeLimit);
            if (sourceType is not null)
                AddParameter(command, "sourceType", sourceType);

            var hits = new List<RagSearchHit>();
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                hits.Add(new RagSearchHit
                {
                    Id = reader.GetGuid(0),
                    SourceType = reader.GetString(1),
                    SourceId = reader.GetGuid(2),
                    Title = reader.GetString(3),
                    Content = reader.IsDBNull(4) ? string.Empty : reader.GetString(4),
                    Score = reader.IsDBNull(5) ? 0 : reader.GetDouble(5)
                });
            }
            return hits;
        }
        finally
        {
            if (shouldClose)
                await _context.Database.CloseConnectionAsync();
        }
    }

    public async Task<IReadOnlyList<RagSearchHit>> SearchCatalogAsync(
        string question,
        int limit,
        CancellationToken ct = default)
    {
        var safeLimit = Math.Clamp(limit, 1, 20);
        var books = await _catalog.GetAsync(ct);
        if (books.Count == 0)
            return Array.Empty<RagSearchHit>();

        var ranked = books.Select(book =>
        {
            var authors = string.Join(", ", book.Authors);
            var score = BookKeywordRanker.Score(
                question,
                book.Title,
                book.Description,
                book.Code,
                book.Isbn,
                book.Authors,
                book.Categories,
                book.Language);
            return new { book, authors, score };
        })
            .Where(item => item.score > 0)
            .OrderByDescending(item => item.score)
            .ThenBy(item => item.book.Title)
            .Take(safeLimit)
            .ToList();

        return ranked.Select(item => new RagSearchHit
        {
            Id = item.book.Id,
            SourceType = "book",
            SourceId = item.book.Id,
            Title = item.book.Title,
            Content = string.IsNullOrWhiteSpace(item.book.Description) ? item.book.Title : item.book.Description,
            Score = Math.Round(item.score, 4),
            Author = string.IsNullOrWhiteSpace(item.authors) ? null : item.authors,
            CoverImageUrl = item.book.CoverImageUrl,
            Isbn = item.book.Isbn,
            Language = item.book.Language,
            Code = item.book.Code,
            PublishedYear = item.book.PublishedYear,
            AvailableCopies = item.book.AvailableCopies,
            TotalCopies = item.book.TotalCopies,
            Categories = item.book.Categories
        }).ToList();
    }

    public async Task<IReadOnlyList<RagSearchHit>> AttachBookFactsAsync(
        IReadOnlyList<RagSearchHit> hits,
        CancellationToken ct = default)
    {
        var bookIds = hits
            .Where(hit => hit.SourceType == "book")
            .Select(hit => hit.SourceId)
            .Distinct()
            .ToList();
        if (bookIds.Count == 0)
            return hits;

        var books = await _context.Books.AsNoTracking()
            .Where(book => bookIds.Contains(book.Id) && !book.IsDeleted)
            .Select(book => new
            {
                book.Id,
                book.Title,
                book.Description,
                book.Code,
                book.Isbn,
                book.Language,
                book.CoverImageUrl,
                book.PublishedYear,
                book.AvailableCopies,
                book.TotalCopies,
                Authors = book.Authors.Select(author => author.Name).ToList(),
                Categories = book.Categories.Select(category => category.Name).ToList()
            })
            .ToListAsync(ct);
        var lookup = books.ToDictionary(book => book.Id);
        var copyRows = await _context.BookCopies.AsNoTracking()
            .Where(copy => bookIds.Contains(copy.BookId) && !copy.IsDeleted)
            .Select(copy => new { copy.BookId, copy.IsAvailable, copy.Location })
            .ToListAsync(ct);
        var copies = copyRows
            .GroupBy(copy => copy.BookId)
            .ToDictionary(
                group => group.Key,
                group => (
                    Total: group.Count(),
                    Available: group.Count(copy => copy.IsAvailable),
                    Location: group.Select(copy => copy.Location).FirstOrDefault(location => !string.IsNullOrWhiteSpace(location))));

        return hits
            .Where(hit => hit.SourceType != "book" || lookup.ContainsKey(hit.SourceId))
            .Select(hit =>
            {
                if (hit.SourceType != "book" || !lookup.TryGetValue(hit.SourceId, out var book))
                    return hit;

                hit.Title = book.Title;
                hit.Author = book.Authors.Count == 0 ? hit.Author : string.Join(", ", book.Authors);
                hit.CoverImageUrl = book.CoverImageUrl;
                hit.Isbn = book.Isbn;
                hit.Language = book.Language;
                hit.Code = book.Code;
                hit.PublishedYear = book.PublishedYear;
                hit.Categories = book.Categories;
                if (copies.TryGetValue(book.Id, out var stats))
                {
                    hit.AvailableCopies = stats.Available;
                    hit.TotalCopies = stats.Total;
                    hit.Location = stats.Location;
                }
                else
                {
                    hit.AvailableCopies = book.AvailableCopies;
                    hit.TotalCopies = book.TotalCopies;
                }

                if (string.IsNullOrWhiteSpace(hit.Content))
                    hit.Content = book.Description ?? book.Title;
                return hit;
            }).ToList();
    }

    public Task<int> CountAsync(CancellationToken ct = default)
        => _context.RagDocuments.CountAsync(ct);

    private static string ToVectorLiteral(float[] values)
    {
        var parts = new string[values.Length];
        for (var i = 0; i < values.Length; i++)
            parts[i] = values[i].ToString("G9", CultureInfo.InvariantCulture);
        return "[" + string.Join(",", parts) + "]";
    }

    private static void AddParameter(DbCommand command, string name, object value)
    {
        var parameter = command.CreateParameter();
        parameter.ParameterName = name;
        parameter.Value = value;
        command.Parameters.Add(parameter);
    }
}
