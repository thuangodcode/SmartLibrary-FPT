namespace SmartLibrary.Application.Features.Ai.DTOs;

public class AiSettingsStatusDto
{
    public bool HasApiKey { get; set; }
    public string? ApiKey { get; set; }
    public string? ApiKeyLast4 { get; set; }
    public string Provider { get; set; } = "gemini";
    public string EmbeddingProvider { get; set; } = "gemini";
    public string ChatModel { get; set; } = "gemini-3.8-flash";
    public string EmbeddingModel { get; set; } = "gemini-embedding-001";
    public string? BaseUrl { get; set; }
    public bool IsEnabled { get; set; }
    public bool ReaderAiEnabled { get; set; }
    public bool LibrarianAiEnabled { get; set; }
    public bool UseMajor { get; set; } = true;
    public bool UseCategory { get; set; } = true;
    public bool UseHistory { get; set; } = true;
    public bool UseReviews { get; set; } = true;
    public bool UseGoals { get; set; } = true;
    public bool RecommendEnabled { get; set; }
    public bool TrendsEnabled { get; set; }
    public bool OverduePredictEnabled { get; set; }
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public DateTime? DocumentsSyncedAt { get; set; }
    public int DocumentCount { get; set; }
    public bool CanEditApiKey { get; set; }
    public bool AccountEnabled { get; set; } = true;
    public bool UseForLibrary { get; set; }
    public bool NeedsReindex { get; set; }
    public Guid? ActiveLibrarianUserId { get; set; }
    public string? LibraryLibrarianName { get; set; }
    public List<AiProviderStatusDto> Providers { get; set; } = [];
    public List<LibrarianAiAccountDto> LibrarianAccounts { get; set; } = [];
}

public class AiProviderStatusDto
{
    public string Id { get; set; } = "gemini";
    public bool HasApiKey { get; set; }
    public string? ApiKey { get; set; }
    public string? ApiKeyLast4 { get; set; }
    public string? ChatModel { get; set; }
    public string? EmbeddingModel { get; set; }
    public string? BaseUrl { get; set; }
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public bool IsActive { get; set; }
}

public class SaveAiSettingsRequest
{
    public string? Provider { get; set; }
    public string? EmbeddingProvider { get; set; }
    public string? ApiKey { get; set; }
    public string? ChatModel { get; set; }
    public string? EmbeddingModel { get; set; }
    public string? BaseUrl { get; set; }
    public bool? IsEnabled { get; set; }
    public bool? ReaderAiEnabled { get; set; }
    public bool? LibrarianAiEnabled { get; set; }
    public bool? RecommendEnabled { get; set; }
    public bool? TrendsEnabled { get; set; }
    public bool? OverduePredictEnabled { get; set; }
    public bool? ClearProvider { get; set; }
    public bool? UseForLibrary { get; set; }
}

public class SetLibrarianAccountRequest
{
    public bool IsEnabled { get; set; }
}

public class LibrarianAiAccountDto
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool HasApiKey { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsLibraryActive { get; set; }
    public string Provider { get; set; } = "gemini";
    public string ChatModel { get; set; } = string.Empty;
    public string EmbeddingModel { get; set; } = string.Empty;
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public DateTime? LastUsedAt { get; set; }
}

public class LibrarianAiAccountRow
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool HasApiKey { get; set; }
    public bool IsEnabled { get; set; } = true;
    public string Provider { get; set; } = "gemini";
    public string ChatModel { get; set; } = string.Empty;
    public string EmbeddingModel { get; set; } = string.Empty;
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public DateTime? LastUsedAt { get; set; }
}

public class SaveLibrarianAiSettingsRequest
{
    public bool LibrarianAiEnabled { get; set; }
    public bool? UseMajor { get; set; }
    public bool? UseCategory { get; set; }
    public bool? UseHistory { get; set; }
    public bool? UseReviews { get; set; }
    public bool? UseGoals { get; set; }
}

public class LibrarianCriteriaFlags
{
    public bool UseMajor { get; set; } = true;
    public bool UseCategory { get; set; } = true;
    public bool UseHistory { get; set; } = true;
    public bool UseReviews { get; set; } = true;
    public bool UseGoals { get; set; } = true;
}

public class TestAiConnectionRequest
{
    public string? Provider { get; set; }
}

public class AiConnectionTestDto
{
    public bool Ok { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime TestedAt { get; set; }
    public string Provider { get; set; } = "gemini";
}

public class StoredProviderState
{
    public string? EncryptedApiKey { get; set; }
    public string? ApiKeyLast4 { get; set; }
    public string? ChatModel { get; set; }
    public string? EmbeddingModel { get; set; }
    public string? BaseUrl { get; set; }
    public DateTime? LastTestedAt { get; set; }
    public bool? LastTestOk { get; set; }
    public string? LastTestMessage { get; set; }
    public bool IsEmbeddingProvider { get; set; }
}

public class AiBookSuggestionDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public int BorrowCount { get; set; }
    public string? Author { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Reason { get; set; }
    public int AvailableCopies { get; set; }
    public int TotalCopies { get; set; }
    public IReadOnlyList<string> Categories { get; set; } = Array.Empty<string>();
}

public class AiReadingTrendsDto
{
    public int Days { get; set; }
    public int Borrowed { get; set; }
    public int Returned { get; set; }
    public int Overdue { get; set; }
    public int DueSoon { get; set; }
}

public class AiCriterionDto
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public int Count { get; set; }
    public string Detail { get; set; } = string.Empty;
    public bool HasData { get; set; }
}

public class AiLibrarianWorkspaceDto
{
    public IReadOnlyList<AiCriterionDto> Criteria { get; set; } = [];
    public AiReadingTrendsDto Trends { get; set; } = new();
    public IReadOnlyList<AiBookSuggestionDto> TopBorrowed { get; set; } = [];
    public IReadOnlyList<AiOverdueRiskItemDto> OverdueRisks { get; set; } = [];
}

public class AiLibrarianSignals
{
    public int MajorCount { get; set; }
    public IReadOnlyList<string> MajorSamples { get; set; } = [];
    public int CategoryCount { get; set; }
    public IReadOnlyList<string> CategorySamples { get; set; } = [];
    public int BorrowCount { get; set; }
    public int ReviewCount { get; set; }
    public double? AverageRating { get; set; }
    public int PreferenceCount { get; set; }
    public AiReadingTrendsDto Trends { get; set; } = new();
    public IReadOnlyList<AiBookSuggestionDto> TopBorrowed { get; set; } = [];
    public IReadOnlyList<AiOverdueRiskItemDto> OverdueRisks { get; set; } = [];
}

public class AiOverdueRiskDto
{
    public IReadOnlyList<AiOverdueRiskItemDto> Items { get; set; } = [];
}

public class AiOverdueRiskItemDto
{
    public Guid LoanId { get; set; }
    public string ReaderName { get; set; } = string.Empty;
    public string BookTitle { get; set; } = string.Empty;
    public int OverdueDays { get; set; }
    public string Risk { get; set; } = "trung bình";
}
