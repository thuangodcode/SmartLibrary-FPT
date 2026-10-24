using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Application.Features.Ai;

public class AiInsightsService
{
    private readonly AiSettingsService _settings;
    private readonly IAiRecommendationService _recommendations;
    private readonly ICirculationRepository _circulation;
    private readonly IAiWorkspaceRepository _workspace;

    public AiInsightsService(
        AiSettingsService settings,
        IAiRecommendationService recommendations,
        ICirculationRepository circulation,
        IAiWorkspaceRepository workspace)
    {
        _settings = settings;
        _recommendations = recommendations;
        _circulation = circulation;
        _workspace = workspace;
    }

    public async Task<Result<AiLibrarianWorkspaceDto>> GetLibrarianWorkspaceAsync(
        string role,
        int days,
        CancellationToken ct = default)
    {
        if (!AiSettingsService.IsStaff(role))
            return Result<AiLibrarianWorkspaceDto>.Failure("Chỉ Admin hoặc Thủ thư xem dữ liệu AI nghiệp vụ.");

        var settings = await _settings.GetEntityAsync(ct);
        AiLibrarianSignals signals;
        try
        {
            signals = await _workspace.GetSignalsAsync(days, ct);
        }
        catch (Exception)
        {
            return Result<AiLibrarianWorkspaceDto>.Failure("Không đọc được dữ liệu lưu thông từ cơ sở dữ liệu.");
        }

        var showTrends = settings.IsEnabled && settings.TrendsEnabled;
        var showOverdue = settings.IsEnabled && settings.OverduePredictEnabled;
        return Result<AiLibrarianWorkspaceDto>.Success(new AiLibrarianWorkspaceDto
        {
            Criteria =
            [
                Criterion("major", "Chuyên ngành của độc giả", signals.MajorCount, Join(signals.MajorSamples, "chuyên ngành")),
                Criterion("category", "Thể loại sách", signals.CategoryCount, Join(signals.CategorySamples, "danh mục")),
                Criterion("history", "Lịch sử đọc", signals.BorrowCount, signals.BorrowCount == 0
                    ? "Chưa có phiếu mượn"
                    : $"{signals.BorrowCount} lượt mượn trong hệ thống"),
                Criterion("review", "Lượt đánh giá và phản hồi", signals.ReviewCount, ReviewDetail(signals)),
                Criterion("goal", "Mục tiêu học tập", signals.PreferenceCount, signals.PreferenceCount == 0
                    ? "Chưa có sở thích đọc đã lưu"
                    : $"{signals.PreferenceCount} hồ sơ sở thích đọc")
            ],
            Trends = showTrends
                ? signals.Trends
                : new AiReadingTrendsDto { Days = days },
            TopBorrowed = showTrends ? signals.TopBorrowed : [],
            OverdueRisks = showOverdue ? signals.OverdueRisks : []
        });
    }

    public async Task<Result<IReadOnlyList<AiBookSuggestionDto>>> GetRecommendationsAsync(
        Guid userId,
        string role,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(role))
            return Result<IReadOnlyList<AiBookSuggestionDto>>.Failure("Không xác định được vai trò.");

        var settings = await _settings.GetEntityAsync(ct);
        if (!settings.IsEnabled || !settings.RecommendEnabled)
            return Result<IReadOnlyList<AiBookSuggestionDto>>.Failure("Gợi ý sách cá nhân hóa đang tắt.");

        var books = await _recommendations.GetRecommendationsAsync(userId, 8, ct);
        return Result<IReadOnlyList<AiBookSuggestionDto>>.Success(books
            .Select(book => new AiBookSuggestionDto
            {
                Id = book.Id,
                Title = book.Title,
                Author = string.Join(", ", book.Authors.Select(author => author.Name)),
                CoverImageUrl = book.CoverImageUrl,
                AvailableCopies = book.AvailableCopies,
                TotalCopies = book.TotalCopies,
                Categories = book.Categories.Select(category => category.Name).ToList(),
                Reason = book.AverageRating > 0
                    ? "Dựa trên sách thật trong thư viện và dữ liệu đọc được phép truy cập."
                    : "Đầu sách đang có trong danh mục thư viện."
            })
            .ToList());
    }

    public async Task<Result<AiReadingTrendsDto>> GetReadingTrendsAsync(string role, CancellationToken ct = default)
    {
        if (!AiSettingsService.IsStaff(role))
            return Result<AiReadingTrendsDto>.Failure("Chỉ Admin hoặc Thủ thư xem xu hướng đọc.");

        var settings = await _settings.GetEntityAsync(ct);
        if (!settings.IsEnabled || !settings.TrendsEnabled)
            return Result<AiReadingTrendsDto>.Failure("Phân tích xu hướng đọc đang tắt.");

        var circulation = await _circulation.GetSettingsAsync(ct);
        var stats = await _circulation.GetStatsAsync(circulation.FinePerDay, ct);
        return Result<AiReadingTrendsDto>.Success(new AiReadingTrendsDto
        {
            Days = 7,
            Borrowed = stats.Borrowed,
            Returned = stats.Returned,
            Overdue = stats.Overdue,
            DueSoon = stats.DueSoon
        });
    }

    public async Task<Result<AiOverdueRiskDto>> GetOverdueRisksAsync(string role, CancellationToken ct = default)
    {
        if (!AiSettingsService.IsStaff(role))
            return Result<AiOverdueRiskDto>.Failure("Chỉ Admin hoặc Thủ thư xem dự đoán quá hạn.");

        var settings = await _settings.GetEntityAsync(ct);
        if (!settings.IsEnabled || !settings.OverduePredictEnabled)
            return Result<AiOverdueRiskDto>.Failure("Dự đoán nguy cơ quá hạn đang tắt.");

        var circulation = await _circulation.GetSettingsAsync(ct);
        var overdue = await _circulation.GetOverdueAsync(circulation.FinePerDay, ct);
        return Result<AiOverdueRiskDto>.Success(new AiOverdueRiskDto
        {
            Items = overdue
                .Take(20)
                .Select(item => new AiOverdueRiskItemDto
                {
                    LoanId = item.Id,
                    ReaderName = item.ReaderName,
                    BookTitle = item.BookTitle,
                    OverdueDays = item.OverdueDays,
                    Risk = item.OverdueDays >= 7 ? "cao" : "trung bình"
                })
                .ToList()
        });
    }

    private static AiCriterionDto Criterion(string id, string label, int count, string detail) => new()
    {
        Id = id,
        Label = label,
        Count = count,
        Detail = detail,
        HasData = count > 0
    };

    private static string Join(IReadOnlyList<string> samples, string unit)
    {
        if (samples.Count == 0)
            return $"Chưa có {unit}";
        return $"{string.Join(", ", samples)}";
    }

    private static string ReviewDetail(AiLibrarianSignals signals)
    {
        if (signals.ReviewCount == 0)
            return "Chưa có đánh giá";
        return signals.AverageRating is null
            ? $"{signals.ReviewCount} lượt đánh giá"
            : $"{signals.ReviewCount} lượt · điểm TB {signals.AverageRating.Value:0.0}";
    }
}
