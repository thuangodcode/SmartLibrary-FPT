using SmartLibrary.Domain.Common;

namespace SmartLibrary.Domain.Entities;

public class NewsComment : AuditableEntity
{
    public Guid NewsArticleId { get; set; }
    public Guid AuthorId { get; set; }
    public Guid? ParentCommentId { get; set; }
    public string Content { get; set; } = string.Empty;
    public bool IsDeleted { get; set; }

    public NewsArticle NewsArticle { get; set; } = null!;
    public UserProfile Author { get; set; } = null!;
    public NewsComment? ParentComment { get; set; }
    public ICollection<NewsComment> Replies { get; set; } = new List<NewsComment>();
}
