namespace SmartLibrary.Application.Features.Rag;

/// <summary>
/// Mở rộng câu truy vấn (query expansion) trước khi tạo embedding.
/// Bổ sung synonym, domain hints và contextual phrases
/// để embedding model hiểu rõ ý định tìm kiếm hơn.
/// </summary>
public static class QueryExpander
{
    private const int MaxExpandedChars = 1500;

    /// <summary>
    /// Mở rộng câu truy vấn gốc bằng cách thêm synonym, domain hint
    /// và context phrases phù hợp.
    /// </summary>
    public static string Expand(string query, bool isBookSearch)
    {
        if (string.IsNullOrWhiteSpace(query))
            return query ?? string.Empty;

        var fold = SearchTopicGuard.Fold(query);
        var parts = new List<string>();

        // 1. Base query expansion for book search
        if (isBookSearch)
            parts.Add($"Tìm sách trong thư viện đại học phù hợp với nhu cầu sau: {query}");
        else
            parts.Add(query);

        // 2. Domain & topic hints
        var domainHints = BuildDomainHints(fold);
        if (!string.IsNullOrEmpty(domainHints))
            parts.Add(domainHints);

        // 3. Synonym expansion
        var synonyms = BuildSynonymExpansion(fold);
        if (!string.IsNullOrEmpty(synonyms))
            parts.Add(synonyms);

        // 4. Language learning context
        if (SearchTopicGuard.Parse(query).WantsLanguageLearning)
            parts.Add(BuildLanguageLearningHint(fold));

        // 5. C# special handling (preserved from original)
        if (SearchTopicGuard.Parse(query).Topics.Contains("csharp", StringComparer.Ordinal))
            parts.Add("C# (C Sharp) programming language and .NET software development.");

        var result = string.Join(" ", parts.Where(p => !string.IsNullOrWhiteSpace(p)));
        return result.Length <= MaxExpandedChars ? result : result[..MaxExpandedChars];
    }

    private static string BuildDomainHints(string fold)
    {
        var hints = new List<string>();

        // IT / Programming domain
        if (ContainsAny(fold, "lap trinh", "laptrinh", "programming", "code", "coding",
            "software", "developer", "phan mem"))
        {
            hints.Add("lập trình phần mềm software development programming coding");
        }

        // Data Science / AI
        if (ContainsAny(fold, "tri tue nhan tao", "ai", "machine learning", "hoc may",
            "deep learning", "data science"))
        {
            hints.Add("trí tuệ nhân tạo artificial intelligence machine learning deep learning neural network");
        }

        // Database
        if (ContainsAny(fold, "co so du lieu", "csdl", "database", "sql", "data"))
        {
            hints.Add("cơ sở dữ liệu database SQL NoSQL data management hệ quản trị");
        }

        // Network & Security
        if (ContainsAny(fold, "mang", "network", "bao mat", "security", "an ninh"))
        {
            hints.Add("mạng máy tính network security bảo mật an toàn thông tin");
        }

        // Web development
        if (ContainsAny(fold, "web", "frontend", "backend", "fullstack", "html", "css", "javascript"))
        {
            hints.Add("phát triển web web development frontend backend fullstack");
        }

        // Mobile development
        if (ContainsAny(fold, "mobile", "di dong", "android", "ios", "flutter"))
        {
            hints.Add("phát triển ứng dụng di động mobile development Android iOS");
        }

        // Cloud & DevOps
        if (ContainsAny(fold, "cloud", "dam may", "devops", "docker", "kubernetes"))
        {
            hints.Add("điện toán đám mây cloud computing DevOps containerization");
        }

        // Mathematics
        if (ContainsAny(fold, "toan", "math", "dai so", "giai tich", "xac suat", "thong ke"))
        {
            hints.Add("toán học mathematics algebra calculus statistics probability");
        }

        // Economics / Business
        if (ContainsAny(fold, "kinh te", "kinhte", "business", "tai chinh", "finance",
            "quan tri", "management", "marketing"))
        {
            hints.Add("kinh tế kinh doanh business economics finance management");
        }

        // Literature
        if (ContainsAny(fold, "van hoc", "vanhoc", "literature", "tieu thuyet", "truyen"))
        {
            hints.Add("văn học literature tiểu thuyết novel truyện");
        }

        // Psychology / Self-help
        if (ContainsAny(fold, "tam ly", "psychology", "phat trien ban than", "self"))
        {
            hints.Add("tâm lý học psychology phát triển bản thân self-help personal development");
        }

        // History
        if (ContainsAny(fold, "lich su", "history", "co dai", "hien dai"))
        {
            hints.Add("lịch sử history historical");
        }

        // Science
        if (ContainsAny(fold, "khoa hoc", "science", "vat ly", "physics",
            "hoa hoc", "chemistry", "sinh hoc", "biology"))
        {
            hints.Add("khoa học tự nhiên natural science physics chemistry biology");
        }

        // Education
        if (ContainsAny(fold, "giao duc", "su pham", "teaching", "education"))
        {
            hints.Add("giáo dục education sư phạm pedagogy teaching learning");
        }

        return string.Join(" ", hints.Take(3));
    }

    private static string BuildSynonymExpansion(string fold)
    {
        var expanded = new HashSet<string>(StringComparer.Ordinal);

        // Tokenize the query and look up synonyms for each meaningful token
        var tokens = fold.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(t => t.Length >= 3)
            .ToList();

        // Try multi-word synonyms first (2-3 word combinations)
        for (var i = 0; i < tokens.Count - 1; i++)
        {
            var twoWord = $"{tokens[i]} {tokens[i + 1]}";
            var synonyms = SemanticSynonyms.Expand(twoWord);
            foreach (var synonym in synonyms.Take(4))
                expanded.Add(synonym);

            if (i < tokens.Count - 2)
            {
                var threeWord = $"{tokens[i]} {tokens[i + 1]} {tokens[i + 2]}";
                synonyms = SemanticSynonyms.Expand(threeWord);
                foreach (var synonym in synonyms.Take(4))
                    expanded.Add(synonym);
            }
        }

        // Single word synonyms
        foreach (var token in tokens)
        {
            var synonyms = SemanticSynonyms.Expand(token);
            foreach (var synonym in synonyms.Take(3))
                expanded.Add(synonym);
        }

        if (expanded.Count == 0)
            return string.Empty;

        return "Từ khóa liên quan: " + string.Join(", ", expanded.Take(10));
    }

    private static string BuildLanguageLearningHint(string fold)
    {
        if (ContainsAny(fold, "tieng nhat", "tiengnhat", "japanese", "nihongo"))
            return "Học tiếng Nhật Japanese language learning JLPT N1 N2 N3 N4 N5 kanji hiragana katakana";
        if (ContainsAny(fold, "tieng anh", "tienganh", "english"))
            return "Học tiếng Anh English language learning TOEIC IELTS TOEFL communication giao tiếp";
        if (ContainsAny(fold, "tieng han", "tienghan", "korean", "korea", "hanguk", "hangul"))
            return "Học tiếng Hàn Korean language learning Korea Hanguk 한국어 TOPIK hangul Integrated Korean Korean grammar vocabulary speaking";
        if (ContainsAny(fold, "tieng trung", "tiengtrung", "chinese", "mandarin"))
            return "Học tiếng Trung Chinese Mandarin language learning HSK";
        return "Học ngôn ngữ language learning";
    }

    private static bool ContainsAny(string text, params string[] phrases)
        => phrases.Any(phrase => text.Contains(phrase, StringComparison.Ordinal));
}
