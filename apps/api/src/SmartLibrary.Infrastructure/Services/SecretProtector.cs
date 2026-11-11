using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using SmartLibrary.Application.Interfaces;

namespace SmartLibrary.Infrastructure.Services;

public sealed class SecretProtector : ISecretProtector
{
    private readonly byte[] _key;

    public SecretProtector(IConfiguration configuration)
    {
        var material = configuration["Ai:EncryptionKey"];
        if (string.IsNullOrWhiteSpace(material))
            material = configuration["Jwt:Secret"];
        if (string.IsNullOrWhiteSpace(material))
            throw new InvalidOperationException(
                "Thiếu Ai:EncryptionKey. Thêm khóa ngẫu nhiên dài vào cấu hình trước khi lưu API Key.");

        _key = SHA256.HashData(Encoding.UTF8.GetBytes(material));
    }

    public string Protect(string plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var plainBytes = Encoding.UTF8.GetBytes(plaintext);
        var cipher = new byte[plainBytes.Length];
        var tag = new byte[16];
        using var aes = new AesGcm(_key, 16);
        aes.Encrypt(nonce, plainBytes, cipher, tag);

        var payload = new byte[nonce.Length + tag.Length + cipher.Length];
        Buffer.BlockCopy(nonce, 0, payload, 0, nonce.Length);
        Buffer.BlockCopy(tag, 0, payload, nonce.Length, tag.Length);
        Buffer.BlockCopy(cipher, 0, payload, nonce.Length + tag.Length, cipher.Length);
        return Convert.ToBase64String(payload);
    }

    public string Unprotect(string protectedValue)
    {
        var payload = Convert.FromBase64String(protectedValue);
        if (payload.Length < 29)
            throw new InvalidOperationException("Dữ liệu API Key đã lưu không hợp lệ.");

        var nonce = payload.AsSpan(0, 12);
        var tag = payload.AsSpan(12, 16);
        var cipher = payload.AsSpan(28);
        var plain = new byte[cipher.Length];
        using var aes = new AesGcm(_key, 16);
        aes.Decrypt(nonce, cipher, tag, plain);
        return Encoding.UTF8.GetString(plain);
    }
}
