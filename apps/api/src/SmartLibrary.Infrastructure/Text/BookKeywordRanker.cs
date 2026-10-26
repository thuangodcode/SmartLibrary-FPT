using System.Text;
using SmartLibrary.Application.Features.Rag;

namespace SmartLibrary.Infrastructure.Text;

internal static class BookKeywordRanker
{
    private static readonly HashSet<string> Stopwords = new(StringComparer.Ordinal)
    {
        "toi", "ban", "muon", "tim", "kiem", "dum", "sach", "cho", "cua", "va", "la", "cac",
        "nhung", "duoc", "trong", "danh", "muc", "the", "loai", "hay", "nen", "nao", "gi",
        "mot", "voi", "nay", "do", "kia", "thu", "vien", "giao", "sinh", "ky", "den", "lien",
        "quan", "ve", "nhu", "that", "nua", "cung", "hon", "rat", "khi", "neu", "thi", "de",
        "tu", "nam", "bai", "tap", "hoc", "giup", "nganh", "thuoc", "lienquan", "please",
        "help", "book", "books", "for", "and", "the", "a", "an", "to", "of", "in", "on", "with"
    };

    private static readonly HashSet<string> WeakTokens = new(StringComparer.Ordinal)
    {
        "tieng", "viet", "co", "ban", "nang", "cao", "nhap", "mon", "giao", "trinh",
        "ngon", "ngu", "chuyen"
    };

    public static double Score(
        string query,
        string title,
        string? description,
        string? code,
        string? isbn,
        IEnumerable<string> authors,
        IEnumerable<string> categories,
        string? language = null)
    {
        var parts = SearchTopicGuard.SplitIntents(query);
        if (parts.Count == 1)
            return ScoreOne(parts[0], title, description, code, isbn, authors, categories, language);

        return parts.Max(part =>
            ScoreOne(part, title, description, code, isbn, authors, categories, language));
    }

    private static double ScoreOne(
        string query,
        string title,
        string? description,
        string? code,
        string? isbn,
        IEnumerable<string> authors,
        IEnumerable<string> categories,
        string? language)
    {
        var queryFold = VietnameseText.Fold(query);
        var isShortPrefixQuery = queryFold.Length is > 0 and <= 3
            && !queryFold.Any(char.IsWhiteSpace)
            && !Stopwords.Contains(queryFold);
        var named = SearchTopicGuard.IsNamedInQuery(query, title, authors, isbn, code)
                    && SearchTopicGuard.Parse(query).Topics.Count <= 1
                    && query.Trim().Length < 160;
        if (!named && !isShortPrefixQuery
            && !SearchTopicGuard.Allows(query, title, description, authors, categories, isbn, code, language))
            return 0;

        var queryDigits = VietnameseText.Digits(query);
        var terms = Tokenize(query);
        var intent = SearchTopicGuard.Parse(query);
        var authorText = string.Join(" ", authors);
        var categoryText = string.Join(" ", categories);
        var languageText = BookLanguageText.SearchAliases(language);
        var titleFold = VietnameseText.Fold(title);
        var authorFold = VietnameseText.Fold(authorText);
        var codeFold = VietnameseText.Fold(code);
        var isbnDigits = VietnameseText.Digits(isbn);
        var hayTokens = new HashSet<string>(
            Tokenize($"{title} {description} {code} {authorText} {categoryText} {languageText}"),
            StringComparer.Ordinal);
        if (isShortPrefixQuery)
        {
            if (HasTokenPrefix(title, queryFold))
                return 0.88;
            if (HasTokenPrefix(authorText, queryFold))
                return 0.78;
            if (HasTokenPrefix(categoryText, queryFold) || codeFold.StartsWith(queryFold, StringComparison.Ordinal))
                return 0.68;
        }

        var tokenHits = terms.Count(hayTokens.Contains);
        var distinctive = Distinctive(terms);
        var distinctiveHits = distinctive.Count(hayTokens.Contains);

        if (isbnDigits.Length >= 10 && queryDigits.Contains(isbnDigits, StringComparison.Ordinal))
            return 1;
        if (codeFold.Length >= 3 && (queryFold == codeFold || queryFold.Contains(codeFold, StringComparison.Ordinal)))
            return 0.98;
        if (titleFold.Length >= 4 && (queryFold == titleFold
            || queryFold.Contains(titleFold, StringComparison.Ordinal)
            || (queryFold.Length >= 4 && titleFold.Contains(queryFold, StringComparison.Ordinal))))
            return 0.97;
        if (authorFold.Length >= 4 && (queryFold.Contains(authorFold, StringComparison.Ordinal)
            || authorFold.Contains(queryFold, StringComparison.Ordinal)))
            return 0.9;
        var languageEvidence = intent.WantsLanguageLearning
            ? $"{title} {description} {authorText} {categoryText}"
            : languageText;
        if (intent.Language is not null
            && SearchTopicGuard.Allows(intent, languageEvidence, intent.WantsLanguageLearning ? null : language))
            return 0.78;
        if (tokenHits == 0)
            return named ? 0.82 : 0;
        if (distinctive.Count > 0 && distinctiveHits == 0)
            return named ? 0.82 : 0;
        if (terms.Count == 1 && tokenHits == 1)
            return named ? 0.82 : 0.7;
        if (distinctiveHits >= 1 && tokenHits >= 2)
            return Math.Max(named ? 0.82 : 0, 0.35 + (0.5 * Math.Min(1, distinctiveHits / (double)Math.Min(distinctive.Count, 8))));
        if (distinctiveHits >= 1)
            return named ? 0.82 : 0.55;
        return named ? 0.82 : 0.5;
    }

    private static List<string> Distinctive(IEnumerable<string> terms)
        => terms.Where(term => term.Length >= 4 && !WeakTokens.Contains(term)).ToList();

    private static List<string> Tokenize(string question)
    {
        var folded = VietnameseText.Fold(question);
        var terms = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var current = new StringBuilder();
        foreach (var ch in folded)
        {
            if (char.IsLetterOrDigit(ch))
            {
                current.Append(ch);
                continue;
            }

            FlushToken(current, terms, seen);
        }

        FlushToken(current, terms, seen);
        return terms;
    }

    private static bool HasTokenPrefix(string value, string prefix)
    {
        var folded = VietnameseText.Fold(value);
        var current = new StringBuilder();
        foreach (var ch in folded)
        {
            if (char.IsLetterOrDigit(ch))
            {
                current.Append(ch);
                continue;
            }

            if (current.Length > 0 && current.ToString().StartsWith(prefix, StringComparison.Ordinal))
                return true;
            current.Clear();
        }

        return current.Length > 0 && current.ToString().StartsWith(prefix, StringComparison.Ordinal);
    }

    private static void FlushToken(StringBuilder current, List<string> terms, HashSet<string> seen)
    {
        if (current.Length < 3)
        {
            current.Clear();
            return;
        }

        var token = current.ToString();
        current.Clear();
        if (Stopwords.Contains(token) || !seen.Add(token))
            return;
        terms.Add(token);
    }
}
