namespace SmartLibrary.Application.Features.Ai;

/// <summary>Server-only credential. Never serialize this type to HTTP responses.</summary>
public sealed class AiRuntimeCredential
{
    public Guid? OwnerUserId { get; init; }
    public required string ApiKey { get; init; }
    public required string Provider { get; init; }
    public required string ChatModel { get; init; }
    public required string EmbeddingProvider { get; init; }
    public required string EmbeddingApiKey { get; init; }
    public required string EmbeddingModel { get; init; }
    public string? BaseUrl { get; init; }
    public string? EmbeddingBaseUrl { get; init; }
}
