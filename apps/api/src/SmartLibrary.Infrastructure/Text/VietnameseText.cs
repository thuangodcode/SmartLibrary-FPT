using System.Globalization;
using System.Text;

namespace SmartLibrary.Infrastructure.Text;

internal static class VietnameseText
{
    public static string Fold(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
                continue;
            builder.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        }

        return builder.ToString();
    }

    public static string Digits(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsDigit(ch))
                builder.Append(ch);
        }

        return builder.ToString();
    }
}
