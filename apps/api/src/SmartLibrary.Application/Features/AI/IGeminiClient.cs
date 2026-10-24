namespace SmartLibrary.Application.Features.Ai;

public interface IGeminiClient
{
    Task<string> GenerateAsync(string apiKey, string model, string prompt, CancellationToken ct = default);
    Task<float[]> EmbedAsync(string apiKey, string model, string text, CancellationToken ct = default);

    Task<string> GenerateAsync(
        string provider,
        string apiKey,
        string model,
        string prompt,
        string? baseUrl,
        CancellationToken ct = default);

    Task<float[]> EmbedAsync(
        string provider,
        string apiKey,
        string model,
        string text,
        string? baseUrl,
        CancellationToken ct = default);
}
