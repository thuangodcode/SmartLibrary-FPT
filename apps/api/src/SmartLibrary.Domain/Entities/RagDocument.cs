using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

/// <summary>One RAG chunk per book or policy. The embedding vector lives in Postgres (pgvector), not on this entity.</summary>
public class RagDocument : BaseEntity
{
    public string SourceType { get; set; } = string.Empty;
    public Guid SourceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public string ContentHash { get; set; } = string.Empty;
    public DateTime IndexedAt { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
