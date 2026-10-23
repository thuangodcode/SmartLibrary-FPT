using SmartLibrary.Application.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;

namespace SmartLibrary.Infrastructure.Services;

public class StorageService : IStorageService
{
    private readonly ILogger<StorageService> _logger;
    private readonly Cloudinary? _cloudinary;

    public StorageService(ILogger<StorageService> logger, IConfiguration configuration)
    {
        _logger = logger;
        
        var cloudName = configuration["Cloudinary:CloudName"];
        var apiKey = configuration["Cloudinary:ApiKey"];
        var apiSecret = configuration["Cloudinary:ApiSecret"];
        
        if (!string.IsNullOrWhiteSpace(cloudName) && !string.IsNullOrWhiteSpace(apiKey) && !string.IsNullOrWhiteSpace(apiSecret))
        {
            var account = new Account(cloudName, apiKey, apiSecret);
            _cloudinary = new Cloudinary(account);
        }
        else
        {
            _logger.LogWarning("Cloudinary credentials are not configured or incomplete. File uploads will fail.");
        }
    }

    public async Task<string> UploadFileAsync(Stream fileStream, string fileName, string bucket, CancellationToken ct = default)
    {
        if (_cloudinary == null)
        {
            _logger.LogError("Cannot upload {FileName}: Cloudinary credentials are not configured.", fileName);
            throw new InvalidOperationException("Cloudinary chưa được cấu hình. Vui lòng liên hệ quản trị viên.");
        }

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
            throw new InvalidOperationException($"Cloudinary upload failed: {uploadResult.Error.Message}");
        }

        var uploadedUrl = uploadResult.SecureUrl?.ToString() ?? uploadResult.Url?.ToString();
        if (string.IsNullOrWhiteSpace(uploadedUrl))
        {
            _logger.LogError("Cloudinary did not return a URL for uploaded file {FileName}.", fileName);
            throw new InvalidOperationException("Cloudinary tải ảnh lên nhưng không trả về đường dẫn ảnh.");
        }

        return uploadedUrl;
    }

    public async Task DeleteFileAsync(string filePath, string bucket, CancellationToken ct = default)
    {
        if (_cloudinary == null) return;

        _logger.LogInformation("Deleting file {FilePath} from Cloudinary", filePath);
        
        var deletionParams = new DeletionParams(filePath)
        {
            Type = "authenticated"
        };
        
        await _cloudinary.DestroyAsync(deletionParams);
    }

    public string GetPublicUrl(string filePath, string bucket)
    {
        if (_cloudinary == null) return filePath;
        // This should not be used for authenticated files, but kept for interface compatibility
        return _cloudinary.Api.UrlImgUp.BuildUrl(filePath);
    }

    public Task<string> CreatePresignedUrlAsync(string filePath, string bucket, int expiresInSeconds = 60, CancellationToken ct = default)
    {
        if (_cloudinary == null) return Task.FromResult(filePath);

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
