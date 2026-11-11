using System.Globalization;

namespace SmartLibrary.Application.Features.Books;

public static class BookCodeRules
{
    public static string? NormalizeCategoryCode(string? value)
    {
        var code = value?.Trim().ToUpperInvariant();
        return code is { Length: >= 1 and <= 16 } && code.All(char.IsAsciiLetter) ? code : null;
    }

    public static string NextAvailable(string categoryCode, IEnumerable<string> existingCodes)
    {
        var prefix = NormalizeCategoryCode(categoryCode)
            ?? throw new ArgumentException("Mã danh mục phải gồm 1–16 chữ cái A–Z.", nameof(categoryCode));
        var used = new HashSet<long>();
        foreach (var code in existingCodes)
        {
            if (!code.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) continue;
            var suffix = code.AsSpan(prefix.Length);
            if (suffix.Length == 0 || !suffix.ToArray().All(char.IsAsciiDigit)) continue;
            if (long.TryParse(suffix, NumberStyles.None, CultureInfo.InvariantCulture, out var number) && number > 0)
                used.Add(number);
        }
        long next = 1;
        while (used.Contains(next)) next++;
        return prefix + next.ToString("D3", CultureInfo.InvariantCulture);
    }
}
