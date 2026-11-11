using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

/// <summary>Singleton row for Gemini API configuration. The raw key is never stored in plain text.</summary>
public class AiSetting : BaseEntity
{
    public string? EncryptedApiKey { get; set; }
    public string? ApiKeyLast4 { get; set; }
    public string Provider { get; set; } = "gemini";
    public string ChatModel { get; set; } = "gemini-3.8-flash";
    public string EmbeddingModel { get; set; } = "gemini-embedding-001";
    public string? BaseUrl { get; set; }
    public string? ProviderKeysJson { get; set; }
    public string? LibrarianCriteriaJson { get; set; }
    public string? ReaderSuggestedQuestionsJson { get; set; }
    public bool IsEnabled { get; set; }
    public bool ReaderAiEnabled { get; set; }
    public bool LibrarianAiEnabled { get; set; }
    public bool RecommendEnabled { get; set; }
    public bool TrendsEnabled { get; set; }
    public bool OverduePredictEnabled { get; set; }
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public DateTime? DocumentsSyncedAt { get; set; }
    public int DocumentCount { get; set; }
    public Guid? ActiveLibrarianUserId { get; set; }
    public string? IndexEmbeddingModel { get; set; }
    public Guid? UpdatedBy { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
