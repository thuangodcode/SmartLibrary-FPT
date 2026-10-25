namespace SmartLibrary.Application.Features.Rag.DTOs;

public class RagAskRequest
{
    public string Question { get; set; } = string.Empty;
}

public class RagSourceDto
{
    public string SourceType { get; set; } = string.Empty;
    public Guid SourceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public double Score { get; set; }
    public string? Author { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Isbn { get; set; }
    public string? Code { get; set; }
    public int? PublishedYear { get; set; }
    public int AvailableCopies { get; set; }
    public int TotalCopies { get; set; }
    public string? Location { get; set; }
    public IReadOnlyList<string> Categories { get; set; } = Array.Empty<string>();
    public string? MatchLabel { get; set; }
}

public class RagAskResultDto
{
    public string Answer { get; set; } = string.Empty;
    public IReadOnlyList<RagSourceDto> Sources { get; set; } = Array.Empty<RagSourceDto>();
}

public class RagSearchHit
{
    public Guid Id { get; set; }
    public string SourceType { get; set; } = string.Empty;
    public Guid SourceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public double Score { get; set; }
    public string? Author { get; set; }
    public string? CoverImageUrl { get; set; }
    public string? Isbn { get; set; }
    public string? Language { get; set; }
    public string? Code { get; set; }
    public int? PublishedYear { get; set; }
    public int AvailableCopies { get; set; }
    public int TotalCopies { get; set; }
    public string? Location { get; set; }
    public IReadOnlyList<string> Categories { get; set; } = Array.Empty<string>();
}

public class RagReindexResultDto
{
    public int BooksIndexed { get; set; }
    public int PoliciesIndexed { get; set; }
    public int SkippedUnchanged { get; set; }
    public int Failed { get; set; }
    public int DocumentCount { get; set; }
    public DateTime SyncedAt { get; set; }
}

public class RagReindexJobDto
{
    public Guid JobId { get; set; }
    public string Status { get; set; } = "queued";
    public int CompletedItems { get; set; }
    public int TotalItems { get; set; }
    public string Message { get; set; } = string.Empty;
    public RagReindexResultDto? Result { get; set; }
}
