using System.Text.Json;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Ai.DTOs;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Ai;

public class AiSettingsService
{
    public const string AdminRole = "Admin";
    public const string LibrarianRole = "Librarian";
    private const string CredentialEncryptionError =
        "Không giải mã được API Key AI đã lưu. Ai:EncryptionKey trên máy chủ có thể đã thay đổi; hãy giữ cố định khóa này và nhập, lưu lại API Key AI trong trang cấu hình AI.";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] KnownProviders =
    [
        "gemini", "openai", "anthropic", "deepseek", "openrouter", "huggingface", "other", "local", "ollama"
    ];

    private readonly IAiSettingsRepository _repository;
    private readonly ISecretProtector _protector;
    private readonly IGeminiClient _gemini;
    private readonly INotificationInbox? _inbox;

    public AiSettingsService(
        IAiSettingsRepository repository,
        ISecretProtector protector,
        IGeminiClient gemini,
        INotificationInbox? inbox = null)
    {
        _repository = repository;
        _protector = protector;
        _gemini = gemini;
        _inbox = inbox;
    }

    public Task<AiSettingsStatusDto> GetStatusAsync(string role, CancellationToken ct = default)
        => GetStatusAsync(role, Guid.Empty, ct);

    public async Task<AiSettingsStatusDto> GetStatusAsync(string role, Guid actorId, CancellationToken ct = default)
    {
        var policy = await _repository.GetOrCreateAsync(ct);
        var libraryUser = await LoadLibraryUserAsync(policy, ct);
        if (IsAdmin(role))
        {
            var accounts = await _repository.ListLibrarianAccountsAsync(ct) ?? [];
            return MapAdmin(policy, libraryUser, accounts);
        }

        var mine = actorId == Guid.Empty ? null : await _repository.GetUserAsync(actorId, ct);
        return MapLibrarian(policy, mine, libraryUser, actorId);
    }

    public async Task<Result<AiSettingsStatusDto>> SaveAdminAsync(
        SaveAiSettingsRequest request,
        string role,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!IsAdmin(role))
            return Result<AiSettingsStatusDto>.Failure("Chỉ Admin được lưu chính sách AI hệ thống.");

        if (!string.IsNullOrWhiteSpace(request.ApiKey))
            return Result<AiSettingsStatusDto>.Failure("Admin không lưu API Key. Thủ thư tự cấu hình khóa của mình.");

        var settings = await _repository.GetOrCreateAsync(ct);
        if (request.IsEnabled.HasValue)
            settings.IsEnabled = request.IsEnabled.Value;
        if (request.ReaderAiEnabled.HasValue)
            settings.ReaderAiEnabled = request.ReaderAiEnabled.Value;
        if (request.LibrarianAiEnabled.HasValue)
            settings.LibrarianAiEnabled = request.LibrarianAiEnabled.Value;
        if (request.RecommendEnabled.HasValue)
            settings.RecommendEnabled = request.RecommendEnabled.Value;
        if (request.TrendsEnabled.HasValue)
            settings.TrendsEnabled = request.TrendsEnabled.Value;
        if (request.OverduePredictEnabled.HasValue)
            settings.OverduePredictEnabled = request.OverduePredictEnabled.Value;

        var libraryUser = await LoadLibraryUserAsync(settings, ct);
        var ragOn = settings.IsEnabled
            && (settings.ReaderAiEnabled || settings.RecommendEnabled || settings.LibrarianAiEnabled);
        var provider = libraryUser?.Provider ?? settings.Provider;
        var embeddingProvider = libraryUser is null ? provider : SelectedEmbeddingProvider(libraryUser, ReadBag(libraryUser));
        if (ragOn && libraryUser is not null
            && !HasEmbeddingConfiguration(libraryUser, ReadBag(libraryUser), embeddingProvider))
            return Result<AiSettingsStatusDto>.Failure(
                "Cấu hình thư viện chưa chọn embedding ONNX cục bộ hoặc nhà cung cấp embedding có API Key.");

        settings.UpdatedBy = actorId;
        settings.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveAsync(settings, ct);
        return Result<AiSettingsStatusDto>.Success(await GetStatusAsync(role, actorId, ct));
    }

    public async Task<Result<AiSettingsStatusDto>> SaveMyProviderAsync(
        SaveAiSettingsRequest request,
        string role,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!IsLibrarianOnly(role))
            return Result<AiSettingsStatusDto>.Failure("Chỉ Thủ thư được lưu API Key cá nhân.");
        if (actorId == Guid.Empty)
            return Result<AiSettingsStatusDto>.Failure("Không xác định được tài khoản.");

        var policy = await _repository.GetOrCreateAsync(ct);
        var user = await _repository.GetOrCreateUserAsync(actorId, ct);
        var bag = ReadBag(user);

        if (!string.IsNullOrWhiteSpace(user.EncryptedApiKey))
        {
            var active = GetOrCreateState(bag, NormalizeProvider(user.Provider));
            if (string.IsNullOrWhiteSpace(active.EncryptedApiKey))
                SyncActiveIntoBag(user, bag);
        }

        var previousEmbedding = SelectedEmbeddingConfig(user, bag);
        if (request.ClearProvider == true)
        {
            ClearProvider(user, bag, request.Provider);
        }
        else if (!string.IsNullOrWhiteSpace(request.Provider))
        {
            var provider = NormalizeProvider(request.Provider);
            var applied = ApplyProvider(user, bag, provider, request);
            if (applied is not null)
                return Result<AiSettingsStatusDto>.Failure(applied);
        }
        else
        {
            if (!string.IsNullOrWhiteSpace(request.ChatModel))
                user.ChatModel = request.ChatModel.Trim();
            if (!string.IsNullOrWhiteSpace(request.EmbeddingModel))
                user.EmbeddingModel = request.EmbeddingModel.Trim();
            var keyError = TryApplyApiKey(user, request.ApiKey);
            if (keyError is not null)
                return Result<AiSettingsStatusDto>.Failure(keyError);
            SyncActiveIntoBag(user, bag);
        }

        var embeddingSelection = ApplyEmbeddingSelection(user, bag, request);
        if (embeddingSelection is not null)
            return Result<AiSettingsStatusDto>.Failure(embeddingSelection);

        var ragOn = policy.IsEnabled
            && (policy.ReaderAiEnabled || policy.RecommendEnabled || policy.LibrarianAiEnabled);
        var selectedEmbeddingProvider = SelectedEmbeddingProvider(user, bag);
        var hasEmbeddingCredential = HasEmbeddingConfiguration(user, bag, selectedEmbeddingProvider);
        var isAlreadyLibrary = policy.ActiveLibrarianUserId == actorId;
        if (ragOn && (request.UseForLibrary == true || isAlreadyLibrary) && !hasEmbeddingCredential)
            return Result<AiSettingsStatusDto>.Failure(
                "Cấu hình chat đã lưu, nhưng cần chọn embedding ONNX cục bộ hoặc lưu API Key của nhà cung cấp embedding trước khi dùng cho RAG.");

        user.ProviderKeysJson = JsonSerializer.Serialize(bag, JsonOptions);
        user.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveUserAsync(user, ct);

        var policyDirty = false;
        if (HasChatConfiguration(user)
            && (request.UseForLibrary == true
                || (policy.ActiveLibrarianUserId is null && hasEmbeddingCredential)))
        {
            policy.ActiveLibrarianUserId = actorId;
            policyDirty = true;
        }

        if (policy.ActiveLibrarianUserId == actorId
            && !string.Equals(previousEmbedding, SelectedEmbeddingConfig(user, bag), StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(previousEmbedding))
        {
            policyDirty = true;
        }

        if (policyDirty)
        {
            policy.UpdatedBy = actorId;
            policy.UpdatedAt = DateTime.UtcNow;
            await _repository.SaveAsync(policy, ct);
        }

        return Result<AiSettingsStatusDto>.Success(await GetStatusAsync(role, actorId, ct));
    }

    public async Task<Result<AiSettingsStatusDto>> UseMyConfigForLibraryAsync(
        string role,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!IsLibrarianOnly(role))
            return Result<AiSettingsStatusDto>.Failure("Chỉ Thủ thư được chọn cấu hình dùng cho thư viện.");
        if (actorId == Guid.Empty)
            return Result<AiSettingsStatusDto>.Failure("Không xác định được tài khoản.");

        var user = await _repository.GetUserAsync(actorId, ct);
        if (user is null || !HasChatConfiguration(user))
            return Result<AiSettingsStatusDto>.Failure("Hãy lưu cấu hình nhà cung cấp AI trước khi dùng cấu hình này cho độc giả.");
        if (!user.IsEnabled)
            return Result<AiSettingsStatusDto>.Failure("Admin đã tắt quyền AI của tài khoản này.");
        var bag = ReadBag(user);
        var embeddingProvider = SelectedEmbeddingProvider(user, bag);
        if (!HasEmbeddingConfiguration(user, bag, embeddingProvider))
            return Result<AiSettingsStatusDto>.Failure(
                "Cần chọn embedding ONNX cục bộ hoặc cấu hình nhà cung cấp embedding trước khi dùng cho độc giả.");

        var policy = await _repository.GetOrCreateAsync(ct);
        policy.ActiveLibrarianUserId = actorId;
        policy.UpdatedBy = actorId;
        policy.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveAsync(policy, ct);
        return Result<AiSettingsStatusDto>.Success(await GetStatusAsync(role, actorId, ct));
    }

    public async Task<Result<AiSettingsStatusDto>> SetLibrarianAccountEnabledAsync(
        Guid targetUserId,
        bool enabled,
        string role,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!IsAdmin(role))
            return Result<AiSettingsStatusDto>.Failure("Chỉ Admin được bật hoặc tắt quyền AI của thủ thư.");
        if (targetUserId == Guid.Empty)
            return Result<AiSettingsStatusDto>.Failure("Thiếu tài khoản thủ thư.");

        var user = await _repository.GetOrCreateUserAsync(targetUserId, ct);
        user.IsEnabled = enabled;
        user.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveUserAsync(user, ct);

        var policy = await _repository.GetOrCreateAsync(ct);
        if (!enabled && policy.ActiveLibrarianUserId == targetUserId)
        {
            policy.ActiveLibrarianUserId = null;
            policy.UpdatedBy = actorId;
            policy.UpdatedAt = DateTime.UtcNow;
            await _repository.SaveAsync(policy, ct);
        }

        return Result<AiSettingsStatusDto>.Success(await GetStatusAsync(role, actorId, ct));
    }

    public async Task<Result<AiSettingsStatusDto>> SaveLibrarianAsync(
        SaveLibrarianAiSettingsRequest request,
        string role,
        Guid actorId,
        CancellationToken ct = default)
    {
        if (!IsStaff(role))
            return Result<AiSettingsStatusDto>.Failure("Chỉ Thủ thư hoặc Admin được đổi cấu hình AI của thủ thư.");

        var settings = await _repository.GetOrCreateAsync(ct);
        if (IsAdmin(role))
        {
            settings.LibrarianAiEnabled = request.LibrarianAiEnabled;
        }
        else if (request.LibrarianAiEnabled != settings.LibrarianAiEnabled)
        {
            return Result<AiSettingsStatusDto>.Failure(
                "Chỉ Admin được bật hoặc tắt gợi ý nhập sách. Thủ thư chỉ chỉnh tiêu chí.");
        }

        var flags = ReadCriteria(settings);
        if (request.UseMajor.HasValue) flags.UseMajor = request.UseMajor.Value;
        if (request.UseCategory.HasValue) flags.UseCategory = request.UseCategory.Value;
        if (request.UseHistory.HasValue) flags.UseHistory = request.UseHistory.Value;
        if (request.UseReviews.HasValue) flags.UseReviews = request.UseReviews.Value;
        if (request.UseGoals.HasValue) flags.UseGoals = request.UseGoals.Value;
        settings.LibrarianCriteriaJson = JsonSerializer.Serialize(flags, JsonOptions);
        settings.UpdatedBy = actorId;
        settings.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveAsync(settings, ct);
        return Result<AiSettingsStatusDto>.Success(await GetStatusAsync(role, actorId, ct));
    }

    public async Task<Result<AiConnectionTestDto>> TestConnectionAsync(
        string role,
        Guid actorId = default,
        string? provider = null,
        CancellationToken ct = default)
    {
        if (IsAdmin(role))
            return await TestLibraryAsync(provider, ct);
        if (!IsLibrarianOnly(role))
            return Result<AiConnectionTestDto>.Failure("Chỉ Thủ thư được kiểm tra API Key của mình.");
        if (actorId == Guid.Empty)
            return Result<AiConnectionTestDto>.Failure("Không xác định được tài khoản.");

        var user = await _repository.GetUserAsync(actorId, ct);
        if (user is null)
            return Result<AiConnectionTestDto>.Failure("Chưa cấu hình nhà cung cấp AI.");
        if (!user.IsEnabled)
            return Result<AiConnectionTestDto>.Failure("Admin đã tắt quyền AI của tài khoản này.");

        var bag = ReadBag(user);
        var target = string.IsNullOrWhiteSpace(provider)
            ? NormalizeProvider(user.Provider)
            : NormalizeProvider(provider);
        if (!IsProviderConfigured(user, bag, target))
            return Result<AiConnectionTestDto>.Failure("Chưa cấu hình nhà cung cấp AI.");
        if (!TryUnlockProvider(user, bag, target, out var apiKey, out var chatModel, out var baseUrl))
            return Result<AiConnectionTestDto>.Failure(
                HasStoredProviderKey(user, bag, target)
                    ? CredentialEncryptionError
                    : "Chưa lưu cấu hình cho nhà cung cấp này.");

        var state = GetOrCreateState(bag, target);
        var embeddingProvider = SelectedEmbeddingProvider(user, bag);
        var embeddingState = GetOrCreateState(bag, embeddingProvider);
        var embeddingModel = string.IsNullOrWhiteSpace(embeddingState.EmbeddingModel)
            ? embeddingProvider == "local" ? AiRuntimeCredential.LocalEmbeddingModelId : user.EmbeddingModel
            : embeddingState.EmbeddingModel;
        var embeddingKey = string.Empty;
        string? embeddingBaseUrl = null;
        var hasEmbeddingKey = embeddingProvider == "local"
            || TryUnlockProvider(user, bag, embeddingProvider, out embeddingKey, out _, out embeddingBaseUrl);
        var result = await RunTestAsync(
            target,
            apiKey,
            chatModel,
            embeddingProvider,
            embeddingKey,
            embeddingModel,
            baseUrl,
            embeddingBaseUrl,
            hasEmbeddingKey,
            async (testedAt, ok, message) =>
            {
                WriteTestResult(user, bag, state, target, testedAt, ok, message);
                await _repository.SaveUserAsync(user, ct);
            },
            ct);
        if (!result.IsSuccess || result.Data?.Ok == false)
            await NotifyCredentialAsync(actorId, result.Error ?? result.Data?.Message, ct);
        return result;
    }

    public async Task<Result<AiRuntimeCredential>> ResolveLibraryAsync(CancellationToken ct = default)
    {
        var policy = await _repository.GetOrCreateAsync(ct);
        var libraryUser = await LoadLibraryUserAsync(policy, ct);
        if (libraryUser is not null && libraryUser.IsEnabled)
        {
            var key = Unlock(libraryUser);
            if (!string.IsNullOrWhiteSpace(key) || IsOllama(libraryUser.Provider))
                return ToCredential(libraryUser, key ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(libraryUser.EncryptedApiKey))
                return Result<AiRuntimeCredential>.Failure(CredentialEncryptionError);
        }

        string? legacy;
        try
        {
            legacy = UnlockApiKey(policy);
        }
        catch (InvalidOperationException ex)
        {
            return Result<AiRuntimeCredential>.Failure(ex.Message);
        }
        if (!string.IsNullOrWhiteSpace(legacy))
        {
            if (!SupportsEmbedding(policy.Provider))
                return Result<AiRuntimeCredential>.Failure(
                    "Cấu hình chat đã lưu nhưng chưa có nhà cung cấp embedding Gemini hoặc OpenAI.");
            return Result<AiRuntimeCredential>.Success(new AiRuntimeCredential
            {
                ApiKey = legacy,
                Provider = policy.Provider,
                ChatModel = policy.ChatModel,
                EmbeddingProvider = policy.Provider,
                EmbeddingApiKey = legacy,
                EmbeddingModel = policy.EmbeddingModel,
                BaseUrl = policy.BaseUrl,
                EmbeddingBaseUrl = policy.BaseUrl
            });
        }

        return Result<AiRuntimeCredential>.Failure("Chưa cấu hình nhà cung cấp AI.");
    }

    public async Task<Result<AiRuntimeCredential>> ResolveForAskAsync(
        string role,
        Guid? userId,
        CancellationToken ct = default)
    {
        var policy = await _repository.GetOrCreateAsync(ct);
        var blocked = GateAsk(policy, role);
        if (blocked is not null)
            return Result<AiRuntimeCredential>.Failure(blocked);

        if (IsLibrarianOnly(role) && userId is Guid id && id != Guid.Empty)
        {
            var user = await _repository.GetUserAsync(id, ct);
            if (user is not null && !user.IsEnabled)
                return Result<AiRuntimeCredential>.Failure("Admin đã tắt quyền AI của tài khoản này.");
            var key = user is null ? null : Unlock(user);
            if (string.IsNullOrWhiteSpace(key) && !IsOllama(user?.Provider))
            {
                if (!string.IsNullOrWhiteSpace(user?.EncryptedApiKey))
                    return Result<AiRuntimeCredential>.Failure(CredentialEncryptionError);
                return Result<AiRuntimeCredential>.Failure("Chưa cấu hình nhà cung cấp AI.");
            }

            return ToCredential(user!, key ?? string.Empty);
        }

        return await ResolveLibraryAsync(ct);
    }

    public async Task<AiSetting> GetEntityAsync(CancellationToken ct = default)
        => await _repository.GetOrCreateAsync(ct);

    public async Task UpdateSyncStatsAsync(
        DateTime syncedAt,
        int documentCount,
        string? embeddingModel = null,
        CancellationToken ct = default)
    {
        var settings = await _repository.GetOrCreateAsync(ct);
        settings.DocumentsSyncedAt = syncedAt;
        settings.DocumentCount = documentCount;
        if (!string.IsNullOrWhiteSpace(embeddingModel))
            settings.IndexEmbeddingModel = embeddingModel;
        settings.UpdatedAt = DateTime.UtcNow;
        await _repository.SaveAsync(settings, ct);
    }

    public string? UnlockApiKey(AiSetting settings)
    {
        if (string.IsNullOrWhiteSpace(settings.EncryptedApiKey))
            return null;
        try
        {
            return _protector.Unprotect(settings.EncryptedApiKey);
        }
        catch (Exception ex) when (ex is System.Security.Cryptography.CryptographicException
                                   or FormatException
                                   or InvalidOperationException)
        {
            throw new InvalidOperationException(CredentialEncryptionError, ex);
        }
    }

    public static string? GateAsk(AiSetting settings, string role)
    {
        if (!settings.IsEnabled)
            return "Hệ thống AI đang tắt.";
        if (!IsStaff(role) && !settings.ReaderAiEnabled)
            return "Trợ lý AI dành cho độc giả đang tắt.";
        if (string.Equals(role, LibrarianRole, StringComparison.OrdinalIgnoreCase)
            && !settings.LibrarianAiEnabled
            && !settings.ReaderAiEnabled)
            return "AI cho thủ thư đang tắt.";
        return null;
    }

    public static bool IsAdmin(string? role)
        => string.Equals(role, AdminRole, StringComparison.OrdinalIgnoreCase);

    public static bool IsStaff(string? role)
        => IsAdmin(role) || string.Equals(role, LibrarianRole, StringComparison.OrdinalIgnoreCase);

    public static bool IsLibrarianOnly(string? role)
        => string.Equals(role, LibrarianRole, StringComparison.OrdinalIgnoreCase);

    private async Task<Result<AiConnectionTestDto>> TestLibraryAsync(string? provider, CancellationToken ct)
    {
        var resolved = await ResolveLibraryAsync(ct);
        if (!resolved.IsSuccess)
            return Result<AiConnectionTestDto>.Failure(resolved.Error ?? "Chưa cấu hình nhà cung cấp AI.");

        var cred = resolved.Data!;
        var target = string.IsNullOrWhiteSpace(provider) ? cred.Provider : NormalizeProvider(provider);
        if (!string.Equals(target, cred.Provider, StringComparison.OrdinalIgnoreCase))
            return Result<AiConnectionTestDto>.Failure("Admin chỉ kiểm tra nhà cung cấp đang dùng cho thư viện, không đọc khóa cá nhân.");

        var result = await RunTestAsync(
            cred.Provider,
            cred.ApiKey,
            cred.ChatModel,
            cred.EmbeddingProvider,
            cred.EmbeddingApiKey,
            cred.EmbeddingModel,
            cred.BaseUrl,
            cred.EmbeddingBaseUrl,
            true,
            (_, _, _) => Task.CompletedTask,
            ct);
        if (!result.IsSuccess || result.Data?.Ok == false)
            await NotifyCredentialAsync(cred.OwnerUserId, result.Error ?? result.Data?.Message, ct);
        return result;
    }

    private async Task<Result<AiConnectionTestDto>> RunTestAsync(
        string provider,
        string apiKey,
        string chatModel,
        string embeddingProvider,
        string embeddingApiKey,
        string embeddingModel,
        string? baseUrl,
        string? embeddingBaseUrl,
        bool hasEmbeddingCredential,
        Func<DateTime, bool, string, Task> persist,
        CancellationToken ct)
    {
        var testedAt = DateTime.UtcNow;
        try
        {
            using var chatCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            chatCts.CancelAfter(TimeSpan.FromSeconds(90));
            var reply = await _gemini.GenerateAsync(
                provider, apiKey, chatModel, "Reply with exactly: OK", baseUrl, chatCts.Token);
            var ok = !string.IsNullOrWhiteSpace(reply);
            var message = ok
                ? $"{DisplayName(provider)} phản hồi chat thành công."
                : $"{DisplayName(provider)} không trả về nội dung.";

            if (ok && SupportsEmbedding(embeddingProvider) && hasEmbeddingCredential)
            {
                try
                {
                    using var embedCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                    embedCts.CancelAfter(embeddingProvider == "local"
                        ? TimeSpan.FromMinutes(3)
                        : TimeSpan.FromSeconds(25));
                    var vector = await _gemini.EmbedAsync(
                        embeddingProvider,
                        embeddingApiKey,
                        embeddingModel,
                        "SmartLibrary connection test",
                        embeddingBaseUrl,
                        embedCts.Token);
                    if (vector.Length == 0)
                    {
                        ok = false;
                        message = $"{DisplayName(provider)} chat được nhưng embedding trống.";
                    }
                    else
                        message = $"{DisplayName(provider)} chat và embedding {DisplayName(embeddingProvider)} phản hồi thành công.";
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    ok = false;
                    message = $"{DisplayName(provider)} chat thành công nhưng embedding {DisplayName(embeddingProvider)} quá thời gian chờ.";
                }
            }
            else if (ok)
            {
                message = hasEmbeddingCredential
                    ? $"{DisplayName(provider)} chat thành công. Nhà cung cấp embedding chưa được hỗ trợ."
                    : $"{DisplayName(provider)} chat thành công. Chưa cấu hình nhà cung cấp embedding.";
            }

            await persist(testedAt, ok, message);
            return Result<AiConnectionTestDto>.Success(new AiConnectionTestDto
            {
                Ok = ok,
                Message = message,
                TestedAt = testedAt,
                Provider = provider
            });
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            const string message = "Kiểm tra kết nối AI quá thời gian chờ. Hãy thử lại; nếu tiếp tục, kiểm tra kết nối mạng của máy chủ tới nhà cung cấp AI.";
            await persist(testedAt, false, message);
            return FailedTest(provider, testedAt, message);
        }
        catch (Exception ex)
        {
            var message = TrimError(ex.Message);
            await persist(testedAt, false, message);
            return FailedTest(provider, testedAt, message);
        }
    }

    private static Result<AiConnectionTestDto> FailedTest(string provider, DateTime testedAt, string message)
        => Result<AiConnectionTestDto>.Success(new AiConnectionTestDto
        {
            Ok = false,
            Message = message,
            TestedAt = testedAt,
            Provider = provider
        });

    private Task<UserAiSetting?> LoadLibraryUserAsync(AiSetting policy, CancellationToken ct)
        => policy.ActiveLibrarianUserId is Guid id
            ? _repository.GetUserAsync(id, ct)
            : Task.FromResult<UserAiSetting?>(null);

    private async Task NotifyCredentialAsync(Guid? ownerId, string? detail, CancellationToken ct)
    {
        if (_inbox is null || ownerId is not Guid id || id == Guid.Empty || string.IsNullOrWhiteSpace(detail))
            return;
        try
        {
            await _inbox.NotifyAiCredentialAsync(id, detail, ct);
        }
        catch (Exception)
        {
            // Connection test result still returns to the caller.
        }
    }

    private string? Unlock(UserAiSetting settings)
    {
        if (string.IsNullOrWhiteSpace(settings.EncryptedApiKey))
            return null;
        try
        {
            return _protector.Unprotect(settings.EncryptedApiKey);
        }
        catch (Exception)
        {
            return null;
        }
    }

    private Result<AiRuntimeCredential> ToCredential(UserAiSetting user, string apiKey)
    {
        var bag = ReadBag(user);
        var embeddingProvider = SelectedEmbeddingProvider(user, bag);
        var embeddingKey = string.Empty;
        string? embeddingBaseUrl = null;
        if (!HasEmbeddingConfiguration(user, bag, embeddingProvider)
            || (embeddingProvider != "local"
                && !TryUnlockProvider(user, bag, embeddingProvider, out embeddingKey, out _, out embeddingBaseUrl)))
        {
            return Result<AiRuntimeCredential>.Failure(
                "Cấu hình chat đã lưu nhưng chưa có nhà cung cấp embedding. Chọn ONNX cục bộ hoặc cấu hình nhà cung cấp embedding.");
        }

        var embeddingModel = bag.TryGetValue(embeddingProvider, out var embeddingState)
            && !string.IsNullOrWhiteSpace(embeddingState.EmbeddingModel)
                ? embeddingState.EmbeddingModel
                : embeddingProvider == "local"
                    ? AiRuntimeCredential.LocalEmbeddingModelId
                    : user.EmbeddingModel;
        return Result<AiRuntimeCredential>.Success(new AiRuntimeCredential
        {
            OwnerUserId = user.UserId,
            ApiKey = apiKey,
            Provider = user.Provider,
            ChatModel = user.ChatModel,
            EmbeddingProvider = embeddingProvider,
            EmbeddingApiKey = embeddingKey,
            EmbeddingModel = embeddingModel,
            BaseUrl = user.BaseUrl,
            EmbeddingBaseUrl = embeddingBaseUrl
        });
    }

    private static void ClearProvider(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string? providerId)
    {
        var provider = NormalizeProvider(string.IsNullOrWhiteSpace(providerId) ? settings.Provider : providerId);
        bag.Remove(provider);
        if (!string.Equals(settings.Provider, provider, StringComparison.OrdinalIgnoreCase))
            return;

        var fallback = bag.FirstOrDefault(item => !string.IsNullOrWhiteSpace(item.Value.EncryptedApiKey));
        if (!string.IsNullOrWhiteSpace(fallback.Key))
        {
            ApplyState(settings, fallback.Key, fallback.Value);
            return;
        }

        settings.EncryptedApiKey = null;
        settings.ApiKeyLast4 = null;
    }

    private string? ApplyProvider(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string provider,
        SaveAiSettingsRequest request)
    {
        var state = GetOrCreateState(bag, provider);
        if (IsOllama(provider))
        {
            state.EncryptedApiKey = null;
            state.ApiKeyLast4 = null;
        }
        else
        {
            var keyError = TryApplyApiKey(state, request.ApiKey);
            if (keyError is not null)
                return keyError;

            if (string.IsNullOrWhiteSpace(state.EncryptedApiKey))
                return "Chưa có API Key cho nhà cung cấp này.";
        }

        if (provider == "other")
        {
            var baseUrl = string.IsNullOrWhiteSpace(request.BaseUrl) ? state.BaseUrl : request.BaseUrl.Trim();
            if (string.IsNullOrWhiteSpace(baseUrl))
                return "Nhà cung cấp khác cần Base URL.";
            state.BaseUrl = baseUrl;
        }
        else if (!string.IsNullOrWhiteSpace(request.BaseUrl))
        {
            state.BaseUrl = request.BaseUrl.Trim();
        }

        if (!string.IsNullOrWhiteSpace(request.ChatModel))
            state.ChatModel = request.ChatModel.Trim();
        else if (IsOllama(provider) && string.IsNullOrWhiteSpace(state.ChatModel))
            state.ChatModel = AiRuntimeCredential.LocalChatModelId;
        if (IsOllama(provider) && string.IsNullOrWhiteSpace(state.BaseUrl))
            state.BaseUrl = "http://localhost:11434";
        if (SupportsEmbedding(provider) && !string.IsNullOrWhiteSpace(request.EmbeddingModel))
            state.EmbeddingModel = request.EmbeddingModel.Trim();

        ApplyState(settings, provider, state);
        return null;
    }

    private static string? ApplyEmbeddingSelection(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        SaveAiSettingsRequest request)
    {
        var selected = string.IsNullOrWhiteSpace(request.EmbeddingProvider)
            ? SelectedEmbeddingProvider(settings, bag)
            : NormalizeProvider(request.EmbeddingProvider);
        if (!SupportsEmbedding(selected))
            return "Nhà cung cấp embedding chưa được hỗ trợ.";

        foreach (var provider in KnownProviders)
        {
            var state = GetOrCreateState(bag, provider);
            state.IsEmbeddingProvider = provider == selected;
        }

        var embeddingState = GetOrCreateState(bag, selected);
        if (!string.IsNullOrWhiteSpace(request.EmbeddingModel))
            embeddingState.EmbeddingModel = request.EmbeddingModel.Trim();
        if (!string.IsNullOrWhiteSpace(embeddingState.EmbeddingModel))
            settings.EmbeddingModel = embeddingState.EmbeddingModel;
        return null;
    }

    private static string SelectedEmbeddingProvider(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag)
    {
        var selected = bag.FirstOrDefault(pair => pair.Value.IsEmbeddingProvider);
        if (!string.IsNullOrWhiteSpace(selected.Key) && SupportsEmbedding(selected.Key))
            return selected.Key;
        if (SupportsEmbedding(settings.Provider))
            return NormalizeProvider(settings.Provider);
        return KnownProviders.FirstOrDefault(provider =>
                   HasEmbeddingConfiguration(settings, bag, provider))
               ?? "gemini";
    }

    private static string SelectedEmbeddingConfig(UserAiSetting settings, Dictionary<string, StoredProviderState> bag)
    {
        var provider = SelectedEmbeddingProvider(settings, bag);
        var model = bag.TryGetValue(provider, out var state) && !string.IsNullOrWhiteSpace(state.EmbeddingModel)
            ? state.EmbeddingModel
            : provider == "local"
                ? AiRuntimeCredential.LocalEmbeddingModelId
                : settings.EmbeddingModel;
        return $"v2:{provider}:{model}";
    }

    private static void ApplyState(UserAiSetting settings, string provider, StoredProviderState state)
    {
        settings.Provider = provider;
        settings.EncryptedApiKey = state.EncryptedApiKey;
        settings.ApiKeyLast4 = state.ApiKeyLast4;
        settings.ChatModel = string.IsNullOrWhiteSpace(state.ChatModel) ? settings.ChatModel : state.ChatModel;
        if (!string.IsNullOrWhiteSpace(state.EmbeddingModel))
            settings.EmbeddingModel = state.EmbeddingModel;
        settings.BaseUrl = state.BaseUrl;
    }

    private string? TryApplyApiKey(UserAiSetting settings, string? apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey) || IsMaskedKey(apiKey))
            return null;

        var trimmed = apiKey.Trim();
        if (trimmed.Length < 20)
            return "API Key không hợp lệ.";

        settings.EncryptedApiKey = _protector.Protect(trimmed);
        settings.ApiKeyLast4 = trimmed[^4..];
        return null;
    }

    private string? TryApplyApiKey(StoredProviderState state, string? apiKey)
    {
        if (string.IsNullOrWhiteSpace(apiKey) || IsMaskedKey(apiKey))
            return null;

        var trimmed = apiKey.Trim();
        if (trimmed.Length < 20)
            return "API Key không hợp lệ.";

        state.EncryptedApiKey = _protector.Protect(trimmed);
        state.ApiKeyLast4 = trimmed[^4..];
        return null;
    }

    private bool TryUnlockProvider(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string provider,
        out string apiKey,
        out string chatModel,
        out string? baseUrl)
    {
        apiKey = string.Empty;
        chatModel = settings.ChatModel;
        baseUrl = settings.BaseUrl;

        if (IsOllama(provider))
        {
            if (bag.TryGetValue(provider, out var localState))
            {
                chatModel = string.IsNullOrWhiteSpace(localState.ChatModel)
                    ? AiRuntimeCredential.LocalChatModelId
                    : localState.ChatModel;
                baseUrl = string.IsNullOrWhiteSpace(localState.BaseUrl)
                    ? "http://localhost:11434"
                    : localState.BaseUrl;
                return !string.IsNullOrWhiteSpace(localState.ChatModel);
            }

            if (IsOllama(settings.Provider) && !string.IsNullOrWhiteSpace(settings.ChatModel))
            {
                chatModel = settings.ChatModel;
                baseUrl = string.IsNullOrWhiteSpace(settings.BaseUrl) ? "http://localhost:11434" : settings.BaseUrl;
                return true;
            }
        }

        if (bag.TryGetValue(provider, out var state) && !string.IsNullOrWhiteSpace(state.EncryptedApiKey))
        {
            try
            {
                apiKey = _protector.Unprotect(state.EncryptedApiKey);
            }
            catch (Exception ex) when (ex is System.Security.Cryptography.CryptographicException
                                       or FormatException
                                       or InvalidOperationException)
            {
                return false;
            }
            chatModel = string.IsNullOrWhiteSpace(state.ChatModel) ? settings.ChatModel : state.ChatModel;
            baseUrl = string.IsNullOrWhiteSpace(state.BaseUrl) ? settings.BaseUrl : state.BaseUrl;
            return !string.IsNullOrWhiteSpace(apiKey);
        }

        if (string.Equals(settings.Provider, provider, StringComparison.OrdinalIgnoreCase)
            && !string.IsNullOrWhiteSpace(settings.EncryptedApiKey))
        {
            try
            {
                apiKey = _protector.Unprotect(settings.EncryptedApiKey);
            }
            catch (Exception ex) when (ex is System.Security.Cryptography.CryptographicException
                                       or FormatException
                                       or InvalidOperationException)
            {
                return false;
            }
            return !string.IsNullOrWhiteSpace(apiKey);
        }

        return false;
    }

    private static bool HasStoredProviderKey(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string provider)
        => (bag.TryGetValue(provider, out var state) && !string.IsNullOrWhiteSpace(state.EncryptedApiKey))
           || (string.Equals(settings.Provider, provider, StringComparison.OrdinalIgnoreCase)
               && !string.IsNullOrWhiteSpace(settings.EncryptedApiKey));

    private static bool HasEmbeddingConfiguration(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string provider)
        => string.Equals(provider, "local", StringComparison.OrdinalIgnoreCase)
           || (SupportsEmbedding(provider) && HasStoredProviderKey(settings, bag, provider));

    private static bool IsOllama(string? provider)
        => string.Equals(provider, "ollama", StringComparison.OrdinalIgnoreCase);

    private static bool HasChatConfiguration(UserAiSetting settings)
        => IsOllama(settings.Provider)
            ? !string.IsNullOrWhiteSpace(settings.ChatModel)
            : !string.IsNullOrWhiteSpace(settings.EncryptedApiKey);

    private static bool IsProviderConfigured(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        string provider)
        => IsOllama(provider)
            ? (bag.TryGetValue(provider, out var state) && !string.IsNullOrWhiteSpace(state.ChatModel))
              || (IsOllama(settings.Provider) && !string.IsNullOrWhiteSpace(settings.ChatModel))
            : HasStoredProviderKey(settings, bag, provider);

    private static void WriteTestResult(
        UserAiSetting settings,
        Dictionary<string, StoredProviderState> bag,
        StoredProviderState state,
        string provider,
        DateTime testedAt,
        bool ok,
        string message)
    {
        state.LastTestedAt = testedAt;
        state.LastTestOk = ok;
        state.LastTestMessage = message;
        settings.ProviderKeysJson = JsonSerializer.Serialize(bag, JsonOptions);
        if (string.Equals(settings.Provider, provider, StringComparison.OrdinalIgnoreCase))
        {
            settings.LastTestedAt = testedAt;
            settings.LastTestOk = ok;
            settings.LastTestMessage = message;
        }
        settings.UpdatedAt = testedAt;
    }

    private static void SyncActiveIntoBag(UserAiSetting settings, Dictionary<string, StoredProviderState> bag)
    {
        var state = GetOrCreateState(bag, NormalizeProvider(settings.Provider));
        state.EncryptedApiKey = settings.EncryptedApiKey;
        state.ApiKeyLast4 = settings.ApiKeyLast4;
        state.ChatModel = settings.ChatModel;
        if (SupportsEmbedding(settings.Provider))
            state.EmbeddingModel = settings.EmbeddingModel;
        state.BaseUrl = settings.BaseUrl;
        state.LastTestedAt = settings.LastTestedAt;
        state.LastTestOk = settings.LastTestOk;
        state.LastTestMessage = settings.LastTestMessage;
    }

    private static Dictionary<string, StoredProviderState> ReadBag(UserAiSetting settings)
    {
        if (string.IsNullOrWhiteSpace(settings.ProviderKeysJson))
        {
            var empty = new Dictionary<string, StoredProviderState>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrWhiteSpace(settings.EncryptedApiKey))
                SyncActiveIntoBag(settings, empty);
            return empty;
        }

        try
        {
            var bag = JsonSerializer.Deserialize<Dictionary<string, StoredProviderState>>(settings.ProviderKeysJson, JsonOptions)
                      ?? new Dictionary<string, StoredProviderState>(StringComparer.OrdinalIgnoreCase);
            return new Dictionary<string, StoredProviderState>(bag, StringComparer.OrdinalIgnoreCase);
        }
        catch (JsonException)
        {
            return new Dictionary<string, StoredProviderState>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static StoredProviderState GetOrCreateState(Dictionary<string, StoredProviderState> bag, string provider)
    {
        if (bag.TryGetValue(provider, out var state))
            return state;
        state = new StoredProviderState();
        bag[provider] = state;
        return state;
    }

    private static bool IsMaskedKey(string apiKey)
        => apiKey.All(ch => ch is '*' or '•' or '·' or ' ');

    private static AiSettingsStatusDto MapAdmin(
        AiSetting policy,
        UserAiSetting? libraryUser,
        IReadOnlyList<LibrarianAiAccountRow> accounts)
    {
        var flags = ReadCriteria(policy);
        var hasLibraryKey = (libraryUser is not null && HasChatConfiguration(libraryUser))
                            || !string.IsNullOrWhiteSpace(policy.EncryptedApiKey);
        var provider = libraryUser?.Provider ?? policy.Provider;
        var chat = libraryUser?.ChatModel ?? policy.ChatModel;
        var embed = libraryUser?.EmbeddingModel ?? policy.EmbeddingModel;
        var embeddingProvider = libraryUser is null
            ? NormalizeProvider(provider)
            : SelectedEmbeddingProvider(libraryUser, ReadBag(libraryUser));
        var activeName = accounts.FirstOrDefault(item => item.UserId == policy.ActiveLibrarianUserId)?.FullName;
        return new AiSettingsStatusDto
        {
            HasApiKey = hasLibraryKey,
            ApiKeyLast4 = null,
            Provider = NormalizeProvider(provider),
            EmbeddingProvider = embeddingProvider,
            ChatModel = chat,
            EmbeddingModel = embed,
            BaseUrl = null,
            IsEnabled = policy.IsEnabled,
            ReaderAiEnabled = policy.ReaderAiEnabled,
            LibrarianAiEnabled = policy.LibrarianAiEnabled,
            UseMajor = flags.UseMajor,
            UseCategory = flags.UseCategory,
            UseHistory = flags.UseHistory,
            UseReviews = flags.UseReviews,
            UseGoals = flags.UseGoals,
            RecommendEnabled = policy.RecommendEnabled,
            TrendsEnabled = policy.TrendsEnabled,
            OverduePredictEnabled = policy.OverduePredictEnabled,
            LastTestedAt = libraryUser?.LastTestedAt ?? policy.LastTestedAt,
            LastTestOk = libraryUser?.LastTestOk ?? policy.LastTestOk,
            LastTestMessage = libraryUser?.LastTestMessage ?? policy.LastTestMessage,
            DocumentsSyncedAt = policy.DocumentsSyncedAt,
            DocumentCount = policy.DocumentCount,
            CanEditApiKey = false,
            AccountEnabled = true,
            UseForLibrary = policy.ActiveLibrarianUserId is not null,
            NeedsReindex = NeedsReindex(policy, libraryUser),
            ActiveLibrarianUserId = policy.ActiveLibrarianUserId,
            LibraryLibrarianName = activeName,
            Providers = [],
            LibrarianAccounts = accounts.Select(item => new LibrarianAiAccountDto
            {
                UserId = item.UserId,
                FullName = item.FullName,
                Email = item.Email,
                HasApiKey = item.HasApiKey,
                IsEnabled = item.IsEnabled,
                IsLibraryActive = item.UserId == policy.ActiveLibrarianUserId,
                Provider = item.Provider,
                ChatModel = item.ChatModel,
                EmbeddingModel = item.EmbeddingModel,
                LastTestedAt = item.LastTestedAt,
                LastTestOk = item.LastTestOk,
                LastTestMessage = item.LastTestMessage,
                LastUsedAt = item.LastUsedAt
            }).ToList()
        };
    }

    private AiSettingsStatusDto MapLibrarian(
        AiSetting policy,
        UserAiSetting? mine,
        UserAiSetting? libraryUser,
        Guid actorId)
    {
        var flags = ReadCriteria(policy);
        var bag = mine is null
            ? new Dictionary<string, StoredProviderState>(StringComparer.OrdinalIgnoreCase)
            : ReadBag(mine);
        var active = NormalizeProvider(mine?.Provider ?? "gemini");
        var hasActiveState = bag.TryGetValue(active, out var activeState);
        var selectedEmbeddingProvider = mine is null ? active : SelectedEmbeddingProvider(mine, bag);
        var canShowKeyMeta = mine is not null;
        var providers = KnownProviders.Select(id =>
        {
            bag.TryGetValue(id, out var state);
            var hasKey = !string.IsNullOrWhiteSpace(state?.EncryptedApiKey)
                         || (id == active && mine is not null && HasChatConfiguration(mine))
                         || (IsOllama(id) && !string.IsNullOrWhiteSpace(state?.ChatModel));
            var revealed = string.Empty;
            if (mine is not null)
                TryUnlockProvider(mine, bag, id, out revealed, out _, out _);
            return new AiProviderStatusDto
            {
                Id = id,
                HasApiKey = hasKey,
                ApiKey = string.IsNullOrWhiteSpace(revealed) ? null : revealed,
                ApiKeyLast4 = canShowKeyMeta ? state?.ApiKeyLast4 ?? (id == active ? mine?.ApiKeyLast4 : null) : null,
                ChatModel = state?.ChatModel ?? (id == active ? mine?.ChatModel : null),
                EmbeddingModel = state?.EmbeddingModel ?? (id == active ? mine?.EmbeddingModel : null),
                BaseUrl = canShowKeyMeta ? state?.BaseUrl ?? (id == active ? mine?.BaseUrl : null) : null,
                LastTestedAt = state?.LastTestedAt ?? (id == active ? mine?.LastTestedAt : null),
                LastTestOk = state?.LastTestOk ?? (id == active ? mine?.LastTestOk : null),
                LastTestMessage = state?.LastTestMessage ?? (id == active ? mine?.LastTestMessage : null),
                IsActive = id == active
            };
        }).ToList();

        return new AiSettingsStatusDto
        {
            HasApiKey = mine is not null && HasChatConfiguration(mine),
            ApiKey = providers.FirstOrDefault(item => item.IsActive)?.ApiKey,
            ApiKeyLast4 = mine?.ApiKeyLast4,
            Provider = active,
            EmbeddingProvider = selectedEmbeddingProvider,
            ChatModel = mine?.ChatModel ?? "gemini-3.8-flash",
            EmbeddingModel = bag.TryGetValue(selectedEmbeddingProvider, out var selectedEmbeddingState)
                             && !string.IsNullOrWhiteSpace(selectedEmbeddingState.EmbeddingModel)
                ? selectedEmbeddingState.EmbeddingModel
                : mine?.EmbeddingModel ?? "gemini-embedding-001",
            BaseUrl = mine?.BaseUrl,
            IsEnabled = policy.IsEnabled,
            ReaderAiEnabled = policy.ReaderAiEnabled,
            LibrarianAiEnabled = policy.LibrarianAiEnabled,
            UseMajor = flags.UseMajor,
            UseCategory = flags.UseCategory,
            UseHistory = flags.UseHistory,
            UseReviews = flags.UseReviews,
            UseGoals = flags.UseGoals,
            RecommendEnabled = policy.RecommendEnabled,
            TrendsEnabled = policy.TrendsEnabled,
            OverduePredictEnabled = policy.OverduePredictEnabled,
            LastTestedAt = hasActiveState ? activeState!.LastTestedAt : mine?.LastTestedAt,
            LastTestOk = hasActiveState ? activeState!.LastTestOk : mine?.LastTestOk,
            LastTestMessage = hasActiveState ? activeState!.LastTestMessage : mine?.LastTestMessage,
            DocumentsSyncedAt = policy.DocumentsSyncedAt,
            DocumentCount = policy.DocumentCount,
            CanEditApiKey = true,
            AccountEnabled = mine?.IsEnabled ?? true,
            UseForLibrary = policy.ActiveLibrarianUserId == actorId && actorId != Guid.Empty,
            NeedsReindex = policy.ActiveLibrarianUserId == actorId && NeedsReindex(policy, mine ?? libraryUser),
            ActiveLibrarianUserId = policy.ActiveLibrarianUserId,
            Providers = providers
        };
    }

    private static bool NeedsReindex(AiSetting policy, UserAiSetting? libraryUser)
    {
        if (libraryUser is null || string.IsNullOrWhiteSpace(libraryUser.EmbeddingModel))
            return false;
        if (string.IsNullOrWhiteSpace(policy.IndexEmbeddingModel))
            return policy.DocumentCount > 0;
        return !string.Equals(
            policy.IndexEmbeddingModel,
            SelectedEmbeddingConfig(libraryUser, ReadBag(libraryUser)),
            StringComparison.OrdinalIgnoreCase);
    }

    public static LibrarianCriteriaFlags ReadCriteria(AiSetting settings)
    {
        if (string.IsNullOrWhiteSpace(settings.LibrarianCriteriaJson))
            return new LibrarianCriteriaFlags();

        try
        {
            return JsonSerializer.Deserialize<LibrarianCriteriaFlags>(settings.LibrarianCriteriaJson, JsonOptions)
                   ?? new LibrarianCriteriaFlags();
        }
        catch (JsonException)
        {
            return new LibrarianCriteriaFlags();
        }
    }

    public static bool SupportsEmbedding(string? provider)
    {
        var id = NormalizeProvider(provider);
        return id is "gemini" or "openai" or "openrouter" or "other" or "local";
    }

    public static string NormalizeProvider(string? provider)
    {
        var value = string.IsNullOrWhiteSpace(provider) ? "gemini" : provider.Trim().ToLowerInvariant();
        return KnownProviders.Contains(value) ? value : "other";
    }

    public static string DisplayName(string provider) => provider switch
    {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic Claude",
        "deepseek" => "DeepSeek",
        "openrouter" => "OpenRouter",
        "huggingface" => "Hugging Face",
        "ollama" => "Ollama (local)",
        "local" => "Embedding ONNX cục bộ",
        "other" => "Nhà cung cấp khác",
        _ => "Google Gemini"
    };

    private static string TrimError(string message)
    {
        var text = message.Replace("apiKey=", "apiKey=***", StringComparison.OrdinalIgnoreCase);
        if (text.Contains("no longer available", StringComparison.OrdinalIgnoreCase)
            || (text.Contains("gemini", StringComparison.OrdinalIgnoreCase)
                && text.Contains("notfound", StringComparison.OrdinalIgnoreCase)))
        {
            return "Model chat Gemini hiện không dùng được. Chọn gemini-3.8-flash rồi lưu cấu hình.";
        }

        if (text.Contains("no longer available", StringComparison.OrdinalIgnoreCase)
            || (text.Contains("gemini", StringComparison.OrdinalIgnoreCase)
                && text.Contains("notfound", StringComparison.OrdinalIgnoreCase)))
        {
            return "Model chat Gemini hiện không dùng được. Chọn gemini-3.8-flash rồi lưu cấu hình.";
        }

        return text.Length <= 280 ? text : text[..280];
    }
}
