namespace SmartLibrary.Infrastructure.Text;

internal static class BookLanguageText
{
    public static string SearchAliases(string? language)
        => language?.Trim().ToLowerInvariant() switch
        {
            "en" or "eng" or "english" => "English tiếng Anh Anh ngữ ngôn ngữ Anh",
            "ja" or "jp" or "jpn" or "japanese" => "Japanese tiếng Nhật ngôn ngữ Nhật",
            "ko" or "kr" or "kor" or "korean" or "korea" => "Korean Korea tiếng Hàn ngôn ngữ Hàn Hanguk 한국어",
            "zh" or "cn" or "chi" or "chinese" => "Chinese tiếng Trung tiếng Hoa ngôn ngữ Trung",
            "vi" or "vie" or "vietnamese" => "Vietnamese tiếng Việt ngôn ngữ Việt",
            _ => language ?? string.Empty
        };
}
