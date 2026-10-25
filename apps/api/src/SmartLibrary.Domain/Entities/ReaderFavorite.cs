namespace SmartLibrary.Domain.Entities;

public sealed class ReaderFavorite
{
    public Guid ReaderId { get; set; }
    public Guid BookId { get; set; }
    public DateTime CreatedAt { get; set; }

    public UserProfile Reader { get; set; } = null!;
    public Book Book { get; set; } = null!;
}
