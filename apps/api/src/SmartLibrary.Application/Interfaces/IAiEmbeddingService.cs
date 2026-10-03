namespace SmartLibrary.Application.Interfaces;

public interface IAiEmbeddingService
{
    Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct = default);
}
