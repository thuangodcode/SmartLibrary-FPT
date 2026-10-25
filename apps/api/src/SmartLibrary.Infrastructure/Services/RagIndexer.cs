using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public class RagIndexer : IRagIndexer
{
    private readonly AppDbContext _db;
    private readonly IRagDocumentRepository _documents;
    private readonly AiSettingsService _settings;
    private readonly IGeminiClient _gemini;
    private readonly ILogger<RagIndexer> _logger;

    public RagIndexer(
        AppDbContext db,
        IRagDocumentRepository documents,
        AiSettingsService settings,
        IGeminiClient gemini,
        ILogger<RagIndexer> logger)
    {
        _db = db;
        _documents = documents;
        _settings = settings;
        _gemini = gemini;
        _logger = logger;
    }

    public Task UpsertBookAsync(Guid bookId, CancellationToken ct = default)
        => UpsertByIdAsync("book", bookId, ct);

    public Task UpsertPolicyAsync(Guid policyId, CancellationToken ct = default)
        => UpsertByIdAsync("policy", policyId, ct);

    public Task DeleteAsync(string sourceType, Guid sourceId, CancellationToken ct = default)
        => _documents.DeleteBySourceAsync(sourceType, sourceId, ct);

    public async Task<RagReindexResultDto> ReindexAllAsync(CancellationToken ct = default)
    {
        var result = new RagReindexResultDto { SyncedAt = DateTime.UtcNow };
        var bookIds = await _db.Books.AsNoTracking()
            .Where(book => !book.IsDeleted)
            .Select(book => book.Id)
            .ToListAsync(ct);

        foreach (var bookId in bookIds)
        {
            try
            {
                Apply(result, await TryUpsertAsync("book", bookId, ct), isBook: true);
            }
            catch (Exception ex)
            {
                result.Failed++;
                _logger.LogWarning(ex, "Lỗi index sách {BookId}.", bookId);
            }
        }

        var policyIds = await _db.PolicyRules.AsNoTracking()
            .Where(policy => !policy.IsDeleted && policy.Status == PolicyRuleStatus.Active)
            .Select(policy => policy.Id)
            .ToListAsync(ct);

        foreach (var policyId in policyIds)
        {
            try
            {
                Apply(result, await TryUpsertAsync("policy", policyId, ct), isBook: false);
            }
            catch (Exception ex)
            {
                result.Failed++;
                _logger.LogWarning(ex, "Lỗi index chính sách {PolicyId}.", policyId);
            }
        }

        result.DocumentCount = await _documents.CountAsync(ct);
        result.SyncedAt = DateTime.UtcNow;
        return result;
    }

    private async Task UpsertByIdAsync(string sourceType, Guid sourceId, CancellationToken ct)
    {
        try
        {
            await TryUpsertAsync(sourceType, sourceId, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Không cập nhật được RAG cho {SourceType} {SourceId}.", sourceType, sourceId);
        }
    }

    private async Task<string> TryUpsertAsync(string sourceType, Guid sourceId, CancellationToken ct)
    {
        var payload = sourceType == "book"
            ? await BuildBookTextAsync(sourceId, ct)
            : await BuildPolicyTextAsync(sourceId, ct);

        if (payload is null)
        {
            await _documents.DeleteBySourceAsync(sourceType, sourceId, ct);
            return "deleted";
        }

        var title = payload.Value.Title;
        var content = payload.Value.Content;
        var hash = Sha256(content);
        var existing = await _documents.FindBySourceAsync(sourceType, sourceId, ct);
        if (existing is not null && existing.ContentHash == hash)
            return "skipped";

        var credential = await _settings.ResolveLibraryAsync(ct);
        if (!credential.IsSuccess || credential.Data is null)
            throw new InvalidOperationException("Chưa cấu hình API Key nên không tạo được embedding.");

        var cred = credential.Data;
        var embedding = await _gemini.EmbedAsync(
            cred.EmbeddingProvider,
            cred.EmbeddingApiKey,
            cred.EmbeddingModel,
            content,
            cred.EmbeddingBaseUrl,
            ct);
        await _documents.UpsertAsync(new RagDocument
        {
            Id = existing?.Id ?? Guid.NewGuid(),
            SourceType = sourceType,
            SourceId = sourceId,
            Title = title,
            Content = content,
            ContentHash = hash
        }, embedding, ct);
        return "indexed";
    }

    private async Task<(string Title, string Content)?> BuildBookTextAsync(Guid bookId, CancellationToken ct)
    {
        var book = await _db.Books.AsNoTracking()
            .Include(item => item.Authors)
            .Include(item => item.Categories)
            .FirstOrDefaultAsync(item => item.Id == bookId && !item.IsDeleted, ct);
        if (book is null)
            return null;

        var authors = string.Join(", ", book.Authors.Select(author => author.Name));
        var categories = string.Join(", ", book.Categories.Select(category => category.Name));
        var content = $"""
            Loại: sách
            Mã: {book.Code}
            Tên: {book.Title}
            Tác giả: {authors}
            Danh mục: {categories}
            ISBN: {book.Isbn}
            Năm: {book.PublishedYear}
            Ngôn ngữ: {book.Language}
            Mô tả: {book.Description}
            """;
        return (book.Title, content);
    }

    private async Task<(string Title, string Content)?> BuildPolicyTextAsync(Guid policyId, CancellationToken ct)
    {
        var policy = await _db.PolicyRules.AsNoTracking()
            .Include(item => item.Parameters)
            .FirstOrDefaultAsync(item => item.Id == policyId && !item.IsDeleted, ct);
        if (policy is null || policy.Status != PolicyRuleStatus.Active)
            return null;

        var parameters = string.Join(
            "; ",
            policy.Parameters.Select(param => $"{param.DisplayLabel ?? param.ParamKey}={param.ParamValue}"));
        var title = $"{policy.Code} · {policy.Name}";
        var content = $"""
            Loại: chính sách
            Mã: {policy.Code}
            Tên: {policy.Name}
            Nhóm: {policy.PolicyType}
            Mô tả: {policy.Description}
            Tham số: {parameters}
            """;
        return (title, content);
    }

    private static void Apply(RagReindexResultDto result, string status, bool isBook)
    {
        switch (status)
        {
            case "indexed":
                if (isBook) result.BooksIndexed++;
                else result.PoliciesIndexed++;
                break;
            case "skipped":
                result.SkippedUnchanged++;
                break;
            default:
                break;
        }
    }

    private static string Sha256(string text)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(text));
        return Convert.ToHexString(bytes);
    }
}
