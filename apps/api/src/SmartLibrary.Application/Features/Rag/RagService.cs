using System.Text;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Rag;

public class RagService
{
    public const int MinQuestionLength = 3;
    public const int MaxQuestionLength = 4000;
    private const int MaxEmbedChars = 3000;
    private const double MinRelevantScore = 0.55;
    private const double ExactMatchScore = 0.9;

    private readonly AiSettingsService _settings;
    private readonly IGeminiClient _gemini;
    private readonly IRagDocumentRepository _documents;
    private readonly IRagIndexer _indexer;
    private readonly IAiWorkspaceRepository _workspace;
    private readonly INotificationInbox? _inbox;

    public RagService(
        AiSettingsService settings,
        IGeminiClient gemini,
        IRagDocumentRepository documents,
        IRagIndexer indexer,
        IAiWorkspaceRepository workspace,
        INotificationInbox? inbox = null)
    {
        _settings = settings;
        _gemini = gemini;
        _documents = documents;
        _indexer = indexer;
        _workspace = workspace;
        _inbox = inbox;
    }

    public Task<Result<RagAskResultDto>> AskAsync(string question, string role, CancellationToken ct = default)
        => AskAsync(question, role, null, ct);

    public async Task<Result<RagAskResultDto>> AskAsync(
        string question,
        string role,
        Guid? userId,
        CancellationToken ct = default)
    {
        var query = question?.Trim() ?? string.Empty;
        if (query.Length < MinQuestionLength)
            return Result<RagAskResultDto>.Failure("Câu hỏi cần ít nhất 3 ký tự.");
        if (query.Length > MaxQuestionLength)
            return Result<RagAskResultDto>.Failure($"Câu hỏi tối đa {MaxQuestionLength} ký tự.");

        var credential = await _settings.ResolveForAskAsync(role, userId, ct);
        if (!credential.IsSuccess)
            return Result<RagAskResultDto>.Failure(credential.Error ?? "Chưa cấu hình API Key.");

        var cred = credential.Data!;
        var parts = SearchTopicGuard.SplitIntents(query);
        if (parts.All(part => SearchTopicGuard.Parse(part).NeedsClarification))
            return Ok(SearchTopicGuard.ClarifyMessage(SearchTopicGuard.Parse(query)), []);

        try
        {
            var (hits, exact) = await RetrieveAsync(cred, query, ct);
            if (hits.Count == 0)
                return Ok(EmptyAnswer(query), []);

            var listing = ExplainLocally(query, hits);
            var answer = exact
                ? listing
                : await ExplainWithAiAsync(cred, query, hits, listing, ct);

            return Ok(string.IsNullOrWhiteSpace(answer) ? listing : answer.Trim(), hits.Select(MapSource).ToList());
        }
        catch (Exception ex)
        {
            await NotifyCredentialAsync(cred.OwnerUserId, ex.Message, ct);
            return Result<RagAskResultDto>.Failure(Sanitize(ex.Message));
        }
    }

    public async Task<Result<RagReindexResultDto>> ReindexAsync(
        string role,
        Guid? userId = null,
        CancellationToken ct = default)
    {
        var policy = await _settings.GetEntityAsync(ct);
        var isDesignated = userId is Guid id
            && id != Guid.Empty
            && policy.ActiveLibrarianUserId == id
            && AiSettingsService.IsLibrarianOnly(role);
        if (!AiSettingsService.IsAdmin(role) && !isDesignated)
            return Result<RagReindexResultDto>.Failure("Chỉ Admin hoặc thủ thư đang dùng cho thư viện được đồng bộ RAG.");

        var credential = await _settings.ResolveLibraryAsync(ct);
        if (!credential.IsSuccess)
            return Result<RagReindexResultDto>.Failure("Chưa cấu hình API Key nên không tạo được embedding.");

        try
        {
            var result = await _indexer.ReindexAllAsync(ct);
            await _settings.UpdateSyncStatsAsync(
                result.SyncedAt, result.DocumentCount, credential.Data!.EmbeddingModel, ct);
            return Result<RagReindexResultDto>.Success(result);
        }
        catch (Exception ex)
        {
            await NotifyCredentialAsync(credential.Data?.OwnerUserId, ex.Message, ct);
            return Result<RagReindexResultDto>.Failure(Sanitize(ex.Message));
        }
    }

    public async Task<Result<RagAskResultDto>> SuggestAcquisitionsAsync(
        string role,
        Guid? userId = null,
        CancellationToken ct = default)
    {
        if (!AiSettingsService.IsStaff(role))
            return Result<RagAskResultDto>.Failure("Chỉ Thủ thư hoặc Admin xem gợi ý nhập sách.");

        var settings = await _settings.GetEntityAsync(ct);
        if (!settings.LibrarianAiEnabled)
            return Result<RagAskResultDto>.Failure("Gợi ý nhập sách AI đang tắt.");

        return await AskAsync(
            $"""
            Dựa trên sách và chính sách hiện có, hãy gợi ý các đầu sách thư viện đại học FPT HCMC nên bổ sung.
            Ưu tiên các tiêu chí thủ thư đã bật: {await BuildAcquisitionHintAsync(settings, ct)}
            Nêu lý do ngắn cho từng gợi ý. Không bịa ISBN.
            """,
            role,
            userId,
            ct);
    }

    private async Task<(IReadOnlyList<RagSearchHit> Hits, bool Exact)> RetrieveAsync(
        AiRuntimeCredential cred,
        string query,
        CancellationToken ct)
    {
        var parts = SearchTopicGuard.SplitIntents(query);
        if (parts.Count == 1)
            return await RetrieveOneAsync(cred, parts[0], ct);

        var combined = new List<RagSearchHit>();
        var exact = false;
        foreach (var part in parts)
        {
            if (SearchTopicGuard.Parse(part).NeedsClarification)
                continue;
            var retrieved = await RetrieveOneAsync(cred, part, ct);
            exact |= retrieved.Exact;
            combined.AddRange(retrieved.Hits);
        }

        var limit = Math.Clamp(Math.Max(8, parts.Count * 3), 8, 20);
        var merged = MergeHits(combined, []).Take(limit).ToList();
        return (merged, exact && merged.Count > 0);
    }

    private async Task<(IReadOnlyList<RagSearchHit> Hits, bool Exact)> RetrieveOneAsync(
        AiRuntimeCredential cred,
        string query,
        CancellationToken ct)
    {
        var intent = SearchTopicGuard.Parse(query);
        var catalog = await _documents.SearchCatalogAsync(query, 15, ct);
        var catalogOnTopic = SearchTopicGuard.Filter(query, catalog);
        var exact = catalogOnTopic.Any(hit => hit.Score >= ExactMatchScore)
                    || (intent.Topics.Count > 0 && catalogOnTopic.Count > 0);
        var semantic = new List<RagSearchHit>();
        var skipSemantic = catalogOnTopic.Count > 0
            || intent.Language is not null
            || intent.Domain is "math" or "python" or "grammar" or "hardware" or "multi"
            || intent.Topics.Count > 0;

        if (!exact && !skipSemantic && await _documents.CountAsync(ct) > 0)
        {
            try
            {
                var embedding = await _gemini.EmbedAsync(
                    cred.Provider, cred.ApiKey, cred.EmbeddingModel, EmbedText(query), cred.BaseUrl, ct);
                semantic.AddRange((await _documents.SearchAsync(embedding, 8, ct))
                    .Where(hit => hit.Score >= MinRelevantScore));
            }
            catch (Exception ex)
            {
                await NotifyCredentialAsync(cred.OwnerUserId, ex.Message, ct);
            }
        }

        var merged = MergeHits(catalog, semantic);
        var withFacts = semantic.Count == 0 ? merged : await _documents.AttachBookFactsAsync(merged, ct);
        var onTopic = SearchTopicGuard.Filter(query, withFacts).Take(15).ToList();
        return (onTopic, exact && onTopic.Count > 0);
    }

    private async Task<string> ExplainWithAiAsync(
        AiRuntimeCredential cred,
        string query,
        IReadOnlyList<RagSearchHit> hits,
        string listing,
        CancellationToken ct)
    {
        try
        {
            using var generateCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            generateCts.CancelAfter(TimeSpan.FromSeconds(6));
            var prompt = $"""
                Bạn là trợ lý thư viện SmartLibrary của FPT University TP. Hồ Chí Minh.
                Chỉ giải thích các đầu sách/chính sách đã truy xuất bên dưới.
                Không thêm sách khác. Không bịa tên sách, tác giả, ISBN, mã sách, số lượng hoặc tình trạng mượn.
                Trả lời tiếng Việt, tối đa 80 từ.

                Sách đã truy xuất:
                {BuildContext(hits)}

                Câu hỏi: {query}
                """;
            return await _gemini.GenerateAsync(
                cred.Provider, cred.ApiKey, cred.ChatModel, prompt, cred.BaseUrl, generateCts.Token);
        }
        catch (Exception ex)
        {
            await NotifyCredentialAsync(cred.OwnerUserId, ex.Message, ct);
            return listing;
        }
    }

    private async Task<string> BuildAcquisitionHintAsync(AiSetting settings, CancellationToken ct)
    {
        var flags = AiSettingsService.ReadCriteria(settings);
        try
        {
            var signals = await _workspace.GetSignalsAsync(30, ct);
            var parts = new List<string>();
            if (flags.UseMajor && signals.MajorCount > 0)
                parts.Add($"chuyên ngành {string.Join(", ", signals.MajorSamples)}");
            if (flags.UseCategory && signals.CategoryCount > 0)
                parts.Add($"thể loại {string.Join(", ", signals.CategorySamples)}");
            if (flags.UseHistory && signals.BorrowCount > 0)
                parts.Add($"lịch sử mượn ({signals.BorrowCount} lượt)");
            if (flags.UseReviews && signals.ReviewCount > 0)
                parts.Add($"đánh giá bạn đọc ({signals.ReviewCount} lượt)");
            if (flags.UseGoals && signals.PreferenceCount > 0)
                parts.Add($"sở thích đọc đã lưu ({signals.PreferenceCount} hồ sơ)");
            if (parts.Count == 0)
                return "Không có tiêu chí nào được bật.";

            var popular = signals.TopBorrowed.Count == 0
                ? string.Empty
                : " Sách đang được mượn nhiều: " + string.Join(", ", signals.TopBorrowed.Select(item => item.Title));
            return string.Join("; ", parts) + "." + popular;
        }
        catch (Exception)
        {
            return "Chưa đọc được thống kê lưu thông, chỉ dùng kho RAG.";
        }
    }

    private static Result<RagAskResultDto> Ok(string answer, IReadOnlyList<RagSourceDto> sources)
        => Result<RagAskResultDto>.Success(new RagAskResultDto { Answer = answer, Sources = sources });

    private static string EmbedText(string question)
        => question.Length <= MaxEmbedChars ? question : question[..MaxEmbedChars];

    private static string EmptyAnswer(string query)
    {
        var intent = SearchTopicGuard.Parse(query);
        if (intent.Topics.Count > 0)
        {
            var labels = string.Join(" và ", intent.Topics.Select(SearchTopicGuard.TopicLabel));
            return $"Thư viện chưa có sách khớp chủ đề {labels}. Không lấy sách khác để thay thế.";
        }

        if (intent.Language == "japanese")
        {
            return intent.Domain is "it" or "business" or "vocabulary"
                ? "Thư viện chưa có sách khớp chủ đề tiếng Nhật này. Thử đổi từ khóa hoặc nêu đúng chuyên ngành."
                : "Thư viện chưa có sách khớp chủ đề tiếng Nhật này. Thử từ khóa cụ thể hơn, ví dụ tiếng Nhật thương mại hoặc tiếng Nhật công nghệ thông tin.";
        }

        return "Thư viện chưa có sách khớp chủ đề này.";
    }

    private static string ExplainLocally(string query, IReadOnlyList<RagSearchHit> hits)
    {
        var books = hits.Where(hit => hit.SourceType == "book").ToList();
        var intent = SearchTopicGuard.Parse(query);
        if (books.Count == 0)
            return EmptyAnswer(query);

        var builder = new StringBuilder();
        if (intent.Topics.Count > 1)
        {
            foreach (var topic in intent.Topics)
            {
                var match = books.FirstOrDefault(book => SearchTopicGuard.MatchesTopic(
                    topic, $"{book.Title} {book.Content} {book.Author} {string.Join(' ', book.Categories)}"));
                if (match is null)
                    builder.Append("Thư viện chưa có sách về ").Append(SearchTopicGuard.TopicLabel(topic)).Append(". ");
                else
                    builder.Append("Nhu cầu ").Append(SearchTopicGuard.TopicLabel(topic))
                        .Append(": ").Append(match.Title)
                        .Append(string.IsNullOrWhiteSpace(match.Author) ? ". " : " · " + match.Author + ". ");
            }

            return builder.ToString().Trim();
        }

        builder.Append("Đã tìm thấy ").Append(books.Count).Append(" đầu sách trong thư viện. ");
        foreach (var book in books.Take(4))
        {
            builder.Append(book.Title);
            if (!string.IsNullOrWhiteSpace(book.Author))
                builder.Append(" · ").Append(book.Author);
            builder.Append(". ");
        }

        if (intent.Language == "japanese" && intent.Domain is null)
            builder.Append("Bạn muốn lọc theo chuyên ngành nào (thương mại, công nghệ thông tin, kỹ thuật)?");

        return builder.ToString().Trim();
    }

    private static IReadOnlyList<RagSearchHit> MergeHits(
        IReadOnlyList<RagSearchHit> catalog,
        IReadOnlyList<RagSearchHit> semantic)
    {
        var merged = new Dictionary<string, RagSearchHit>(StringComparer.Ordinal);
        foreach (var hit in catalog.Concat(semantic))
        {
            var key = $"{hit.SourceType}:{hit.SourceId}";
            if (!merged.TryGetValue(key, out var existing) || hit.Score > existing.Score)
                merged[key] = hit;
        }

        return merged.Values
            .OrderByDescending(hit => hit.Score >= ExactMatchScore)
            .ThenByDescending(hit => hit.Score)
            .ThenBy(hit => hit.Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static RagSourceDto MapSource(RagSearchHit hit) => new()
    {
        SourceType = hit.SourceType,
        SourceId = hit.SourceId,
        Title = hit.Title,
        Score = Math.Round(hit.Score, 4),
        Author = hit.Author ?? ExtractAuthor(hit.Content),
        CoverImageUrl = hit.CoverImageUrl,
        Isbn = hit.Isbn,
        Code = hit.Code,
        PublishedYear = hit.PublishedYear,
        AvailableCopies = hit.AvailableCopies,
        TotalCopies = hit.TotalCopies,
        Location = hit.Location,
        Categories = hit.Categories,
        MatchLabel = SearchTopicGuard.MatchLabel(hit.Score)
    };

    private static string? ExtractAuthor(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return null;
        const string marker = "Tác giả:";
        var index = content.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
            return null;
        var line = content[(index + marker.Length)..];
        var end = line.IndexOfAny(['\r', '\n']);
        var value = (end < 0 ? line : line[..end]).Trim();
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string BuildContext(IReadOnlyList<RagSearchHit> hits)
    {
        var builder = new StringBuilder();
        var index = 1;
        foreach (var hit in hits)
        {
            var snippet = hit.Content.Length > 700 ? hit.Content[..700] + "…" : hit.Content;
            builder.AppendLine($"[{index}] ({hit.SourceType}) {hit.Title}");
            builder.AppendLine(snippet);
            builder.AppendLine();
            index++;
        }
        return builder.ToString();
    }

    private async Task NotifyCredentialAsync(Guid? ownerId, string message, CancellationToken ct)
    {
        if (_inbox is null || ownerId is not Guid id || id == Guid.Empty)
            return;
        try
        {
            await _inbox.NotifyAiCredentialAsync(id, message, ct);
        }
        catch (Exception)
        {
            // Never hide the original Gemini error behind a notification failure.
        }
    }

    private static string Sanitize(string message)
    {
        var text = message.Replace("apiKey=", "apiKey=***", StringComparison.OrdinalIgnoreCase);
        if (text.Contains("embedding", StringComparison.OrdinalIgnoreCase)
            && (text.Contains("not found", StringComparison.OrdinalIgnoreCase)
                || text.Contains("not supported", StringComparison.OrdinalIgnoreCase)
                || text.Contains("no longer available", StringComparison.OrdinalIgnoreCase)))
        {
            return "Model embedding Gemini hiện không dùng được. Chọn gemini-embedding-001 rồi đồng bộ lại RAG.";
        }

        if (text.Contains("no longer available", StringComparison.OrdinalIgnoreCase)
            || (text.Contains("generateContent", StringComparison.OrdinalIgnoreCase)
                && text.Contains("not found", StringComparison.OrdinalIgnoreCase))
            || (text.Contains("gemini", StringComparison.OrdinalIgnoreCase)
                && text.Contains("notfound", StringComparison.OrdinalIgnoreCase)))
        {
            return "Model chat Gemini hiện không dùng được. Admin hãy chọn gemini-3.8-flash rồi lưu cấu hình.";
        }

        return text.Length <= 280 ? text : text[..280];
    }
}
