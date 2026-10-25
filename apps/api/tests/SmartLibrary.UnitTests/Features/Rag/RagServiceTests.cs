using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Application.Features.Rag.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Rag;

public class RagServiceTests
{
    private readonly Mock<IAiSettingsRepository> _settingsRepository = new();
    private readonly Mock<ISecretProtector> _protector = new();
    private readonly Mock<IGeminiClient> _gemini = new();
    private readonly Mock<IRagDocumentRepository> _documents = new();
    private readonly Mock<IRagIndexer> _indexer = new();
    private readonly Mock<IAiWorkspaceRepository> _workspace = new();
    private readonly RagService _sut;

    public RagServiceTests()
    {
        _protector.Setup(item => item.Unprotect(It.IsAny<string>()))
            .Returns((string value) => value.Replace("enc:", string.Empty, StringComparison.Ordinal));
        _workspace.Setup(item => item.GetSignalsAsync(It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SmartLibrary.Application.Features.Ai.DTOs.AiLibrarianSignals());
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(1);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RagSearchHit>());
        _documents.Setup(item => item.AttachBookFactsAsync(
                It.IsAny<IReadOnlyList<RagSearchHit>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((IReadOnlyList<RagSearchHit> hits, CancellationToken _) => hits);
        var settings = new AiSettingsService(_settingsRepository.Object, _protector.Object, _gemini.Object);
        _sut = new RagService(settings, _gemini.Object, _documents.Object, _indexer.Object, _workspace.Object);
    }

    [Fact]
    public async Task AskAsync_WhenReaderAiDisabled_ReturnsFailure()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = false,
                EncryptedApiKey = "enc:key"
            });

        var result = await _sut.AskAsync("Tôi muốn mượn sách lập trình web", "Reader");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("độc giả");
        _gemini.Verify(item => item.EmbedAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_WhenEnabled_ReturnsAnswerAndSources()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345",
                ChatModel = "gemini-2.0-flash",
                EmbeddingModel = "text-embedding-004"
            });
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f, 0.2f });
        _documents.Setup(item => item.SearchAsync(It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Lập trình Web",
                    Content = "Giáo trình lập trình web FPT",
                    Score = 0.91
                }
            });
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Nên mượn Lập trình Web.");

        var result = await _sut.AskAsync("Sách lập trình web nào nên đọc?", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Answer.Should().Contain("Lập trình Web");
        result.Data.Sources.Should().ContainSingle(source => source.Title == "Lập trình Web");
    }

    [Fact]
    public async Task AskAsync_CSharpSearchFiltersUnrelatedVectorHitsAndExpandsEmbeddingQuery()
    {
        EnableReaderAi();
        string? embeddedText = null;
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .Callback<string, string, string, string, string?, CancellationToken>(
                (_, _, _, text, _, _) => embeddedText = text)
            .ReturnsAsync(new float[] { 0.1f, 0.2f });
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Marketing Management",
                    Content = "Marketing strategy and management.",
                    Categories = ["Kinh tế và Quản trị"],
                    Score = 0.78
                }
            });
        _documents.Setup(item => item.SearchAsync(
                It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Algorithms (4th Edition)",
                    Content = "A general introduction to algorithms.",
                    Categories = ["Công nghệ thông tin"],
                    Score = 0.88
                },
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "C# in a Nutshell",
                    Content = "A guide to the C Sharp programming language.",
                    Categories = ["Công nghệ thông tin"],
                    Score = 0.69
                }
            });

        var result = await _sut.AskAsync(
            "Tôi muốn tìm hiểu thêm về lập trình C# thì nên đọc sách nào?",
            "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source => source.Title == "C# in a Nutshell");
        result.Data.Sources.Should().OnlyContain(source => source.SourceType == "book");
        result.Data.Answer.Should().NotContain("Marketing");
        embeddedText.Should().Contain("C# (C Sharp)");
    }

    [Fact]
    public async Task AskAsync_EnglishLanguageLearning_UsesSemanticSearchAndOnlyReturnsRelevantCatalogBooks()
    {
        EnableReaderAi();
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f, 0.2f });
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "English Grammar in Use",
                    Content = "Giáo trình ngữ pháp tiếng Anh.",
                    Language = "en",
                    Categories = ["Ngoại ngữ"],
                    Score = 0.78
                },
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Python nâng cao",
                    Content = "Giáo trình lập trình Python.",
                    Language = "en",
                    Categories = ["Công nghệ thông tin"],
                    Score = 0.78
                }
            });
        _documents.Setup(item => item.SearchAsync(
                It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "English Vocabulary Builder",
                    Content = "Sách học từ vựng tiếng Anh.",
                    Language = "en",
                    Categories = ["Ngoại ngữ"],
                    Score = 0.74
                },
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Python nâng cao",
                    Content = "Giáo trình lập trình Python.",
                    Language = "en",
                    Categories = ["Công nghệ thông tin"],
                    Score = 0.82
                },
                new()
                {
                    SourceType = "policy",
                    SourceId = Guid.NewGuid(),
                    Title = "Chính sách mượn sách",
                    Content = "Thời hạn mượn sách.",
                    Score = 0.91
                }
            });

        var result = await _sut.AskAsync("Bây giờ tôi muốn học về ngôn ngữ Anh.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Select(source => source.Title).Should().BeEquivalentTo(
            "English Grammar in Use",
            "English Vocabulary Builder");
        result.Data.Answer.Should().Contain("Tìm thấy 2 đầu sách");
        result.Data.Answer.Should().NotContain("Python");
        result.Data.Sources.Should().OnlyContain(source => source.SourceType == "book");
        _gemini.Verify(item => item.EmbedAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.Is<string>(text => text.Contains("Tìm sách trong thư viện", StringComparison.Ordinal)),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Once);
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_KoreanLanguageLearning_FindsKoreanTitleWithEnglishMetadataLanguage()
    {
        EnableReaderAi();
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f, 0.2f });
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Integrated Korean: Beginning 1 (2nd Edition)",
                    Content = "Integrated Korean Beginning 1 textbook.",
                    Author = "Young-Mee Cho",
                    Language = "en",
                    Categories = ["Ngoại ngữ"],
                    AvailableCopies = 10,
                    TotalCopies = 10,
                    Score = 0.78
                },
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "English Grammar in Use",
                    Content = "English grammar textbook.",
                    Language = "en",
                    Categories = ["Ngoại ngữ"],
                    Score = 0.78
                }
            });
        _documents.Setup(item => item.SearchAsync(
                It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Array.Empty<RagSearchHit>());

        var result = await _sut.AskAsync("Tôi muốn tìm sách về ngôn ngữ Hàn", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source =>
            source.Title == "Integrated Korean: Beginning 1 (2nd Edition)");
        result.Data.Sources.Should().OnlyContain(source => source.SourceType == "book");
        result.Data.Answer.Should().Contain("Tìm thấy 1 đầu sách");
    }

    [Fact]
    public async Task AskAsync_GenericSemanticQuery_KeepsRelevantVectorMatchWithoutExactKeywordOverlap()
    {
        EnableReaderAi();
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f, 0.2f });
        _documents.Setup(item => item.SearchAsync(
                It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Cybersecurity Fundamentals",
                    Content = "A practical guide to online privacy, identity protection and secure browsing.",
                    Score = 0.72
                }
            });

        var result = await _sut.AskAsync(
            "Tôi muốn biết cách giữ an toàn thông tin cá nhân khi sử dụng các trang web.",
            "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source => source.Title == "Cybersecurity Fundamentals");
        result.Data.Answer.Should().Contain("Cybersecurity Fundamentals");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_WhenHitsBelowThreshold_OmitsUnrelatedSources()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345",
                ChatModel = "gemini-3.8-flash"
            });
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f });
        _documents.Setup(item => item.SearchAsync(It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Tôi thấy hoa vàng trên cỏ xanh",
                    Content = "Tiểu thuyết",
                    Score = 0.12
                }
            });
        var result = await _sut.AskAsync("Giáo trình lập trình web kỳ 3 ngành SE", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().BeEmpty();
        result.Data.Answer.Should().Contain("khớp chủ đề");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_WhenQuestionLongerThanOldLimit_StillSearches()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345"
            });
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Python cơ bản",
                    Score = 0.55
                }
            });
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Python cơ bản phù hợp vì em muốn học lập trình từ đầu.");
        var question = "Em là sinh viên FPT HCM kỳ 3 ngành SE. "
            + string.Concat(Enumerable.Repeat("Em muốn học lập trình từ đầu, đặc biệt Python, rồi đọc kiến trúc phần mềm. ", 20))
            + "Nhờ thư viện gợi ý sách thật đang có.";

        var result = await _sut.AskAsync(question, "Reader");

        question.Length.Should().BeGreaterThan(1000);
        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source => source.Title == "Python cơ bản");
        _documents.Verify(item => item.SearchCatalogAsync(
            It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task AskAsync_WhenExactCatalogHit_KeepsBookEvenWithoutEmbedding()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345"
            });
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Python cơ bản",
                    Score = 0.97
                }
            });
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Thư viện có Python cơ bản.");

        var result = await _sut.AskAsync("python co ban", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source => source.Title == "Python cơ bản");
        result.Data.Answer.Should().Contain("Python cơ bản");
        _gemini.Verify(item => item.EmbedAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_WhenEmbedFails_KeepsCatalogHits()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345"
            });
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Lập trình Web",
                    Score = 0.97
                }
            });
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("gemini-embedding-001 is not found"));
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Thư viện có Lập trình Web.");

        var result = await _sut.AskAsync("Lập trình Web", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(source => source.Title == "Lập trình Web");
    }

    [Fact]
    public async Task AskAsync_WhenRagEmpty_UsesCatalogWithoutEmbedding()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                LibrarianAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345",
                ChatModel = "gemini-2.0-flash"
            });
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Nhập môn công nghệ thông tin",
                    Content = "Giáo trình công nghệ thông tin FPT",
                    Score = 0.8
                }
            });
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Thư viện có Nhập môn công nghệ thông tin.");

        var result = await _sut.AskAsync("Tôi muốn tìm sách công nghệ thông tin", "Librarian");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Answer.Should().Contain("công nghệ thông tin");
        result.Data.Sources.Should().ContainSingle(source => source.Title == "Nhập môn công nghệ thông tin");
        _gemini.Verify(item => item.EmbedAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AskAsync_WhenSemanticHitIsDifferentTopic_ReturnsEmpty()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345"
            });
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.2f });
        _documents.Setup(item => item.SearchAsync(It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Python cơ bản",
                    Content = "Nhập môn Python bằng tiếng Việt",
                    Score = 0.61
                }
            });

        var result = await _sut.AskAsync("tôi muốn kiếm sách liên quan đến kỳ 4 ngành tiếng nhật", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().BeEmpty();
        result.Data.Answer.Should().Contain("khớp chủ đề");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ReindexAsync_WhenLibrarian_ReturnsForbidden()
    {
        var result = await _sut.ReindexAsync("Librarian");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Admin");
        _indexer.Verify(item => item.ReindexAllAsync(It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SuggestAcquisitionsAsync_WhenDisabled_ReturnsFailure()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting { LibrarianAiEnabled = false, EncryptedApiKey = "enc:key" });

        var result = await _sut.SuggestAcquisitionsAsync("Librarian");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("tắt");
    }

    [Fact]
    public async Task AskAsync_WhenApiKeyInvalid_NotifiesLibrarianOwner()
    {
        var ownerId = Guid.NewGuid();
        var inbox = new Mock<INotificationInbox>();
        inbox.Setup(item => item.NotifyAiCredentialAsync(
                It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        EnableReaderAi();
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                ActiveLibrarianUserId = ownerId
            });
        _settingsRepository.Setup(item => item.GetUserAsync(ownerId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserAiSetting
            {
                UserId = ownerId,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345",
                Provider = "gemini",
                ChatModel = "gemini-3.8-flash",
                EmbeddingModel = "gemini-embedding-001",
                IsEnabled = true
            });
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Gemini: API Key không hợp lệ hoặc đã bị thu hồi."));
        var sut = new RagService(
            new AiSettingsService(_settingsRepository.Object, _protector.Object, _gemini.Object),
            _gemini.Object,
            _documents.Object,
            _indexer.Object,
            _workspace.Object,
            inbox.Object);

        var result = await sut.AskAsync("tìm sách xyzzy-khong-ton-tai", "Reader");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("API Key");
        inbox.Verify(item => item.NotifyAiCredentialAsync(
            ownerId,
            It.Is<string>(value => value.Contains("không hợp lệ", StringComparison.Ordinal)),
            It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task AskAsync_ReaderBookSearchWithoutCatalogMatchOrRagIndex_ReturnsExplicitIndexError()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);

        var result = await _sut.AskAsync("I am looking for books about quantum computing", "Reader");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("chưa được đồng bộ");
    }

    [Fact]
    public async Task AskAsync_WhenNoApiKey_ReturnsNotConfigured()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting { IsEnabled = true, ReaderAiEnabled = true });

        var result = await _sut.AskAsync("Tôi muốn mượn sách lập trình web", "Reader");

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Chưa cấu hình");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_WhenLibrarian_UsesPersonalChatModel()
    {
        var librarianId = Guid.NewGuid();
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                LibrarianAiEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:library-should-not-be-used-0000"
            });
        _settingsRepository.Setup(item => item.GetUserAsync(librarianId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new UserAiSetting
            {
                UserId = librarianId,
                EncryptedApiKey = "enc:personal-key-dddddddddddd",
                Provider = "openai",
                ChatModel = "gpt-4o-mini",
                EmbeddingModel = "text-embedding-3-small",
                IsEnabled = true
            });
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                new()
                {
                    SourceType = "book",
                    SourceId = Guid.NewGuid(),
                    Title = "Lập trình Web",
                    Content = "Giáo trình lập trình web FPT",
                    Score = 0.72
                }
            });
        _gemini.Setup(item => item.GenerateAsync(
                "openai",
                "personal-key-dddddddddddd",
                "gpt-4o-mini",
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("Nên mượn Lập trình Web.");

        var result = await _sut.AskAsync("Sách lập trình web nào nên đọc?", "Librarian", librarianId);

        result.IsSuccess.Should().BeTrue();
        _gemini.Verify(item => item.GenerateAsync(
            "openai",
            "personal-key-dddddddddddd",
            "gpt-4o-mini",
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Once);
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            "library-should-not-be-used-0000",
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_JapaneseEsp_DoesNotReturnPythonOrEnglishGrammar()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Python nâng cao", "Ngôn ngữ lập trình Python. Giáo trình chuyên ngành công nghệ thông tin.", 0.62),
                Hit("Python cơ bản", "Nhập môn Python bằng tiếng Việt", 0.6),
                Hit("English Grammar in Use", "Ngữ pháp tiếng Anh", 0.58),
                Hit("Truyện Kiều", "Văn học Việt Nam", 0.5),
                Hit("Giáo trình tiếng Nhật thương mại", "Tiếng Nhật chuyên ngành thương mại", 0.8),
            });

        var result = await _sut.AskAsync("Tìm sách về ngôn ngữ chuyên ngành tiếng Nhật.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Select(item => item.Title).Should().Equal("Giáo trình tiếng Nhật thương mại");
        result.Data.Sources.Should().NotContain(item => item.Title.Contains("Python") || item.Title.Contains("English") || item.Title.Contains("Kiều"));
        result.Data.Sources[0].MatchLabel.Should().Be("Phù hợp cao");
    }

    [Fact]
    public async Task AskAsync_JapaneseIt_KeepsJapaneseItBookOnly()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Python cơ bản", "Ngôn ngữ lập trình Python chuyên ngành CNTT", 0.7),
                Hit("Tiếng Nhật chuyên ngành CNTT", "Giáo trình tiếng Nhật công nghệ thông tin", 0.82),
                Hit("Minna no Nihongo", "Giáo trình tiếng Nhật sơ cấp", 0.75),
            });

        var result = await _sut.AskAsync("Tìm sách tiếng Nhật chuyên ngành công nghệ thông tin.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Select(item => item.Title).Should().Equal("Tiếng Nhật chuyên ngành CNTT");
    }

    [Fact]
    public async Task AskAsync_JapaneseBusinessVocab_KeepsMatchingBook()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("English Grammar in Use", "Ngữ pháp tiếng Anh", 0.55),
                Hit("Từ vựng tiếng Nhật thương mại", "Học từ vựng tiếng Nhật kinh tế", 0.84),
            });

        var result = await _sut.AskAsync("Tìm sách học từ vựng tiếng Nhật thương mại.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(item => item.Title == "Từ vựng tiếng Nhật thương mại");
    }

    [Fact]
    public async Task AskAsync_PythonQuery_ReturnsPythonNotJapanese()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Python nâng cao", "Python nâng cao cho sinh viên", 0.9),
                Hit("Giáo trình tiếng Nhật", "Tiếng Nhật sơ cấp", 0.4),
            });

        var result = await _sut.AskAsync("Tìm sách Python nâng cao.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(item => item.Title == "Python nâng cao");
    }

    [Fact]
    public async Task AskAsync_EnglishGrammarQuery_ReturnsEnglishGrammar()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("English Grammar in Use", "Ngữ pháp tiếng Anh", 0.88),
                Hit("Python cơ bản", "Ngôn ngữ lập trình Python", 0.5),
            });

        var result = await _sut.AskAsync("Tìm sách ngữ pháp tiếng Anh.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(item => item.Title == "English Grammar in Use");
    }

    [Fact]
    public async Task AskAsync_WideJapaneseQuery_DoesNotRequireAMajor()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Minna no Nihongo", "Giáo trình tiếng Nhật sơ cấp", 0.8),
                Hit("Python cơ bản", "Ngôn ngữ lập trình Python", 0.55),
            });

        var result = await _sut.AskAsync("Tìm sách tiếng Nhật", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().ContainSingle(item => item.Title == "Minna no Nihongo");
        result.Data.Answer.Should().Contain("chuyên ngành");
    }

    [Fact]
    public async Task AskAsync_JapaneseQuery_WhenLibraryHasNoJapanese_ReturnsEmpty()
    {
        EnableReaderAi();
        _gemini.Setup(item => item.EmbedAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.2f });
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Python nâng cao", "Ngôn ngữ lập trình Python chuyên ngành", 0.66)
            });
        _documents.Setup(item => item.SearchAsync(It.IsAny<float[]>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("English Grammar in Use", "Ngữ pháp tiếng Anh", 0.61)
            });

        var result = await _sut.AskAsync("Tôi muốn tìm sách liên quan đến ngôn ngữ chuyên ngành tiếng Nhật.", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().BeEmpty();
        result.Data.Answer.Should().Contain("tiếng Nhật");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_HardwareAndDiscreteMathProse_ReturnsOnlyRosenInSources()
    {
        EnableReaderAi();
        _documents.Setup(item => item.CountAsync(It.IsAny<CancellationToken>())).ReturnsAsync(0);
        _documents.Setup(item => item.SearchCatalogAsync(
                It.IsAny<string>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RagSearchHit>
            {
                Hit("Tôi thấy hoa vàng trên cỏ xanh", "Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.", 0.82),
                Hit("Clean Code: A Handbook of Agile Software Craftsmanship", "A guide to writing clean, maintainable code.", 0.8),
                Hit("Clean Architecture: A Craftsman's Guide to Software Structure and Design", "Building maintainable software architectures.", 0.79),
                Hit("Refactoring: Improving the Design of Existing Code", "A classic guide to code refactoring techniques.", 0.78),
                Hit("Toán học rời rạc ứng dụng trong Công nghệ thông tin", "Nền tảng logic mệnh đề, đồ thị và thuật toán tổ hợp cho kỹ sư phần mềm.", 0.7),
            });

        var result = await _sut.AskAsync(
            "Tôi đang học ngành Công nghệ thông tin và muốn tìm tài liệu để bổ sung kiến thức cho hai phần mà tôi đang gặp khó khăn. "
            + "Thứ nhất, tôi muốn hiểu cách các linh kiện điện tử siêu nhỏ được tích hợp trên một tấm bán dẫn, "
            + "cách các thành phần bên trong bộ xử lý phối hợp với nhau và nguyên lý thiết kế các mạch điện tử trong thiết bị máy tính. "
            + "Bên cạnh đó, tôi cũng cần học cách xác định một mệnh đề đúng hay sai, sử dụng các quy tắc logic để suy luận, "
            + "làm việc với tập hợp và quan hệ, tính số cách sắp xếp các đối tượng và chứng minh các kết luận bằng lập luận toán học. "
            + "Tôi muốn tìm một cuốn sách giải thích về cấu tạo và thiết kế các hệ thống điện tử ở cấp độ linh kiện, "
            + "đồng thời tìm thêm một cuốn sách giúp tôi nắm vững tư duy logic, các phương pháp chứng minh và những nền tảng toán học phục vụ khoa học máy tính.",
            "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Select(item => item.Title).Should()
            .Equal("Toán học rời rạc ứng dụng trong Công nghệ thông tin");
        result.Data.Answer.Should().Contain("chưa có sách về vi mạch");
        result.Data.Answer.Should().Contain("Toán học rời rạc");
        result.Data.Answer.Should().NotContain("hoa vàng");
        result.Data.Answer.Should().NotContain("Clean Code");
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task AskAsync_VagueLanguageQuery_DoesNotCallGemini()
    {
        EnableReaderAi();

        var result = await _sut.AskAsync("Tìm sách ngôn ngữ", "Reader");

        result.IsSuccess.Should().BeTrue();
        result.Data!.Sources.Should().BeEmpty();
        result.Data.Answer.Should().Contain("ngôn ngữ nào");
        _gemini.Verify(item => item.EmbedAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
        _gemini.Verify(item => item.GenerateAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<string?>(),
            It.IsAny<CancellationToken>()), Times.Never);
    }

    private void EnableReaderAi()
    {
        _settingsRepository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new AiSetting
            {
                IsEnabled = true,
                ReaderAiEnabled = true,
                EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345"
            });
    }

    private static RagSearchHit Hit(string title, string content, double score) => new()
    {
        SourceType = "book",
        SourceId = Guid.NewGuid(),
        Title = title,
        Content = content,
        Score = score
    };
}
