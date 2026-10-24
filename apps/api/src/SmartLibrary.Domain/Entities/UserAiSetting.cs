using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

/// <summary>Per-librarian AI credential. The raw key is never stored in plain text.</summary>
public class UserAiSetting : BaseEntity
{
    public Guid UserId { get; set; }
    public string? EncryptedApiKey { get; set; }
    public string? ApiKeyLast4 { get; set; }
    public string Provider { get; set; } = "gemini";
    public string ChatModel { get; set; } = "gemini-3.8-flash";
    public string EmbeddingModel { get; set; } = "gemini-embedding-001";
    public string? BaseUrl { get; set; }
    public string? ProviderKeysJson { get; set; }
    public bool IsEnabled { get; set; } = true;
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public DateTime? LastUsedAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
