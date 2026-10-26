namespace SmartLibrary.Application.Features.Rag;

/// <summary>
/// Bảng đồng nghĩa ngữ nghĩa tiếng Việt ↔ tiếng Anh cho domain thư viện.
/// Dùng cho cả query expansion lẫn enrichment nội dung RAG document.
/// </summary>
public static class SemanticSynonyms
{
    /// <summary>
    /// Mỗi entry: (canonical, aliases[]).
    /// Canonical là dạng chuẩn đại diện, aliases là các biến thể đồng nghĩa.
    /// Tất cả đã được fold (không dấu, lowercase).
    /// </summary>
    private static readonly (string Canonical, string[] Aliases)[] Entries =
    [
        // ── Lập trình / Programming ──────────────────────────────
        ("lap trinh", ["programming", "coding", "phat trien phan mem", "software development",
            "code", "developer", "dev", "lap trinh vien", "nha phat trien"]),
        ("thuat toan", ["algorithm", "algorithms", "giai thuat", "data structure",
            "cau truc du lieu", "ctdl"]),
        ("co so du lieu", ["database", "csdl", "sql", "nosql", "data",
            "du lieu", "luu tru du lieu", "data storage"]),
        ("tri tue nhan tao", ["artificial intelligence", "ai", "machine learning",
            "hoc may", "deep learning", "hoc sau", "neural network", "mang noron",
            "nlp", "xu ly ngon ngu tu nhien"]),
        ("phan mem", ["software", "ung dung", "application", "app", "he thong",
            "system"]),
        ("mang may tinh", ["computer network", "networking", "mang", "network",
            "tcp/ip", "internet", "iot", "he thong mang"]),
        ("bao mat", ["security", "cyber security", "an toan thong tin",
            "an ninh mang", "information security", "cybersecurity", "bao ve"]),
        ("web", ["web development", "phat trien web", "frontend", "backend",
            "fullstack", "html", "css", "javascript", "react", "angular", "vue"]),
        ("di dong", ["mobile", "mobile development", "android", "ios",
            "ung dung di dong", "flutter", "react native", "phat trien di dong"]),
        ("dien toan dam may", ["cloud computing", "cloud", "aws", "azure",
            "google cloud", "devops", "docker", "kubernetes", "container"]),
        ("kiem thu", ["testing", "software testing", "qa", "quality assurance",
            "kiem tra phan mem", "test", "unit test", "integration test"]),

        // ── Khoa học / Science ────────────────────────────────────
        ("khoa hoc", ["science", "khoa hoc tu nhien", "natural science",
            "nghien cuu", "research"]),
        ("vat ly", ["physics", "vat li", "co hoc", "mechanics",
            "dien tu", "quantum", "luong tu"]),
        ("hoa hoc", ["chemistry", "hoa", "phan ung hoa hoc", "chemical"]),
        ("sinh hoc", ["biology", "sinh", "gene", "di truyen", "genetics",
            "sinh thai", "ecology"]),
        ("toan hoc", ["mathematics", "math", "toan", "dai so", "algebra",
            "giai tich", "calculus", "xac suat", "probability", "thong ke",
            "statistics", "hinh hoc", "geometry"]),

        // ── Kinh tế / Business ───────────────────────────────────
        ("kinh te", ["economics", "economy", "tai chinh", "finance",
            "ngan hang", "banking", "dau tu", "investment"]),
        ("quan tri", ["management", "quan ly", "leadership", "lanh dao",
            "nhan su", "human resources", "hr"]),
        ("marketing", ["tiep thi", "quang cao", "advertising", "brand",
            "thuong hieu", "digital marketing", "truyen thong",
            "communication"]),
        ("khoi nghiep", ["startup", "entrepreneurship", "kinh doanh",
            "business", "doanh nghiep", "enterprise"]),
        ("ke toan", ["accounting", "kiem toan", "audit", "tai chinh doanh nghiep",
            "corporate finance"]),

        // ── Ngôn ngữ / Language ──────────────────────────────────
        ("tieng anh", ["english", "anh ngu", "anh van", "esl",
            "toeic", "ielts", "toefl", "giao tiep tieng anh",
            "english communication"]),
        ("tieng nhat", ["japanese", "nhat ngu", "nihongo", "jlpt",
            "n1", "n2", "n3", "n4", "n5", "kanji"]),
        ("tieng han", ["korean", "han ngu", "hangul", "topik"]),
        ("tieng trung", ["chinese", "mandarin", "hoa ngu", "tieng hoa",
            "hsk"]),
        ("ngu phap", ["grammar", "cau truc cau", "sentence structure",
            "syntax", "cu phap"]),
        ("tu vung", ["vocabulary", "tu dien", "dictionary", "glossary",
            "kanji", "han tu"]),

        // ── Văn học / Literature ─────────────────────────────────
        ("van hoc", ["literature", "literary", "tieu thuyet", "novel",
            "truyen ngan", "short story", "tho", "poetry", "kich",
            "drama", "van xuoi", "prose"]),
        ("lich su", ["history", "historical", "co dai", "ancient",
            "hien dai", "modern", "trung dai", "medieval"]),
        ("triet hoc", ["philosophy", "tu tuong", "thought", "logic",
            "luan ly"]),
        ("tam ly hoc", ["psychology", "tam ly", "hanh vi", "behavior",
            "phat trien ban than", "self-help", "self help",
            "phat trien ca nhan", "personal development"]),

        // ── Kỹ thuật / Engineering ───────────────────────────────
        ("ky thuat", ["engineering", "cong nghe", "technology", "tech"]),
        ("dien tu", ["electronics", "dien", "electrical", "vi mach",
            "circuit", "mach dien", "ic", "fpga", "semiconductor",
            "ban dan"]),
        ("co khi", ["mechanical engineering", "co khi", "che tao",
            "manufacturing", "robot", "robotics", "tu dong hoa",
            "automation"]),
        ("xay dung", ["civil engineering", "construction", "kien truc",
            "architecture", "thiet ke", "design"]),

        // ── Khác ─────────────────────────────────────────────────
        ("giao duc", ["education", "su pham", "pedagogy", "giang day",
            "teaching", "hoc tap", "learning"]),
        ("y hoc", ["medicine", "y te", "health", "suc khoe",
            "bac si", "doctor", "duoc", "pharmacy"]),
        ("moi truong", ["environment", "sinh thai", "ecology",
            "phat trien ben vung", "sustainable development",
            "bien doi khi hau", "climate change"]),
        ("luat", ["law", "phap luat", "legal", "luat phap",
            "hien phap", "constitution", "luat dan su", "civil law"]),
        ("nghe thuat", ["art", "thiet ke", "design", "my thuat",
            "fine art", "am nhac", "music", "hoi hoa", "painting",
            "nhiep anh", "photography"]),
    ];

    /// <summary>
    /// Tra từ khóa (đã fold), trả về danh sách mở rộng đồng nghĩa.
    /// </summary>
    public static IReadOnlyList<string> Expand(string foldedTerm)
    {
        if (string.IsNullOrWhiteSpace(foldedTerm))
            return [];

        var term = foldedTerm.Trim();
        foreach (var (canonical, aliases) in Entries)
        {
            if (string.Equals(canonical, term, StringComparison.Ordinal)
                || aliases.Any(a => string.Equals(a, term, StringComparison.Ordinal)))
            {
                var result = new List<string>();
                if (!string.Equals(canonical, term, StringComparison.Ordinal))
                    result.Add(canonical);

                foreach (var alias in aliases)
                {
                    if (!string.Equals(alias, term, StringComparison.Ordinal))
                        result.Add(alias);
                }

                return result;
            }
        }

        return [];
    }

    /// <summary>
    /// Kiểm tra xem query và haystack có cùng chia sẻ một chủ đề/thuật ngữ đồng nghĩa nào không.
    /// </summary>
    public static bool HasSynonymMatch(string foldedQuery, string foldedHaystack)
    {
        if (string.IsNullOrWhiteSpace(foldedQuery) || string.IsNullOrWhiteSpace(foldedHaystack))
            return false;

        foreach (var (canonical, aliases) in Entries)
        {
            var queryMatches = foldedQuery.Contains(canonical, StringComparison.Ordinal)
                || aliases.Any(a => a.Length >= 3 && foldedQuery.Contains(a, StringComparison.Ordinal));

            if (!queryMatches)
                continue;

            var hayMatches = foldedHaystack.Contains(canonical, StringComparison.Ordinal)
                || aliases.Any(a => a.Length >= 3 && foldedHaystack.Contains(a, StringComparison.Ordinal));

            if (hayMatches)
                return true;
        }

        return false;
    }

    /// <summary>
    /// Kiểm tra xem 2 term có phải là đồng nghĩa không.
    /// </summary>
    public static bool AreSynonyms(string foldedTerm, string foldedCanonical)
    {
        foreach (var (canonical, aliases) in Entries)
        {
            var allTerms = new List<string>(aliases.Length + 1) { canonical };
            allTerms.AddRange(aliases);
            if (allTerms.Any(t => string.Equals(t, foldedTerm, StringComparison.Ordinal))
                && allTerms.Any(t => string.Equals(t, foldedCanonical, StringComparison.Ordinal)))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Trả về chuỗi mở rộng ngữ nghĩa cho nội dung RAG document.
    /// Dùng để enrich content trước khi tạo embedding.
    /// </summary>
    public static string EnrichForEmbedding(string foldedContent)
    {
        if (string.IsNullOrWhiteSpace(foldedContent))
            return string.Empty;

        var enriched = new HashSet<string>(StringComparer.Ordinal);
        foreach (var (canonical, aliases) in Entries)
        {
            if (foldedContent.Contains(canonical, StringComparison.Ordinal))
            {
                foreach (var alias in aliases)
                {
                    if (alias.Length >= 3 && !foldedContent.Contains(alias, StringComparison.Ordinal))
                        enriched.Add(alias);
                }

                continue;
            }

            foreach (var alias in aliases)
            {
                if (alias.Length >= 4 && foldedContent.Contains(alias, StringComparison.Ordinal))
                {
                    enriched.Add(canonical);
                    foreach (var other in aliases)
                    {
                        if (other.Length >= 3
                            && !string.Equals(other, alias, StringComparison.Ordinal)
                            && !foldedContent.Contains(other, StringComparison.Ordinal))
                        {
                            enriched.Add(other);
                        }
                    }

                    break;
                }
            }
        }

        return string.Join(", ", enriched.Take(20));
    }

    /// <summary>
    /// Cho category/major name, trả về từ khóa bổ sung.
    /// </summary>
    public static string CategoryKeywords(string categoryName)
    {
        var fold = SearchTopicGuard.Fold(categoryName);
        var keywords = new List<string>();

        foreach (var (canonical, aliases) in Entries)
        {
            if (fold.Contains(canonical, StringComparison.Ordinal)
                || aliases.Any(a => a.Length >= 4 && fold.Contains(a, StringComparison.Ordinal)))
            {
                keywords.Add(canonical);
                keywords.AddRange(aliases.Where(a => a.Length >= 3).Take(5));
            }
        }

        return string.Join(", ", keywords.Distinct().Take(15));
    }
}
