using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class BookEmbedding : BaseEntity
{
    public Guid BookId { get; set; }
    public float[] Embedding { get; set; } = Array.Empty<float>();
    public string Model { get; set; } = "text-embedding-3-small";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Book Book { get; set; } = null!;
}
