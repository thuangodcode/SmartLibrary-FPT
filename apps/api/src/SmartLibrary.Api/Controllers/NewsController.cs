using System.Text.Json;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Api.Hubs;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.News.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Api.Controllers;

[ApiController]
[Route("api/v1/news")]
public class NewsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly IStorageService _storageService;
    private readonly IHubContext<SupportChatHub> _hubContext;

    public NewsController(
        AppDbContext db,
        IStorageService storageService,
        IHubContext<SupportChatHub> hubContext)
    {
        _db = db;
        _storageService = storageService;
        _hubContext = hubContext;
    }

    /// <summary>
    /// Get published news and announcements (Public).
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? search = null,
        [FromQuery] string? category = null,
        [FromQuery] bool? isPinned = null,
        CancellationToken ct = default)
    {
        var query = _db.NewsArticles
            .AsNoTracking()
            .Where(x => x.IsPublished);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(x => x.Title.ToLower().Contains(s) || x.Summary.ToLower().Contains(s) || x.Content.ToLower().Contains(s));
        }

        if (!string.IsNullOrWhiteSpace(category) && category != "Tất cả")
        {
            var cat = category.Trim().ToLower();
            query = query.Where(x => x.Category.ToLower() == cat);
        }

        if (isPinned.HasValue)
        {
            query = query.Where(x => x.IsPinned == isPinned.Value);
        }

        var items = await query
            .OrderByDescending(x => x.IsPinned)
            .ThenByDescending(x => x.CreatedAt)
            .Select(x => new NewsArticleDto
            {
                Id = x.Id,
                Title = x.Title,
                Category = x.Category,
                Summary = x.Summary,
                Content = x.Content,
                ImageUrl = x.ImageUrl,
                IsPinned = x.IsPinned,
                IsPublished = x.IsPublished,
                AuthorName = x.AuthorName,
                CreatedAt = x.CreatedAt,
                UpdatedAt = x.UpdatedAt
            })
            .ToListAsync(ct);

        return Ok(ApiResponse<IReadOnlyList<NewsArticleDto>>.Ok(items));
    }

    /// <summary>
    /// Get single news article by ID (Public).
    /// </summary>
    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct = default)
    {
        var item = await _db.NewsArticles
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == id, ct);

        if (item is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài viết tin tức."));

        var dto = new NewsArticleDto
        {
            Id = item.Id,
            Title = item.Title,
            Category = item.Category,
            Summary = item.Summary,
            Content = item.Content,
            ImageUrl = item.ImageUrl,
            IsPinned = item.IsPinned,
            IsPublished = item.IsPublished,
            AuthorName = item.AuthorName,
            CreatedAt = item.CreatedAt,
            UpdatedAt = item.UpdatedAt
        };

        return Ok(ApiResponse<NewsArticleDto>.Ok(dto));
    }

    [HttpGet("{id:guid}/comments")]
    [AllowAnonymous]
    public async Task<IActionResult> GetComments(Guid id, CancellationToken ct = default)
    {
        var articleExists = await _db.NewsArticles.AsNoTracking()
            .AnyAsync(article => article.Id == id && article.IsPublished, ct);
        if (!articleExists)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài viết tin tức."));

        var comments = await _db.NewsComments.AsNoTracking()
            .Where(comment => comment.NewsArticleId == id)
            .OrderBy(comment => comment.CreatedAt)
            .Take(500)
            .Select(comment => new NewsCommentDto(
                comment.Id,
                comment.ParentCommentId,
                comment.AuthorId,
                comment.Author.FullName,
                comment.Author.AvatarUrl,
                comment.Author.Role.Name,
                comment.IsDeleted ? "Bình luận đã được ẩn bởi thư viện." : comment.Content,
                comment.IsDeleted,
                comment.CreatedAt,
                comment.UpdatedAt))
            .ToListAsync(ct);

        return Ok(ApiResponse<IReadOnlyList<NewsCommentDto>>.Ok(comments));
    }

    [HttpPost("{id:guid}/comments")]
    [Authorize]
    public async Task<IActionResult> CreateComment(
        Guid id,
        [FromBody] CreateNewsCommentRequest request,
        CancellationToken ct = default)
    {
        var isReader = User.IsInRole("Reader");
        var isLibraryStaff = User.IsInRole("Librarian") || User.IsInRole("Admin");
        if (!isReader && !isLibraryStaff)
            return Forbid();

        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var authorId))
            return Unauthorized(ApiResponse<object>.Fail("Không xác định được tài khoản độc giả."));

        var articleExists = await _db.NewsArticles.AnyAsync(article => article.Id == id && article.IsPublished, ct);
        if (!articleExists)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài viết tin tức."));

        var content = request.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content) || content.Length > 2000)
            return BadRequest(ApiResponse<object>.Fail("Bình luận phải có từ 1 đến 2.000 ký tự."));

        if (request.ParentCommentId.HasValue)
        {
            if (!isLibraryStaff)
                return Forbid();
            var parentExists = await _db.NewsComments.AnyAsync(comment =>
                comment.Id == request.ParentCommentId.Value
                && comment.NewsArticleId == id
                && comment.ParentCommentId == null
                && !comment.IsDeleted
                && comment.Author.Role.Name == "Reader", ct);
            if (!parentExists)
                return BadRequest(ApiResponse<object>.Fail("Không tìm thấy bình luận cần phản hồi."));
        }

        var now = DateTime.UtcNow;
        var comment = new NewsComment
        {
            Id = Guid.NewGuid(),
            NewsArticleId = id,
            AuthorId = authorId,
            ParentCommentId = request.ParentCommentId,
            Content = content,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.NewsComments.Add(comment);
        await _db.SaveChangesAsync(ct);

        var dto = await _db.NewsComments.AsNoTracking()
            .Where(item => item.Id == comment.Id)
            .Select(item => new NewsCommentDto(
                item.Id,
                item.ParentCommentId,
                item.AuthorId,
                item.Author.FullName,
                item.Author.AvatarUrl,
                item.Author.Role.Name,
                item.Content,
                item.IsDeleted,
                item.CreatedAt,
                item.UpdatedAt))
            .SingleAsync(ct);

        return CreatedAtAction(nameof(GetComments), new { id }, ApiResponse<NewsCommentDto>.Ok(dto));
    }

    [HttpPut("{id:guid}/comments/{commentId:guid}")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> UpdateComment(
        Guid id,
        Guid commentId,
        [FromBody] UpdateNewsCommentRequest request,
        CancellationToken ct = default)
    {
        var comment = await _db.NewsComments.FirstOrDefaultAsync(item =>
            item.Id == commentId && item.NewsArticleId == id && !item.IsDeleted, ct);
        if (comment is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bình luận."));

        var content = request.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content) || content.Length > 2000)
            return BadRequest(ApiResponse<object>.Fail("Bình luận phải có từ 1 đến 2.000 ký tự."));

        comment.Content = content;
        comment.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        var dto = await _db.NewsComments.AsNoTracking()
            .Where(item => item.Id == comment.Id)
            .Select(item => new NewsCommentDto(
                item.Id,
                item.ParentCommentId,
                item.AuthorId,
                item.Author.FullName,
                item.Author.AvatarUrl,
                item.Author.Role.Name,
                item.Content,
                item.IsDeleted,
                item.CreatedAt,
                item.UpdatedAt))
            .SingleAsync(ct);
        return Ok(ApiResponse<NewsCommentDto>.Ok(dto));
    }

    [HttpDelete("{id:guid}/comments/{commentId:guid}")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> DeleteComment(Guid id, Guid commentId, CancellationToken ct = default)
    {
        var comment = await _db.NewsComments.FirstOrDefaultAsync(item =>
            item.Id == commentId && item.NewsArticleId == id && !item.IsDeleted, ct);
        if (comment is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bình luận."));

        comment.Content = string.Empty;
        comment.IsDeleted = true;
        comment.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Create new announcement/news (Librarian/Admin only).
    /// Broadcasts in realtime to all readers & visitors.
    /// </summary>
    [HttpPost("form")]
    [Authorize(Policy = "LibrarianOnly")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> CreateFromForm([FromForm] CreateNewsForm form, CancellationToken ct = default)
    {
        var title = form.Title?.Trim();
        if (string.IsNullOrWhiteSpace(title))
            return BadRequest(ApiResponse<object>.Fail("Tiêu đề thông báo không được để trống."));

        var summary = form.Summary?.Trim();
        if (string.IsNullOrWhiteSpace(summary))
            summary = title;

        var content = form.Content?.Trim();
        if (string.IsNullOrWhiteSpace(content))
            content = summary;

        string? imageUrl = null;
        if (form.Image != null && form.Image.Length > 0)
        {
            await using var stream = form.Image.OpenReadStream();
            var ext = Path.GetExtension(form.Image.FileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".jpg";
            var safeName = $"{Guid.NewGuid():N}{ext}";
            imageUrl = await _storageService.UploadFileAsync(stream, safeName, "news", ct);
        }

        var article = new NewsArticle
        {
            Id = Guid.NewGuid(),
            Title = title,
            Category = string.IsNullOrWhiteSpace(form.Category) ? "Thông báo" : form.Category.Trim(),
            Summary = summary,
            Content = content,
            ImageUrl = imageUrl,
            IsPinned = form.IsPinned,
            IsPublished = true,
            AuthorName = string.IsNullOrWhiteSpace(form.AuthorName) ? "Ban Quản lý Thư viện FPT" : form.AuthorName.Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _db.NewsArticles.AddAsync(article, ct);

        // Add notification for readers so their inbox badge updates
        try
        {
            var readerIds = await _db.UserProfiles
                .AsNoTracking()
                .Where(u => u.Role.Name == "Reader" && !u.IsDeleted)
                .Select(u => u.Id)
                .Take(200)
                .ToListAsync(ct);

            foreach (var rId in readerIds)
            {
                await _db.Notifications.AddAsync(new Notification
                {
                    Id = Guid.NewGuid(),
                    UserId = rId,
                    Title = $"Thông báo mới: {article.Title}",
                    Message = article.Summary,
                    Type = "announcement",
                    IsRead = false,
                    Metadata = JsonSerializer.Serialize(new { href = "/news", newsId = article.Id }),
                    CreatedAt = DateTime.UtcNow
                }, ct);
            }
        }
        catch (Exception exNotice)
        {
            Serilog.Log.Warning(exNotice, "Could not bulk-insert reader notifications for new announcement.");
        }

        await _db.SaveChangesAsync(ct);

        var dto = new NewsArticleDto
        {
            Id = article.Id,
            Title = article.Title,
            Category = article.Category,
            Summary = article.Summary,
            Content = article.Content,
            ImageUrl = article.ImageUrl,
            IsPinned = article.IsPinned,
            IsPublished = article.IsPublished,
            AuthorName = article.AuthorName,
            CreatedAt = article.CreatedAt,
            UpdatedAt = article.UpdatedAt
        };

        // Realtime broadcast to all connected clients
        try
        {
            await _hubContext.Clients.All.SendAsync("AnnouncementPublished", dto, ct);
        }
        catch (Exception exSignalR)
        {
            Serilog.Log.Warning(exSignalR, "Failed to broadcast AnnouncementPublished via SignalR.");
        }

        return CreatedAtAction(nameof(GetById), new { id = article.Id }, ApiResponse<NewsArticleDto>.Ok(dto));
    }

    /// <summary>
    /// Update announcement/news (Librarian/Admin only).
    /// </summary>
    [HttpPut("{id:guid}/form")]
    [Authorize(Policy = "LibrarianOnly")]
    [Consumes("multipart/form-data")]
    public async Task<IActionResult> UpdateFromForm(Guid id, [FromForm] UpdateNewsForm form, CancellationToken ct = default)
    {
        var article = await _db.NewsArticles.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (article is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài viết tin tức."));

        var title = form.Title?.Trim();
        if (!string.IsNullOrWhiteSpace(title))
            article.Title = title;

        if (!string.IsNullOrWhiteSpace(form.Category))
            article.Category = form.Category.Trim();

        if (!string.IsNullOrWhiteSpace(form.Summary))
            article.Summary = form.Summary.Trim();

        if (!string.IsNullOrWhiteSpace(form.Content))
            article.Content = form.Content.Trim();

        article.IsPinned = form.IsPinned;

        if (!string.IsNullOrWhiteSpace(form.AuthorName))
            article.AuthorName = form.AuthorName.Trim();

        if (form.RemoveImage)
        {
            article.ImageUrl = null;
        }
        else if (form.Image != null && form.Image.Length > 0)
        {
            await using var stream = form.Image.OpenReadStream();
            var ext = Path.GetExtension(form.Image.FileName);
            if (string.IsNullOrWhiteSpace(ext)) ext = ".jpg";
            var safeName = $"{Guid.NewGuid():N}{ext}";
            article.ImageUrl = await _storageService.UploadFileAsync(stream, safeName, "news", ct);
        }

        article.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        var dto = new NewsArticleDto
        {
            Id = article.Id,
            Title = article.Title,
            Category = article.Category,
            Summary = article.Summary,
            Content = article.Content,
            ImageUrl = article.ImageUrl,
            IsPinned = article.IsPinned,
            IsPublished = article.IsPublished,
            AuthorName = article.AuthorName,
            CreatedAt = article.CreatedAt,
            UpdatedAt = article.UpdatedAt
        };

        // Realtime broadcast to all connected clients
        try
        {
            await _hubContext.Clients.All.SendAsync("AnnouncementUpdated", dto, ct);
        }
        catch (Exception exSignalR)
        {
            Serilog.Log.Warning(exSignalR, "Failed to broadcast AnnouncementUpdated via SignalR.");
        }

        return Ok(ApiResponse<NewsArticleDto>.Ok(dto));
    }

    /// <summary>
    /// Delete announcement/news (Librarian/Admin only).
    /// </summary>
    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "LibrarianOnly")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct = default)
    {
        var article = await _db.NewsArticles.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (article is null)
            return NotFound(ApiResponse<object>.Fail("Không tìm thấy bài viết tin tức."));

        _db.NewsArticles.Remove(article);
        await _db.SaveChangesAsync(ct);

        // Realtime broadcast delete
        try
        {
            await _hubContext.Clients.All.SendAsync("AnnouncementDeleted", new { id }, ct);
        }
        catch (Exception exSignalR)
        {
            Serilog.Log.Warning(exSignalR, "Failed to broadcast AnnouncementDeleted via SignalR.");
        }

        return Ok(ApiResponse<bool>.Ok(true));
    }
}
