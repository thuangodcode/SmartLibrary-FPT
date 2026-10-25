using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using SmartLibrary.Application.Features.Rag.DTOs;

namespace SmartLibrary.Application.Features.Rag;

public static class SearchTopicGuard
{
    public const string HighMatch = "Phù hợp cao";
    public const string RelatedMatch = "Có liên quan";

    public static IReadOnlyList<RagSearchHit> Filter(string query, IReadOnlyList<RagSearchHit> hits)
    {
        var intent = Parse(query);
        if (LooksLikeProse(query) && intent.Topics.Count > 0)
        {
            if (intent.Topics.Count > 1)
                return PickOnePerTopic(intent, hits);
            return hits.Where(hit => Allows(intent, HitHay(hit), hit.Language)).ToList();
        }

        return hits.Where(hit => Allows(
            query,
            hit.Title,
            hit.Content,
            hit.Author is null ? [] : hit.Author.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries),
            hit.Categories,
            hit.Isbn,
            hit.Code,
            hit.Language)).ToList();
    }

    public static IReadOnlyList<RagSearchHit> FilterSemantic(string query, IReadOnlyList<RagSearchHit> hits)
    {
        var intent = Parse(query);
        if (intent.NeedsClarification)
            return [];
        if (intent.Language is null && intent.Topics.Count == 0)
            return hits;
        return Filter(query, hits);
    }

    public static bool Allows(
        string query,
        string title,
        string? description,
        IEnumerable<string>? authors,
        IEnumerable<string>? categories,
        string? isbn,
        string? code,
        string? language = null)
    {
        var intent = Parse(query);
        var hay = Fold($"{title} {description} {Join(authors)} {Join(categories)} {isbn} {code}");
        if (intent.Topics.Count > 0 && LooksLikeProse(query))
            return intent.Topics.Any(topic => MatchesTopic(topic, hay, language));
        if (IsNamedInQuery(query, title, authors, isbn, code))
            return true;
        return SplitIntents(query).Any(part =>
        {
            var partIntent = Parse(part);
            return !partIntent.NeedsClarification && Allows(partIntent, hay, language);
        });
    }

    private static IReadOnlyList<RagSearchHit> PickOnePerTopic(SearchIntent intent, IReadOnlyList<RagSearchHit> hits)
    {
        var selected = new List<RagSearchHit>();
        foreach (var topic in intent.Topics)
        {
            var match = hits
                .Where(hit => Allows(intent, HitHay(hit), hit.Language)
                              && MatchesTopic(topic, HitHay(hit), hit.Language))
                .OrderByDescending(hit => hit.Score)
                .FirstOrDefault();
            if (match is not null && selected.All(item => item.SourceId != match.SourceId))
                selected.Add(match);
        }

        return selected;
    }

    private static string HitHay(RagSearchHit hit)
        => $"{hit.Title} {hit.Content} {hit.Author} {Join(hit.Categories)} {hit.Isbn} {hit.Code}";

    public static bool IsNamedInQuery(
        string query,
        string title,
        IEnumerable<string>? authors,
        string? isbn,
        string? code)
    {
        var q = Fold(query);
        if (q.Length < 3)
            return false;

        var isbnDigits = new string((isbn ?? string.Empty).Where(char.IsDigit).ToArray());
        var queryDigits = new string(q.Where(char.IsDigit).ToArray());
        if (isbnDigits.Length >= 10 && queryDigits.Contains(isbnDigits, StringComparison.Ordinal))
            return true;

        var codeFold = Fold(code);
        if (codeFold.Length >= 4 && q.Contains(codeFold, StringComparison.Ordinal))
            return true;

        foreach (var author in authors ?? [])
        {
            if (AuthorNamedInQuery(q, author))
                return true;
        }

        var titleTokens = Tokens(Fold(title))
            .Where(token => token.Length >= 3 && !WeakTokens.Contains(token) && !GenericNameTokens.Contains(token))
            .ToList();
        for (var i = 0; i < titleTokens.Count - 1; i++)
        {
            var phrase = titleTokens[i] + " " + titleTokens[i + 1];
            var glued = titleTokens[i] + titleTokens[i + 1];
            if (q.Contains(phrase, StringComparison.Ordinal) || q.Contains(glued, StringComparison.Ordinal))
                return true;
        }

        return titleTokens.Any(token => token.Length >= 7 && q.Contains(token, StringComparison.Ordinal));
    }

    public static IReadOnlyList<string> SplitIntents(string query)
    {
        var raw = query?.Trim() ?? string.Empty;
        if (raw.Length == 0)
            return [string.Empty];
        if (LooksLikeProse(raw) && !LooksLikeList(raw))
            return [raw];

        var parts = Splitter.Split(raw)
            .Select(part => part.Trim())
            .Where(part => part.Length >= 3)
            .ToList();
        if (parts.Count < 2)
            return [raw];

        var meaningful = parts.Where(HasSearchableIntent).ToList();
        return meaningful.Count >= 2 ? meaningful : [raw];
    }

    private static bool LooksLikeProse(string raw)
        => raw.Length >= 160
           || raw.Count(ch => ch == '.') >= 2
           || ContainsAny(Fold(raw), "toi la", "toi muon", "toi khong", "hay tim sach phu hop");

    private static bool LooksLikeList(string raw)
    {
        if (Regex.IsMatch(raw, @"sách.{3,40}sách", RegexOptions.IgnoreCase | RegexOptions.Singleline))
            return true;
        if (Regex.IsMatch(raw, @"\d+[\.\)]\s+\S"))
            return true;
        var commaParts = raw.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return commaParts.Length >= 3 && commaParts.All(part => part.Length <= 60);
    }

    public static string MatchLabel(double score)
        => score >= 0.7 ? HighMatch : RelatedMatch;

    public static bool IsBookSearch(string query)
    {
        var fold = Fold(query);
        var intent = Parse(query);
        return intent.Language is not null
               || intent.Topics.Count > 0
               || intent.WantsLanguageLearning
               || !ContainsAny(
                fold,
                "chinh sach",
                "quy dinh",
                "thoi han muon",
                "quy trinh muon",
                "muon sach",
                "bao lau muon",
                "gia han",
                "qua han",
                "muc phat",
                "phi phat",
                "dat truoc",
                "tra sach",
                "borrow",
                "borrow policy",
                "loan",
                "loan policy",
                "return",
                "return policy",
                "renew",
                "due date",
                "overdue",
                "fine");
    }

    public static SearchIntent Parse(string query)
    {
        var fold = Fold(query);
        var language = DetectLanguage(fold);
        var topics = DetectTopics(fold);
        var domain = topics.Count == 1 ? topics[0] : topics.Count > 1 ? "multi" : DetectDomain(fold);
        var terms = DistinctiveTerms(fold);
        var learning = WantsLanguageLearning(fold) && domain != "python";
        return new SearchIntent(
            Folded: fold,
            Language: language,
            Domain: domain,
            Topics: topics,
            DistinctiveTerms: terms,
            WantsLanguageLearning: learning,
            NeedsClarification: learning && language is null && terms.Count == 0);
    }

    public static string ClarifyMessage(SearchIntent intent)
        => "Bạn muốn tìm sách ngôn ngữ nào? Hãy nêu rõ tiếng Nhật, tiếng Anh, tiếng Hàn hoặc tiếng Trung.";

    public static bool Allows(SearchIntent intent, string haystack, string? language = null)
    {
        if (intent.NeedsClarification)
            return false;

        var hay = Fold(haystack);
        var languageCode = intent.WantsLanguageLearning ? null : language;
        if (intent.Language == "japanese" && !HasJapanese(hay, languageCode))
            return false;
        if (intent.Language == "english" && !HasEnglish(hay, languageCode))
            return false;
        if (intent.Language == "korean" && !HasKorean(hay, languageCode))
            return false;
        if (intent.Language == "chinese" && !HasChinese(hay, languageCode))
            return false;

        if (intent.Topics.Count > 0)
            return intent.Topics.Any(topic => MatchesTopic(topic, hay, language));

        return intent.Domain switch
        {
            "python" => hay.Contains("python", StringComparison.Ordinal),
            "grammar" => HasGrammar(hay) && (intent.Language is null || HasLanguage(intent.Language, hay, language)),
            "math" => HasMath(hay),
            "hardware" => HasHardware(hay),
            "business" when intent.Language is not null => HasBusiness(hay),
            "literature" => HasLiterature(hay),
            "it" when intent.Language is not null => HasIt(hay),
            _ when intent.Language is not null => true,
            _ => DistinctiveOverlap(intent, hay)
        };
    }

    private static bool DistinctiveOverlap(SearchIntent intent, string hay)
    {
        if (intent.DistinctiveTerms.Count == 0)
            return false;
        return intent.DistinctiveTerms.Any(term => hay.Contains(term, StringComparison.Ordinal));
    }

    private static bool HasSearchableIntent(string part)
    {
        var intent = Parse(part);
        return intent.Language is not null
               || intent.Domain is not null
               || intent.DistinctiveTerms.Count > 0
               || intent.WantsLanguageLearning;
    }

    private static bool WantsLanguageLearning(string fold)
        => ContainsAny(
               fold,
               "ngon ngu",
               "tieng anh",
               "tienganh",
               "anh ngu",
               "english language",
               "learn english",
               "learning english",
               "hoc english",
               "hoc tieng nhat",
               "tieng nhat",
               "nihongo",
               "japanese language",
               "learn japanese",
               "tieng han",
               "tienghan",
               "hangul",
               "korean language",
               "learn korean",
               "tieng trung",
               "tiengtrung",
               "tieng hoa",
               "mandarin",
               "chinese language",
               "learn chinese")
           && !fold.Contains("python", StringComparison.Ordinal)
           && !ContainsAny(fold, "lap trinh", "laptrinh", "ngoai ngu", "bang tieng", "in english");

    private static string? DetectLanguage(string fold)
    {
        if (HasJapanese(fold, null)) return "japanese";
        if (HasEnglish(fold, null)) return "english";
        if (HasKorean(fold, null)) return "korean";
        if (HasChinese(fold, null)) return "chinese";
        return null;
    }

    public static IReadOnlyList<string> DetectTopics(string fold)
    {
        var topics = new List<string>();
        if (fold.Contains("python", StringComparison.Ordinal))
            topics.Add("python");
        if (HasGrammar(fold))
            topics.Add("grammar");
        if (HasHardware(fold))
            topics.Add("hardware");
        if (HasMath(fold))
            topics.Add("math");
        if (HasVocabulary(fold) && !topics.Contains("grammar"))
            topics.Add("vocabulary");
        if (HasBusiness(fold) && DetectLanguage(fold) is not null)
            topics.Add("business");
        if (HasLiterature(fold))
            topics.Add("literature");
        return topics;
    }

    public static bool MatchesTopic(string topic, string haystack, string? language = null)
    {
        var hay = Fold(haystack);
        return topic switch
        {
            "python" => hay.Contains("python", StringComparison.Ordinal),
            "grammar" => HasGrammar(hay),
            "hardware" => HasHardware(hay),
            "math" => HasMath(hay),
            "vocabulary" => HasVocabulary(hay),
            "business" => HasBusiness(hay),
            "literature" => HasLiterature(hay),
            _ => false
        };
    }

    public static string TopicLabel(string topic) => topic switch
    {
        "hardware" => "vi mạch / linh kiện điện tử",
        "math" => "toán rời rạc / tư duy logic",
        "python" => "Python",
        "grammar" => "ngữ pháp",
        "vocabulary" => "từ vựng",
        "business" => "thương mại",
        "literature" => "văn học",
        _ => topic
    };

    private static string? DetectDomain(string fold)
    {
        var topics = DetectTopics(fold);
        if (topics.Count >= 1)
            return topics[0];
        if (HasIt(fold))
            return "it";
        return null;
    }

    private static bool HasJapanese(string fold, string? language)
        => IsLang(language, "ja", "jp", "jpn", "japanese")
           || ContainsAny(fold, "tieng nhat", "tiengnhat", "ngon ngu nhat", "nhat ban", "nhatban", "japanese", "nihongo");

    private static bool HasEnglish(string fold, string? language)
        => IsLang(language, "en", "eng", "english")
           || ContainsAny(fold, "tieng anh", "tienganh", "anh ngu", "english", "ngon ngu anh");

    private static bool HasKorean(string fold, string? language)
        => IsLang(language, "ko", "kr", "kor", "korean")
           || ContainsAny(fold, "tieng han", "tienghan", "han ngu", "ngon ngu han", "korean", "hangul");

    private static bool HasChinese(string fold, string? language)
        => IsLang(language, "zh", "cn", "chi", "chinese")
           || ContainsAny(fold, "tieng trung", "tiengtrung", "ngon ngu trung", "tieng hoa", "chinese", "mandarin");

    private static bool HasLanguage(string language, string hay, string? code) => language switch
    {
        "japanese" => HasJapanese(hay, code),
        "english" => HasEnglish(hay, code),
        "korean" => HasKorean(hay, code),
        "chinese" => HasChinese(hay, code),
        _ => true
    };

    private static bool IsLang(string? language, params string[] codes)
    {
        if (string.IsNullOrWhiteSpace(language))
            return false;
        var value = language.Trim().ToLowerInvariant();
        return codes.Contains(value);
    }

    private static bool HasGrammar(string fold)
        => ContainsAny(fold, "ngu phap", "nguphap", "grammar");

    private static bool HasMath(string fold)
        => ContainsAny(fold,
            "toan hoc", "toanhoc", "roi rac", "roirac", "menh de", "menhde",
            "tap hop", "taphop", "tu duy logic", "discrete", "combinator",
            "do thi", "graph theory", "logic menh", "to hop", "chung minh");

    private static bool HasHardware(string fold)
        => ContainsAny(fold,
            "linh kien", "linhkien", "vi mach", "vimach", "ban dan", "bandan",
            "mach dien", "semiconductor", "transistor", "integrated circuit",
            "vlsi", "fpga", "microchip");

    private static bool HasVocabulary(string fold)
        => ContainsAny(fold, "tu vung", "tuvung", "vocabulary", "kanji", "tu dien", "tudien");

    private static bool HasBusiness(string fold)
        => ContainsAny(fold, "thuong mai", "thuongmai", "business", "kinh te", "kinhte");

    private static bool HasLiterature(string fold)
        => ContainsAny(fold,
            "van hoc", "vanhoc", "literature", "literary",
            "tieu thuyet", "tieuthuyet", "truyen ngan", "truyenngan", "novel");

    private static bool HasIt(string fold)
        => ContainsAny(fold,
            "cong nghe", "thong tin", "cntt", "ky thuat", "kythuat",
            "lap trinh", "laptrinh", "engineering", "computer", "information technology")
           || HasItWord(fold);

    private static bool HasItWord(string fold)
    {
        var padded = " " + fold + " ";
        return padded.Contains(" it ", StringComparison.Ordinal)
               || padded.Contains(" cntt ", StringComparison.Ordinal);
    }

    private static bool ContainsAny(string fold, params string[] phrases)
        => phrases.Any(phrase => fold.Contains(phrase, StringComparison.Ordinal));

    private static List<string> Tokens(string fold)
    {
        var terms = new List<string>();
        var current = new StringBuilder();
        foreach (var ch in fold)
        {
            if (char.IsLetterOrDigit(ch))
            {
                current.Append(ch);
                continue;
            }

            if (current.Length > 0)
            {
                terms.Add(current.ToString());
                current.Clear();
            }
        }

        if (current.Length > 0)
            terms.Add(current.ToString());
        return terms;
    }

    private static List<string> DistinctiveTerms(string fold)
    {
        var terms = new List<string>();
        var current = new StringBuilder();
        foreach (var ch in fold)
        {
            if (char.IsLetterOrDigit(ch))
            {
                current.Append(ch);
                continue;
            }

            Flush(current, terms);
        }

        Flush(current, terms);
        return terms;
    }

    private static void Flush(StringBuilder current, List<string> terms)
    {
        if (current.Length < 4)
        {
            current.Clear();
            return;
        }

        var token = current.ToString();
        current.Clear();
        if (WeakTokens.Contains(token) || terms.Contains(token))
            return;
        terms.Add(token);
    }

    private static readonly Regex Splitter = new(
        @"\s*(?:,|;|/|\||\r?\n)+\s*|\s+(?:và|va|and|với|voi|rồi|roi|kèm|kem|cùng|ngoài ra|ngoai ra|cũng như|cung nhu|hoặc|hoac|or)\s+|(?<=\S)\s+(?=sách\s)|\s+\d+[\.\)]\s+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static bool AuthorNamedInQuery(string queryFold, string author)
    {
        var folded = Fold(author);
        if (folded.Length >= 10 && queryFold.Contains(folded, StringComparison.Ordinal))
            return true;

        var tokens = Tokens(folded)
            .Where(token => token.Length >= 3 && !WeakTokens.Contains(token) && !CommonSurnames.Contains(token))
            .ToList();
        if (tokens.Count == 0)
            return false;
        var padded = " " + queryFold + " ";
        var hits = tokens.Count(token => padded.Contains(" " + token + " ", StringComparison.Ordinal));
        return hits >= 2
               || (hits == 1 && tokens.Any(token => token.Length >= 7 && padded.Contains(" " + token + " ", StringComparison.Ordinal)));
    }

    private static readonly HashSet<string> CommonSurnames = new(StringComparer.Ordinal)
    {
        "nguyen", "tran", "le", "pham", "hoang", "huynh", "phan", "vu", "vo", "dang",
        "bui", "do", "duong", "ly", "cao", "dinh", "trinh", "doan", "ngo", "truong"
    };

    private static readonly HashSet<string> GenericNameTokens = new(StringComparer.Ordinal)
    {
        "cong", "nghe", "thong", "tin", "nganh", "dung", "ung", "rac", "roi", "toan",
        "khoa", "phan", "mem", "thuat", "ungdung", "cntt", "software", "design", "guide",
        "existing", "improving", "handbook"
    };

    private static readonly HashSet<string> WeakTokens = new(StringComparer.Ordinal)
    {
        "toi", "ban", "muon", "tim", "kiem", "dum", "sach", "cho", "cua", "va", "la", "cac",
        "nhung", "duoc", "trong", "danh", "muc", "the", "loai", "hay", "nen", "nao", "gi",
        "mot", "voi", "nay", "do", "kia", "thu", "vien", "giao", "sinh", "ky", "den", "lien",
        "quan", "ve", "nhu", "that", "nua", "cung", "hon", "rat", "khi", "neu", "thi", "de",
        "tu", "nam", "bai", "tap", "hoc", "giup", "nganh", "thuoc", "lienquan", "khong", "ton",
        "tai", "ngon", "ngu", "chuyen", "tieng", "viet", "thuvien", "please", "help", "book",
        "books", "for", "and", "the", "with", "that", "this", "from", "have", "want", "find"
    };

    private static string Join(IEnumerable<string>? values)
        => values is null ? string.Empty : string.Join(' ', values);

    public static string Fold(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var normalized = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category == UnicodeCategory.NonSpacingMark)
                continue;
            builder.Append(ch is 'đ' or 'Đ' ? 'd' : char.ToLowerInvariant(ch));
        }

        return builder.ToString();
    }
}

public sealed record SearchIntent(
    string Folded,
    string? Language,
    string? Domain,
    IReadOnlyList<string> Topics,
    IReadOnlyList<string> DistinctiveTerms,
    bool WantsLanguageLearning,
    bool NeedsClarification);
