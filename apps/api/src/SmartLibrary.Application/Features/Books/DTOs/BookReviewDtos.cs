using System.ComponentModel.DataAnnotations;

namespace SmartLibrary.Application.Features.Books.DTOs;

/// <summary>Review and rating visible on a book detail page.</summary>
public sealed record BookReviewDto(
    Guid Id,
    string ReaderName,
    int Rating,
    string? Comment,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsMine);

/// <summary>Reader-provided rating and optional comment for a book.</summary>
public sealed record SaveBookReviewRequest
{
    /// <summary>Rating from one to five stars.</summary>
    [Range(1, 5)]
    public int Rating { get; init; }

    /// <summary>Optional review text, up to 2000 characters.</summary>
    [MaxLength(2000)]
    public string? Comment { get; init; }
}
