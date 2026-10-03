namespace SmartLibrary.Application.Interfaces;

public interface IStorageService
{
    Task<string> UploadFileAsync(Stream fileStream, string fileName, string bucket, CancellationToken ct = default);
    Task DeleteFileAsync(string filePath, string bucket, CancellationToken ct = default);
    string GetPublicUrl(string filePath, string bucket);
    Task<string> CreatePresignedUrlAsync(string filePath, string bucket, int expiresInSeconds = 60, CancellationToken ct = default);
}
