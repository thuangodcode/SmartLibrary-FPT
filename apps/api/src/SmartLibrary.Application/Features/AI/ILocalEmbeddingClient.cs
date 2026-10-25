namespace SmartLibrary.Application.Features.Ai;

public interface ILocalEmbeddingClient
{
    Task<float[]> EmbedAsync(string text, CancellationToken ct = default);
}
