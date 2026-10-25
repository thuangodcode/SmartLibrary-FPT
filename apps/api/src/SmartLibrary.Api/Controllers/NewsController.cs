using System.Text.Json;
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
