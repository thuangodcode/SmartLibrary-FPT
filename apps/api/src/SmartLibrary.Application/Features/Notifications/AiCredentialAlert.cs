namespace SmartLibrary.Application.Features.Notifications;

public static class AiCredentialAlert
{
    public const string KeyType = "ai-key";
    public const string QuotaType = "ai-quota";

    public static string? Classify(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return null;

        if (message.Contains("API_KEY_INVALID", StringComparison.OrdinalIgnoreCase)
            || message.Contains("invalid api key", StringComparison.OrdinalIgnoreCase)
            || message.Contains("không hợp lệ", StringComparison.OrdinalIgnoreCase)
            || message.Contains("đã bị thu hồi", StringComparison.OrdinalIgnoreCase))
        {
            return KeyType;
        }

        if (message.Contains("RESOURCE_EXHAUSTED", StringComparison.OrdinalIgnoreCase)
            || message.Contains("quota", StringComparison.OrdinalIgnoreCase)
            || message.Contains("hết hạn mức", StringComparison.OrdinalIgnoreCase)
            || message.Contains("giới hạn tốc độ", StringComparison.OrdinalIgnoreCase)
            || message.Contains("rate limit", StringComparison.OrdinalIgnoreCase))
        {
            return QuotaType;
        }

        return null;
    }

    public static string Title(string kind)
        => kind == QuotaType
            ? "Token AI đã hết hạn mức"
            : "API Key AI hết hạn hoặc không hợp lệ";

    public static string Body(string kind)
        => kind == QuotaType
            ? "Gemini báo hết token/hạn mức. Kiểm tra gói API rồi thử lại, hoặc nhập key khác trong Thiết lập AI nghiệp vụ."
            : "Gemini từ chối API Key. Vào Thiết lập AI nghiệp vụ để nhập key mới.";
}
