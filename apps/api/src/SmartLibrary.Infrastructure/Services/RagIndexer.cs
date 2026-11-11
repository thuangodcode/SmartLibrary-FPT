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
using SmartLibrary.Infrastructure.Text;

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

    public async Task<RagReindexResultDto> ReindexAllAsync(
        CancellationToken ct = default,
        Action<int, int>? progress = null)
    {
        var result = new RagReindexResultDto { SyncedAt = DateTime.UtcNow };
        var credential = await _settings.ResolveLibraryAsync(ct);
        if (!credential.IsSuccess || credential.Data is null)
            throw new InvalidOperationException("Chưa cấu hình nhà cung cấp embedding nên không thể tạo embedding.");

        var books = await _db.Books.AsNoTracking()
            .Include(book => book.Authors)
            .Include(book => book.Categories)
            .Where(book => !book.IsDeleted)
            .ToListAsync(ct);
        var policies = await _db.PolicyRules.AsNoTracking()
            .Include(policy => policy.Parameters)
            .Where(policy => !policy.IsDeleted && policy.Status == PolicyRuleStatus.Active)
            .ToListAsync(ct);
        var sources = books.Select(book => ("book", book.Id))
            .Concat(policies.Select(policy => ("policy", policy.Id)))
            .ToList();
        var sourceIds = sources.Select(source => source.Id).ToHashSet();
        var existingDocuments = sourceIds.Count == 0
            ? new Dictionary<(string SourceType, Guid SourceId), RagDocument>()
            : (await _db.RagDocuments.AsNoTracking()
                    .Where(document => document.SourceType == "book" || document.SourceType == "policy")
                    .ToListAsync(ct))
                .Where(document => sourceIds.Contains(document.SourceId))
                .ToDictionary(document => (document.SourceType, document.SourceId));
        var totalItems = books.Count + policies.Count;
        var completedItems = 0;
        progress?.Invoke(completedItems, totalItems);

        foreach (var book in books)
        {
            try
            {
                var payload = BuildBookText(book);
                existingDocuments.TryGetValue(("book", book.Id), out var existing);
                var status = await UpsertPayloadAsync(
                    "book", book.Id, payload.Title, payload.Content, existing, credential.Data, ct);
                Apply(result, status, isBook: true);
            }
            catch (Exception ex)
            {
                result.Failed++;
                _logger.LogWarning(ex, "Lỗi index sách {BookId}.", book.Id);
            }
            progress?.Invoke(++completedItems, totalItems);
        }

        foreach (var policy in policies)
        {
            try
            {
                var payload = BuildPolicyText(policy);
                existingDocuments.TryGetValue(("policy", policy.Id), out var existing);
                var status = await UpsertPayloadAsync(
                    "policy", policy.Id, payload.Title, payload.Content, existing, credential.Data, ct);
                Apply(result, status, isBook: false);
            }
            catch (Exception ex)
            {
                result.Failed++;
                _logger.LogWarning(ex, "Lỗi index chính sách {PolicyId}.", policy.Id);
            }
            progress?.Invoke(++completedItems, totalItems);
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

        var credential = await _settings.ResolveLibraryAsync(ct);
        if (!credential.IsSuccess || credential.Data is null)
            throw new InvalidOperationException("Chưa cấu hình nhà cung cấp embedding nên không thể tạo embedding.");

        var existing = await _documents.FindBySourceAsync(sourceType, sourceId, ct);
        return await UpsertPayloadAsync(
            sourceType,
            sourceId,
            payload.Value.Title,
            payload.Value.Content,
            existing,
            credential.Data,
            ct);
    }

    private async Task<string> UpsertPayloadAsync(
        string sourceType,
        Guid sourceId,
        string title,
        string content,
        RagDocument? existing,
        AiRuntimeCredential cred,
        CancellationToken ct)
    {
        var hash = Sha256($"v2:{cred.EmbeddingProvider}:{cred.EmbeddingModel}\n{content}");
        if (existing is not null && existing.ContentHash == hash)
            return "skipped";

        var embeddingContent = cred.EmbeddingProvider == "local" ? $"passage: {content}" : content;
        var embedding = await _gemini.EmbedAsync(
            cred.EmbeddingProvider,
            cred.EmbeddingApiKey,
            cred.EmbeddingModel,
            embeddingContent,
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

        return BuildBookText(book);
    }

    private static (string Title, string Content) BuildBookText(SmartLibrary.Domain.Entities.Book book)
    {
        var authors = string.Join(", ", book.Authors.Select(author => author.Name));
        var categories = string.Join(", ", book.Categories.Select(category => category.Name));
        var majors = book.Majors.Count > 0
            ? string.Join(", ", book.Majors.Select(major => $"{major.Name} ({major.Code})"))
            : string.Empty;
        var languageLabel = BookLanguageText.SearchAliases(book.Language);

        var builder = new StringBuilder();

        // 1. Structured metadata
        builder.AppendLine($"Loại: sách");
        builder.AppendLine($"Mã: {book.Code}");
        builder.AppendLine($"Tên: {book.Title}");
        builder.AppendLine($"Tác giả: {authors}");
        builder.AppendLine($"Danh mục: {categories}");
        builder.AppendLine($"ISBN: {book.Isbn}");
        builder.AppendLine($"Năm xuất bản: {book.PublishedYear}");
        builder.AppendLine($"Ngôn ngữ: {languageLabel}");
        if (!string.IsNullOrWhiteSpace(majors))
            builder.AppendLine($"Ngành học liên quan: {majors}");

        // 2. Natural language description
        builder.AppendLine();
        if (!string.IsNullOrWhiteSpace(book.Description))
        {
            builder.AppendLine($"Mô tả: {book.Description}");
        }
        else
        {
            // Generate a minimal semantic description from metadata
            builder.AppendLine($"Cuốn sách \"{book.Title}\" của tác giả {authors} thuộc thể loại {categories}.");
        }

        // 3. Semantic enrichment: add cross-lingual synonyms & keywords
        var foldedContent = VietnameseText.Fold(builder.ToString());
        var enrichment = SemanticSynonyms.EnrichForEmbedding(foldedContent);
        if (!string.IsNullOrWhiteSpace(enrichment))
        {
            builder.AppendLine();
            builder.AppendLine($"Từ khóa ngữ nghĩa: {enrichment}");
        }

        // 4. Category-specific keywords for better cross-lingual matching
        foreach (var category in book.Categories)
        {
            var catKeywords = SemanticSynonyms.CategoryKeywords(category.Name);
            if (!string.IsNullOrWhiteSpace(catKeywords))
            {
                builder.AppendLine($"Chủ đề liên quan ({category.Name}): {catKeywords}");
            }
        }

        return (book.Title, builder.ToString().Trim());
    }

    private async Task<(string Title, string Content)?> BuildPolicyTextAsync(Guid policyId, CancellationToken ct)
    {
        var policy = await _db.PolicyRules.AsNoTracking()
            .Include(item => item.Parameters)
            .FirstOrDefaultAsync(item => item.Id == policyId && !item.IsDeleted, ct);
        if (policy is null || policy.Status != PolicyRuleStatus.Active)
            return null;

        return BuildPolicyText(policy);
    }

    private static (string Title, string Content) BuildPolicyText(PolicyRule policy)
    {
        var parameters = string.Join(
            "; ",
            policy.Parameters.Select(param => $"{param.DisplayLabel ?? param.ParamKey}={param.ParamValue}"));
        var title = $"{policy.Code} · {policy.Name}";

        var builder = new StringBuilder();
        builder.AppendLine($"Loại: chính sách thư viện (policy)");
        builder.AppendLine($"Mã: {policy.Code}");
        builder.AppendLine($"Tên: {policy.Name}");
        builder.AppendLine($"Nhóm: {policy.PolicyType}");
        builder.AppendLine($"Mô tả: {policy.Description}");
        builder.AppendLine($"Tham số: {parameters}");

        // Thêm context tự nhiên cho embedding hiểu rõ hơn
        builder.AppendLine();
        builder.AppendLine($"Chính sách \"{policy.Name}\" quy định về {policy.Description}");
        builder.AppendLine("Từ khóa: chính sách, quy định, thư viện, mượn sách, trả sách, gia hạn, phí phạt, "
            + "policy, library rules, borrowing, returning, renewal, fine, overdue");

        return (title, builder.ToString().Trim());
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
