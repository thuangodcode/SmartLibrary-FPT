using FluentAssertions;
using Moq;
using SmartLibrary.Application.Features.Ai;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Ai;

public class AiSettingsServiceTests
{
    private readonly Mock<IAiSettingsRepository> _repository = new();
    private readonly Mock<ISecretProtector> _protector = new();
    private readonly Mock<IGeminiClient> _gemini = new();
    private readonly AiSettingsService _sut;
    private readonly Dictionary<Guid, UserAiSetting> _users = new();
    private AiSetting _policy = new() { Id = Guid.NewGuid() };

    public AiSettingsServiceTests()
    {
        _protector.Setup(item => item.Protect(It.IsAny<string>()))
            .Returns((string value) => $"enc:{value}");
        _protector.Setup(item => item.Unprotect(It.IsAny<string>()))
            .Returns((string value) => value.StartsWith("enc:", StringComparison.Ordinal) ? value[4..] : value);
        _repository.Setup(item => item.GetOrCreateAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => _policy);
        _repository.Setup(item => item.SaveAsync(It.IsAny<AiSetting>(), It.IsAny<CancellationToken>()))
            .Callback<AiSetting, CancellationToken>((settings, _) => _policy = settings)
            .Returns(Task.CompletedTask);
        _repository.Setup(item => item.GetUserAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid userId, CancellationToken _) => _users.GetValueOrDefault(userId));
        _repository.Setup(item => item.GetOrCreateUserAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((Guid userId, CancellationToken _) =>
            {
                if (_users.TryGetValue(userId, out var existing))
                    return existing;
                var created = new UserAiSetting { UserId = userId, IsEnabled = true };
                _users[userId] = created;
                return created;
            });
        _repository.Setup(item => item.SaveUserAsync(It.IsAny<UserAiSetting>(), It.IsAny<CancellationToken>()))
            .Callback<UserAiSetting, CancellationToken>((settings, _) => _users[settings.UserId] = settings)
            .Returns(Task.CompletedTask);
        _repository.Setup(item => item.ListLibrarianAccountsAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => _users.Select(pair => new LibrarianAiAccountRow
            {
                UserId = pair.Key,
                FullName = $"Librarian {pair.Key.ToString()[..4]}",
                Email = $"{pair.Key:N}@fpt.edu.vn",
                HasApiKey = !string.IsNullOrWhiteSpace(pair.Value.EncryptedApiKey),
                IsEnabled = pair.Value.IsEnabled,
                Provider = pair.Value.Provider,
                ChatModel = pair.Value.ChatModel,
                EmbeddingModel = pair.Value.EmbeddingModel,
                LastTestOk = pair.Value.LastTestOk,
                LastTestMessage = pair.Value.LastTestMessage
            }).ToList());
        _sut = new AiSettingsService(_repository.Object, _protector.Object, _gemini.Object);
    }

    [Fact]
    public async Task SaveAdminAsync_WhenLibrarian_ReturnsForbidden()
    {
        var result = await _sut.SaveAdminAsync(
            new SaveAiSettingsRequest { IsEnabled = true },
            "Librarian",
            Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Admin");
        _repository.Verify(item => item.SaveAsync(It.IsAny<AiSetting>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task SaveAdminAsync_RejectsApiKey()
    {
        var result = await _sut.SaveAdminAsync(
            new SaveAiSettingsRequest { ApiKey = "AIzaSyDummyKeyForUnitTest12345", IsEnabled = true },
            "Admin",
            Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("không lưu API Key");
        _protector.Verify(item => item.Protect(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task SaveAdminAsync_SavesFlagsWithoutKey()
    {
        var result = await _sut.SaveAdminAsync(
            new SaveAiSettingsRequest { IsEnabled = true, ReaderAiEnabled = true, RecommendEnabled = true },
            "Admin",
            Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        result.Data!.IsEnabled.Should().BeTrue();
        result.Data.ReaderAiEnabled.Should().BeTrue();
        result.Data.CanEditApiKey.Should().BeFalse();
        result.Data.ApiKeyLast4.Should().BeNull();
        _policy.IsEnabled.Should().BeTrue();
    }

    [Fact]
    public async Task GetStatusAsync_AdminNeverSeesKeyMeta()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:secret-key-of-librarian-a",
            ApiKeyLast4 = "an-a",
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            IsEnabled = true
        };
        _policy.ActiveLibrarianUserId = librarianId;
        _policy.EncryptedApiKey = "enc:legacy";
        _policy.ApiKeyLast4 = "key1";

        var adminStatus = await _sut.GetStatusAsync("Admin", Guid.NewGuid());
        adminStatus.CanEditApiKey.Should().BeFalse();
        adminStatus.ApiKeyLast4.Should().BeNull();
        adminStatus.BaseUrl.Should().BeNull();
        adminStatus.Providers.Should().BeEmpty();
        adminStatus.HasApiKey.Should().BeTrue();
        adminStatus.Provider.Should().Be("gemini");
        adminStatus.LibrarianAccounts.Should().ContainSingle(item => item.UserId == librarianId && item.HasApiKey);
        adminStatus.LibrarianAccounts[0].Should().NotBeNull();
        JsonFreeOfSecrets(adminStatus);

        var otherLibrarian = await _sut.GetStatusAsync("Librarian", Guid.NewGuid());
        otherLibrarian.HasApiKey.Should().BeFalse();
        otherLibrarian.ApiKey.Should().BeNull();
        otherLibrarian.ApiKeyLast4.Should().BeNull();
        otherLibrarian.CanEditApiKey.Should().BeTrue();
    }

    [Fact]
    public async Task SaveMyProviderAsync_IsolatesLibrarianKeys()
    {
        var librarianA = Guid.NewGuid();
        var librarianB = Guid.NewGuid();

        var savedA = await _sut.SaveMyProviderAsync(
            new SaveAiSettingsRequest
            {
                Provider = "gemini",
                ApiKey = "AIzaSyLibrarianA-Key-12345678",
                ChatModel = "gemini-3.8-flash"
            },
            "Librarian",
            librarianA);
        var savedB = await _sut.SaveMyProviderAsync(
            new SaveAiSettingsRequest
            {
                Provider = "openai",
                ApiKey = "sk-librarian-b-key-for-tests-99",
                ChatModel = "gpt-4o-mini"
            },
            "Librarian",
            librarianB);

        savedA.IsSuccess.Should().BeTrue();
        savedA.Data!.ApiKey.Should().Be("AIzaSyLibrarianA-Key-12345678");
        savedA.Data.ApiKeyLast4.Should().Be("5678");
        savedA.Data.CanEditApiKey.Should().BeTrue();
        savedB.Data!.ApiKey.Should().Be("sk-librarian-b-key-for-tests-99");
        savedB.Data.ApiKeyLast4.Should().Be("s-99");
        savedB.Data.Provider.Should().Be("openai");

        var statusA = await _sut.GetStatusAsync("Librarian", librarianA);
        var statusB = await _sut.GetStatusAsync("Librarian", librarianB);
        statusA.ApiKey.Should().Be("AIzaSyLibrarianA-Key-12345678");
        statusA.ApiKeyLast4.Should().Be("5678");
        statusA.Provider.Should().Be("gemini");
        statusB.ApiKey.Should().Be("sk-librarian-b-key-for-tests-99");
        statusB.ApiKeyLast4.Should().Be("s-99");
        statusB.Provider.Should().Be("openai");
        _users[librarianA].EncryptedApiKey.Should().Be("enc:AIzaSyLibrarianA-Key-12345678");
        _users[librarianB].EncryptedApiKey.Should().Be("enc:sk-librarian-b-key-for-tests-99");

        var admin = await _sut.GetStatusAsync("Admin", Guid.NewGuid());
        admin.ApiKey.Should().BeNull();
        admin.ApiKeyLast4.Should().BeNull();
        admin.LibrarianAccounts.Should().OnlyContain(item => item.HasApiKey);
        JsonFreeOfSecrets(admin);
    }

    [Fact]
    public async Task SaveMyProviderAsync_WhenAdmin_ReturnsForbidden()
    {
        var result = await _sut.SaveMyProviderAsync(
            new SaveAiSettingsRequest { ApiKey = "AIzaSyDummyKeyForUnitTest12345", Provider = "gemini" },
            "Admin",
            Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Thủ thư");
        _users.Should().BeEmpty();
    }

    [Fact]
    public async Task SaveLibrarianAsync_DoesNotWriteApiKey()
    {
        var actor = Guid.NewGuid();
        _policy.EncryptedApiKey = "enc:keep-me";
        _policy.ApiKeyLast4 = "e-me";
        _policy.LibrarianAiEnabled = true;

        var result = await _sut.SaveLibrarianAsync(
            new SaveLibrarianAiSettingsRequest { LibrarianAiEnabled = true },
            "Librarian",
            actor);

        result.IsSuccess.Should().BeTrue();
        _policy.EncryptedApiKey.Should().Be("enc:keep-me");
        result.Data!.ApiKeyLast4.Should().BeNull();
        result.Data.UseMajor.Should().BeTrue();
    }

    [Fact]
    public async Task SaveLibrarianAsync_WhenEnablingService_ReturnsForbidden()
    {
        _policy.LibrarianAiEnabled = false;
        _policy.IsEnabled = true;

        var result = await _sut.SaveLibrarianAsync(
            new SaveLibrarianAiSettingsRequest { LibrarianAiEnabled = true },
            "Librarian",
            Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("Admin");
        _policy.LibrarianAiEnabled.Should().BeFalse();
    }

    [Fact]
    public async Task TestConnectionAsync_LibrarianWithoutKey_ReturnsNotConfigured()
    {
        var result = await _sut.TestConnectionAsync("Librarian", Guid.NewGuid());

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
    public async Task TestConnectionAsync_LibrarianUsesOwnKeyAndModel()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:AIzaSyDummyKeyForUnitTest12345",
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            EmbeddingModel = "gemini-embedding-001",
            IsEnabled = true
        };
        _gemini.Setup(item => item.GenerateAsync(
                "gemini",
                "AIzaSyDummyKeyForUnitTest12345",
                "gemini-3.8-flash",
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync("OK");
        _gemini.Setup(item => item.EmbedAsync(
                "gemini",
                "AIzaSyDummyKeyForUnitTest12345",
                "gemini-embedding-001",
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync(new float[] { 0.1f, 0.2f });

        var result = await _sut.TestConnectionAsync("Librarian", librarianId);

        result.IsSuccess.Should().BeTrue();
        result.Data!.Ok.Should().BeTrue();
        result.Data.Provider.Should().Be("gemini");
        _users[librarianId].LastTestOk.Should().BeTrue();
    }

    [Fact]
    public async Task TestConnectionAsync_InvalidKey_ReturnsVendorError()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:AIzaSyInvalidKeyForUnitTest9999",
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            IsEnabled = true
        };
        _gemini.Setup(item => item.GenerateAsync(
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string>(),
                It.IsAny<string?>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("Gemini: API Key không hợp lệ hoặc đã bị thu hồi."));

        var result = await _sut.TestConnectionAsync("Librarian", librarianId);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("không hợp lệ");
        result.Error.Should().NotContain("AIza");
        _users[librarianId].LastTestOk.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveForAskAsync_ReaderUsesLibraryNotOtherLibrarian()
    {
        var libraryId = Guid.NewGuid();
        var otherId = Guid.NewGuid();
        _users[libraryId] = new UserAiSetting
        {
            UserId = libraryId,
            EncryptedApiKey = "enc:library-key-aaaaaaaaaaaa",
            Provider = "gemini",
            ChatModel = "gemini-3.8-flash",
            EmbeddingModel = "gemini-embedding-001",
            IsEnabled = true
        };
        _users[otherId] = new UserAiSetting
        {
            UserId = otherId,
            EncryptedApiKey = "enc:other-key-bbbbbbbbbbbb",
            Provider = "openai",
            ChatModel = "gpt-4o-mini",
            IsEnabled = true
        };
        _policy.IsEnabled = true;
        _policy.ReaderAiEnabled = true;
        _policy.ActiveLibrarianUserId = libraryId;

        var result = await _sut.ResolveForAskAsync("Reader", otherId);

        result.IsSuccess.Should().BeTrue();
        result.Data!.ApiKey.Should().Be("library-key-aaaaaaaaaaaa");
        result.Data.OwnerUserId.Should().Be(libraryId);
        result.Data.Provider.Should().Be("gemini");
    }

    [Fact]
    public async Task ResolveForAskAsync_WhenAdminDisablesAccount_BlocksLibrarian()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:personal-key-cccccccccccc",
            IsEnabled = false
        };
        _policy.IsEnabled = true;
        _policy.LibrarianAiEnabled = true;

        var result = await _sut.ResolveForAskAsync("Librarian", librarianId);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("tắt quyền");
    }

    [Fact]
    public async Task ResolveForAskAsync_WhenSystemOff_IgnoresPersonalKey()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:personal-key-cccccccccccc",
            IsEnabled = true
        };
        _policy.IsEnabled = false;
        _policy.LibrarianAiEnabled = true;

        var result = await _sut.ResolveForAskAsync("Librarian", librarianId);

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("đang tắt");
    }

    [Fact]
    public async Task SetLibrarianAccountEnabledAsync_ClearsLibraryActive()
    {
        var librarianId = Guid.NewGuid();
        _users[librarianId] = new UserAiSetting
        {
            UserId = librarianId,
            EncryptedApiKey = "enc:personal-key-cccccccccccc",
            IsEnabled = true
        };
        _policy.ActiveLibrarianUserId = librarianId;

        var result = await _sut.SetLibrarianAccountEnabledAsync(librarianId, false, "Admin", Guid.NewGuid());

        result.IsSuccess.Should().BeTrue();
        _users[librarianId].IsEnabled.Should().BeFalse();
        _policy.ActiveLibrarianUserId.Should().BeNull();
    }

    [Fact]
    public async Task SaveMyProviderAsync_WhenClaudeForLibrary_ReturnsFailure()
    {
        _policy.IsEnabled = true;
        _policy.ReaderAiEnabled = true;
        var result = await _sut.SaveMyProviderAsync(
            new SaveAiSettingsRequest
            {
                Provider = "anthropic",
                ApiKey = "sk-ant-dummy-key-for-unit-test-123",
                ChatModel = "claude-sonnet-4-5",
                UseForLibrary = true
            },
            "Librarian",
            Guid.NewGuid());

        result.IsSuccess.Should().BeFalse();
        result.Error.Should().Contain("embedding");
    }

    private static void JsonFreeOfSecrets(AiSettingsStatusDto status)
    {
        var json = System.Text.Json.JsonSerializer.Serialize(status);
        json.Should().NotContain("enc:");
        json.Should().NotContain("secret-key");
        json.Should().NotContain("AIza");
    }
}
