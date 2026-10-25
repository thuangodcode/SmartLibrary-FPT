using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using SmartLibrary.Application.Features.Ai;

namespace SmartLibrary.Infrastructure.Services;

public sealed class GeminiClient : IGeminiClient
{
    private readonly HttpClient _http;

    public GeminiClient(HttpClient http) => _http = http;

    public Task<string> GenerateAsync(string apiKey, string model, string prompt, CancellationToken ct = default)
        => GenerateAsync("gemini", apiKey, model, prompt, null, ct);

    public Task<float[]> EmbedAsync(string apiKey, string model, string text, CancellationToken ct = default)
        => EmbedAsync("gemini", apiKey, model, text, null, ct);

    public Task<string> GenerateAsync(
        string provider,
        string apiKey,
        string model,
        string prompt,
        string? baseUrl,
        CancellationToken ct = default)
    {
        var kind = Normalize(provider);
        return kind switch
        {
            "gemini" => GeminiGenerateAsync(apiKey, model, prompt, ct),
            "anthropic" => AnthropicGenerateAsync(apiKey, model, prompt, ct),
            _ => OpenAiGenerateAsync(kind, apiKey, model, prompt, baseUrl, ct)
        };
    }

    public Task<float[]> EmbedAsync(
        string provider,
        string apiKey,
        string model,
        string text,
        string? baseUrl,
        CancellationToken ct = default)
    {
        var kind = Normalize(provider);
        return kind switch
        {
            "gemini" => GeminiEmbedAsync(apiKey, model, text, ct),
            "openai" or "openrouter" or "other" => OpenAiEmbedAsync(kind, apiKey, model, text, baseUrl, ct),
            _ => throw new InvalidOperationException("Nhà cung cấp này không hỗ trợ embedding 768 chiều. Dùng Gemini hoặc OpenAI cho RAG.")
        };
    }

    private Task<string> GeminiGenerateAsync(string apiKey, string model, string prompt, CancellationToken ct)
        => FirstWorkingAsync(
            [ResolveGeminiChatModel(model), "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"],
            candidate => GeminiGenerateOnceAsync(apiKey, candidate, prompt, ct),
            "Gemini không tạo được câu trả lời.");

    private async Task<string> GeminiGenerateOnceAsync(string apiKey, string model, string prompt, CancellationToken ct)
    {
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:generateContent?key={Uri.EscapeDataString(apiKey)}";
        using var response = await _http.PostAsJsonAsync(url, new
        {
            model = $"models/{model}",
            contents = new[]
            {
                new { role = "user", parts = new[] { new { text = prompt } } }
            },
            generationConfig = new { temperature = 0.2, maxOutputTokens = 512 }
        }, ct);

        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(json, "Gemini", response.StatusCode.ToString()));

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("candidates", out var candidates) || candidates.GetArrayLength() == 0)
            return string.Empty;

        var parts = candidates[0].GetProperty("content").GetProperty("parts");
        var text = new StringBuilder();
        foreach (var part in parts.EnumerateArray())
        {
            if (part.TryGetProperty("text", out var value))
                text.Append(value.GetString());
        }
        return text.ToString();
    }

    private Task<float[]> GeminiEmbedAsync(string apiKey, string model, string text, CancellationToken ct)
    {
        var resolved = ResolveGeminiEmbeddingModel(model);
        var candidates = string.Equals(resolved, model.Trim(), StringComparison.OrdinalIgnoreCase)
            ? new[] { resolved, "gemini-embedding-001" }
            : new[] { resolved };
        return FirstWorkingAsync(
            candidates,
            candidate => GeminiEmbedOnceAsync(apiKey, candidate, text, ct),
            "Gemini không tạo được embedding.");
    }

    private async Task<float[]> GeminiEmbedOnceAsync(string apiKey, string model, string text, CancellationToken ct)
    {
        var clipped = Clip(text);
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{Uri.EscapeDataString(model)}:embedContent?key={Uri.EscapeDataString(apiKey)}";
        using var response = await _http.PostAsJsonAsync(url, new
        {
            model = $"models/{model}",
            content = new { parts = new[] { new { text = clipped } } },
            outputDimensionality = 768,
            taskType = "SEMANTIC_SIMILARITY"
        }, ct);

        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(json, "Gemini", response.StatusCode.ToString()));

        using var doc = JsonDocument.Parse(json);
        var embedding = doc.RootElement.TryGetProperty("embedding", out var root)
            ? root
            : doc.RootElement.GetProperty("embeddings")[0];
        return ReadFloatArray(embedding.GetProperty("values"));
    }

    private async Task<string> OpenAiGenerateAsync(
        string provider,
        string apiKey,
        string model,
        string prompt,
        string? baseUrl,
        CancellationToken ct)
    {
        var url = ChatUrl(provider, baseUrl);
        var resolvedModel = provider == "deepseek" && model.Equals("deepseek-chat", StringComparison.OrdinalIgnoreCase)
            ? "deepseek-flash"
            : model;
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        AddOpenAiExtraHeaders(request, provider);
        request.Content = JsonContent.Create(new
        {
            model = resolvedModel,
            messages = new[] { new { role = "user", content = prompt } },
            temperature = 0.2,
            max_tokens = 1024
        });

        using var response = await _http.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(json, DisplayName(provider), response.StatusCode.ToString()));

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("choices", out var choices) || choices.GetArrayLength() == 0)
            return string.Empty;

        var message = choices[0].GetProperty("message");
        return message.TryGetProperty("content", out var content) ? content.GetString() ?? string.Empty : string.Empty;
    }

    private async Task<float[]> OpenAiEmbedAsync(
        string provider,
        string apiKey,
        string model,
        string text,
        string? baseUrl,
        CancellationToken ct)
    {
        var url = EmbedUrl(provider, baseUrl);
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        AddOpenAiExtraHeaders(request, provider);
        request.Content = JsonContent.Create(new
        {
            model,
            input = Clip(text),
            dimensions = 768
        });

        using var response = await _http.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(json, DisplayName(provider), response.StatusCode.ToString()));

        using var doc = JsonDocument.Parse(json);
        var data = doc.RootElement.GetProperty("data");
        if (data.GetArrayLength() == 0)
            throw new InvalidOperationException($"{DisplayName(provider)} không trả về embedding.");

        return ReadFloatArray(data[0].GetProperty("embedding"));
    }

    private async Task<string> AnthropicGenerateAsync(string apiKey, string model, string prompt, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
        request.Headers.TryAddWithoutValidation("x-api-key", apiKey);
        request.Headers.TryAddWithoutValidation("anthropic-version", "2023-06-01");
        request.Content = JsonContent.Create(new
        {
            model,
            max_tokens = 1024,
            messages = new[] { new { role = "user", content = prompt } }
        });

        using var response = await _http.SendAsync(request, ct);
        var json = await response.Content.ReadAsStringAsync(ct);
        if (!response.IsSuccessStatusCode)
            throw new InvalidOperationException(ReadError(json, "Anthropic", response.StatusCode.ToString()));

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("content", out var content) || content.GetArrayLength() == 0)
            return string.Empty;

        return content[0].TryGetProperty("text", out var text) ? text.GetString() ?? string.Empty : string.Empty;
    }

    private static void AddOpenAiExtraHeaders(HttpRequestMessage request, string provider)
    {
        if (provider != "openrouter")
            return;
        request.Headers.TryAddWithoutValidation("HTTP-Referer", "https://smartlibrary.local");
        request.Headers.TryAddWithoutValidation("X-Title", "SmartLibrary");
    }

    private static string ChatUrl(string provider, string? baseUrl) => provider switch
    {
        "openai" => "https://api.openai.com/v1/chat/completions",
        "deepseek" => "https://api.deepseek.com/chat/completions",
        "openrouter" => "https://openrouter.ai/api/v1/chat/completions",
        "huggingface" => "https://router.huggingface.co/v1/chat/completions",
        "other" => Combine(baseUrl, "chat/completions"),
        _ => throw new InvalidOperationException("Nhà cung cấp không hỗ trợ chat completions.")
    };

    private static string EmbedUrl(string provider, string? baseUrl) => provider switch
    {
        "openai" => "https://api.openai.com/v1/embeddings",
        "openrouter" => "https://openrouter.ai/api/v1/embeddings",
        "other" => Combine(baseUrl, "embeddings"),
        _ => throw new InvalidOperationException("Nhà cung cấp không hỗ trợ embeddings.")
    };

    private static string Combine(string? baseUrl, string suffix)
    {
        if (string.IsNullOrWhiteSpace(baseUrl))
            throw new InvalidOperationException("Nhà cung cấp khác cần Base URL, ví dụ https://api.example.com/v1.");

        var trimmed = baseUrl.Trim().TrimEnd('/');
        if (trimmed.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            return trimmed;
        if (trimmed.EndsWith("/v1", StringComparison.OrdinalIgnoreCase))
            return $"{trimmed}/{suffix}";
        return $"{trimmed}/v1/{suffix}";
    }

    private static string Normalize(string? provider)
    {
        var value = string.IsNullOrWhiteSpace(provider) ? "gemini" : provider.Trim().ToLowerInvariant();
        return value switch
        {
            "gemini" or "openai" or "anthropic" or "deepseek" or "openrouter" or "huggingface" or "other" => value,
            _ => "other"
        };
    }

    private static string DisplayName(string provider) => provider switch
    {
        "openai" => "OpenAI",
        "anthropic" => "Anthropic",
        "deepseek" => "DeepSeek",
        "openrouter" => "OpenRouter",
        "huggingface" => "Hugging Face",
        "other" => "Nhà cung cấp",
        _ => "Gemini"
    };

    private static string ResolveGeminiChatModel(string? model)
    {
        var value = string.IsNullOrWhiteSpace(model) ? "gemini-3.8-flash" : model.Trim();
        if (value.StartsWith("models/", StringComparison.OrdinalIgnoreCase))
            value = value["models/".Length..];
        return value switch
        {
            "gemini-2.0-flash" or "gemini-2.0-flash-001" or "gemini-2.0-flash-lite"
                or "gemini-2.0-flash-lite-001" or "gemini-1.5-flash" or "gemini-1.5-pro"
                => "gemini-3.8-flash",
            _ => value
        };
    }

    private static string ResolveGeminiEmbeddingModel(string? model)
    {
        var value = string.IsNullOrWhiteSpace(model) ? "gemini-embedding-001" : model.Trim();
        if (value.StartsWith("models/", StringComparison.OrdinalIgnoreCase))
            value = value["models/".Length..];
        return value switch
        {
            "text-embedding-004" or "text-embedding-005" or "embedding-001" or "textembedding-gecko"
                => "gemini-embedding-001",
            _ => value
        };
    }

    private static async Task<T> FirstWorkingAsync<T>(
        IEnumerable<string> models,
        Func<string, Task<T>> run,
        string fallbackMessage)
    {
        InvalidOperationException? last = null;
        foreach (var model in models.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                return await run(model);
            }
            catch (InvalidOperationException ex) when (IsMissingModel(ex.Message) || IsOverloaded(ex.Message))
            {
                last = ex;
            }
        }

        throw last ?? new InvalidOperationException(fallbackMessage);
    }

    private static bool IsMissingModel(string message)
        => message.Contains("NOT_FOUND", StringComparison.OrdinalIgnoreCase)
           || message.Contains("NotFound", StringComparison.OrdinalIgnoreCase)
           || message.Contains("is not found", StringComparison.OrdinalIgnoreCase)
           || message.Contains("no longer available", StringComparison.OrdinalIgnoreCase)
           || message.Contains("not supported", StringComparison.OrdinalIgnoreCase);

    private static bool IsOverloaded(string message)
        => message.Contains("429", StringComparison.OrdinalIgnoreCase)
           || message.Contains("503", StringComparison.OrdinalIgnoreCase)
           || message.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase)
           || message.Contains("UNAVAILABLE", StringComparison.OrdinalIgnoreCase)
           || message.Contains("high demand", StringComparison.OrdinalIgnoreCase)
           || message.Contains("overloaded", StringComparison.OrdinalIgnoreCase)
           || message.Contains("capacity", StringComparison.OrdinalIgnoreCase);

    private static string Clip(string text)
        => text.Length > 8000 ? text[..8000] : text;

    private static float[] ReadFloatArray(JsonElement values)
    {
        var embedding = new float[values.GetArrayLength()];
        var index = 0;
        foreach (var value in values.EnumerateArray())
            embedding[index++] = value.GetSingle();
        return embedding;
    }

    private static string ReadError(string json, string vendor, string status)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("error", out var error))
            {
                string? detail = null;
                if (error.ValueKind == JsonValueKind.Object && error.TryGetProperty("message", out var message))
                    detail = message.GetString();
                else if (error.ValueKind == JsonValueKind.String)
                    detail = error.GetString();

                if (!string.IsNullOrWhiteSpace(detail))
                    return FriendlyVendorError(vendor, status, detail);
            }
        }
        catch (JsonException)
        {
            // Do not return raw JSON; it may include secrets.
        }

        return FriendlyVendorError(vendor, status, null);
    }

    private static string FriendlyVendorError(string vendor, string status, string? detail)
    {
        var text = detail ?? string.Empty;
        if (status is "401" or "403" or "Unauthorized" or "Forbidden"
            || text.Contains("API_KEY_INVALID", StringComparison.OrdinalIgnoreCase)
            || text.Contains("invalid api key", StringComparison.OrdinalIgnoreCase))
        {
            return $"{vendor}: API Key không hợp lệ hoặc đã bị thu hồi.";
        }

        if (status is "429" or "TooManyRequests"
            || text.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase)
            || text.Contains("quota", StringComparison.OrdinalIgnoreCase)
            || text.Contains("rate limit", StringComparison.OrdinalIgnoreCase))
        {
            return $"{vendor}: hết hạn mức hoặc bị giới hạn tốc độ. Thử lại sau.";
        }

        if (status is "404" or "NotFound"
            || text.Contains("no longer available", StringComparison.OrdinalIgnoreCase)
            || text.Contains("not found", StringComparison.OrdinalIgnoreCase))
        {
            return $"{vendor}: model không tồn tại hoặc đã ngừng. Chọn model còn phục vụ rồi lưu cấu hình.";
        }

        if (!string.IsNullOrWhiteSpace(detail) && detail.Length <= 180)
            return $"{vendor} {status}: {detail}";

        return $"{vendor} trả lỗi {status}.";
    }
}
