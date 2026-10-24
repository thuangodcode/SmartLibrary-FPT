namespace SmartLibrary.Application.Features.Books;

public sealed class BookCatalogItem
{
    public Guid Id { get; init; }
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Code { get; init; } = string.Empty;
    public string? Isbn { get; init; }
    public string? Language { get; init; }
    public string? CoverImageUrl { get; init; }
    public int? PublishedYear { get; init; }
    public int AvailableCopies { get; init; }
    public int TotalCopies { get; init; }
    public IReadOnlyList<string> Authors { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> Categories { get; init; } = Array.Empty<string>();
    public IReadOnlyList<Guid> CategoryIds { get; init; } = Array.Empty<Guid>();
}

public interface IBookCatalogCache
{
    Task<IReadOnlyList<BookCatalogItem>> GetAsync(CancellationToken ct = default);
    void Invalidate();
}
