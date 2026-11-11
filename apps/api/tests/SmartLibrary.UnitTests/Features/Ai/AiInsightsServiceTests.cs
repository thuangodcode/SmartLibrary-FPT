using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Ai;

public class AiInsightsServiceTests
{
    private readonly Mock<IAiSettingsRepository> _settingsRepository = new();
    private readonly Mock<ISecretProtector> _protector = new();
    private readonly Mock<IGeminiClient> _gemini = new();
    private readonly Mock<IAiRecommendationService> _recommendations = new();
    private readonly Mock<ICirculationRepository> _circulation = new();
    private readonly Mock<IAiWorkspaceRepository> _workspace = new();
    private readonly AiInsightsService _sut;

    public AiInsightsServiceTests()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                Id = Guid.NewGuid(),
                IsEnabled = true,
                TrendsEnabled = true,
                OverduePredictEnabled = true
            });
        _sut = new AiInsightsService(
            new AiSettingsService(_settingsRepository.Object, _protector.Object, _gemini.Object),
            _recommendations.Object,
            _circulation.Object,
            _workspace.Object);
    }

    [Fact]
    public async Task GetLibrarianWorkspaceAsync_WhenReader_ReturnsForbidden()
    {
        var result = await _sut.GetLibrarianWorkspaceAsync("Reader", 30);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Thủ thư");
        _workspace.Verify(item => item.GetSignalsAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task GetLibrarianWorkspaceAsync_WhenLibrarian_MapsRealCounts()
    {
        _workspace.Setup(item => item.GetSignalsAsync(30, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiLibrarianSignals
            {
                MajorCount = 4,
                MajorSamples = ["SE", "AI"],
                CategoryCount = 9,
                CategorySamples = ["Lập trình"],
                BorrowCount = 21,
                ReviewCount = 5,
                AverageRating = 4.2,
                PreferenceCount = 0,
                Trends = new AiReadingTrendsDto { Days = 30, Borrowed = 12, Returned = 8, Overdue = 3, DueSoon = 1 },
                TopBorrowed = [new AiBookSuggestionDto { Id = Guid.NewGuid(), Title = "Lập trình Web", BorrowCount = 6 }]
            });

        var result = await _sut.GetLibrarianWorkspaceAsync("Librarian", 30);

        result.IsSuccess.Should().BeTrue();
        result.Data!.Criteria.Should().Contain(item => item.Id == "major" && item.HasData && item.Count == 4);
        result.Data.Criteria.Should().Contain(item => item.Id == "goal" && !item.HasData);
        result.Data.Trends.Borrowed.Should().Be(12);
        result.Data.TopBorrowed.Should().ContainSingle(item => item.Title == "Lập trình Web");
    }

    [Fact]
    public async Task GetLibrarianWorkspaceAsync_WhenTrendsOff_HidesStats()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting { Id = Guid.NewGuid(), IsEnabled = true, TrendsEnabled = false });
        _workspace.Setup(item => item.GetSignalsAsync(30, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiLibrarianSignals
            {
                Trends = new AiReadingTrendsDto { Days = 30, Borrowed = 12 },
                TopBorrowed = [new AiBookSuggestionDto { Title = "Python cơ bản", BorrowCount = 4 }],
                OverdueRisks = [new AiOverdueRiskItemDto { BookTitle = "Lập trình Web", OverdueDays = 9 }]
            });

        var result = await _sut.GetLibrarianWorkspaceAsync("Librarian", 30);

        result.IsSuccess.Should().BeTrue();
        result.Data!.Trends.Borrowed.Should().Be(0);
        result.Data.TopBorrowed.Should().BeEmpty();
        result.Data.OverdueRisks.Should().BeEmpty();
    }
}
