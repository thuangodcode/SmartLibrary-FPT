using SmartLibrary.Application.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace SmartLibrary.Infrastructure.Services;

public class StorageService : IStorageService
{
    private readonly ILogger<StorageService> _logger;
    private readonly Cloudinary _cloudinary;

    public StorageService(ILogger<StorageService> logger, IConfiguration configuration)
    {
        _logger = logger;
        
        var cloudName = configuration["Cloudinary:CloudName"];
        var apiKey = configuration["Cloudinary:ApiKey"];
        var apiSecret = configuration["Cloudinary:ApiSecret"];
        
        var account = new Account(cloudName, apiKey, apiSecret);
        _cloudinary = new Cloudinary(account);
    }

    public async Task<string> UploadFileAsync(Stream fileStream, string fileName, string bucket, CancellationToken ct = default)
    {
        _logger.LogInformation("Uploading file {FileName} to Cloudinary folder {Bucket}", fileName, bucket);
        
        var uploadParams = new ImageUploadParams()
        {
            File = new FileDescription(fileName, fileStream),
            PublicId = $"{bucket}/{fileName}",
            Overwrite = true,
            Type = "upload"
        };

        var uploadResult = await _cloudinary.UploadAsync(uploadParams, ct);
        
        if (uploadResult.Error != null)
        {
            _logger.LogError("Cloudinary upload failed: {Error}", uploadResult.Error.Message);
            throw new Exception($"Cloudinary upload failed: {uploadResult.Error.Message}");
        }

        return uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString() ?? uploadResult.PublicId;
    }

    public async Task DeleteFileAsync(string filePath, string bucket, CancellationToken ct = default)
    {
        _logger.LogInformation("Deleting file {FilePath} from Cloudinary", filePath);
        
        var deletionParams = new DeletionParams(filePath)
        {
            Type = "authenticated"
        };
        
        await _cloudinary.DestroyAsync(deletionParams);
    }

    public string GetPublicUrl(string filePath, string bucket)
    {
        // This should not be used for authenticated files, but kept for interface compatibility
        return _cloudinary.Api.UrlImgUp.BuildUrl(filePath);
    }

    public Task<string> CreatePresignedUrlAsync(string filePath, string bucket, int expiresInSeconds = 60, CancellationToken ct = default)
    {
        _logger.LogInformation("Creating authenticated URL for {FilePath}", filePath);
        
        var url = _cloudinary.Api.UrlImgUp
            .Transform(new Transformation()) // Add transformations if needed
            .Action("image")
            .ResourceType("upload")
            .Type("authenticated")
            .Signed(true) // Generate signed URL
            .BuildUrl(filePath);
            
        return Task.FromResult(url);
    }
}
