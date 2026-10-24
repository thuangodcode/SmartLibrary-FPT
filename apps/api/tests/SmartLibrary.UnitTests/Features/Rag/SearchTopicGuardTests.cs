using FluentAssertions;
using SmartLibrary.Application.Features.Rag;

namespace SmartLibrary.UnitTests.Features.Rag;

public class SearchTopicGuardTests
{
    [Fact]
    public void JapaneseEsp_RejectsPythonAndEnglishGrammar()
    {
        const string query = "Tôi muốn tìm sách liên quan đến ngôn ngữ chuyên ngành tiếng Nhật.";
        SearchTopicGuard.Allows(query, "Python nâng cao", "Ngôn ngữ lập trình Python. Giáo trình chuyên ngành CNTT", [], ["Công nghệ thông tin"], null, null)
            .Should().BeFalse();
        SearchTopicGuard.Allows(query, "English Grammar in Use", "Ngữ pháp tiếng Anh", [], ["Ngoại ngữ"], null, null)
            .Should().BeFalse();
        SearchTopicGuard.Allows(query, "Giáo trình tiếng Nhật", "Sách học tiếng Nhật", [], ["Ngoại ngữ"], null, null)
            .Should().BeTrue();
    }

    [Fact]
    public void JapaneseIt_RequiresBothLanguageAndIt()
    {
        const string query = "Tìm sách tiếng Nhật chuyên ngành công nghệ thông tin.";
        SearchTopicGuard.Allows(query, "Minna no Nihongo", "Giáo trình tiếng Nhật sơ cấp", [], [], null, null)
            .Should().BeFalse();
        SearchTopicGuard.Allows(query, "Tiếng Nhật CNTT", "Tiếng Nhật công nghệ thông tin", [], ["CNTT"], null, null)
            .Should().BeTrue();
    }

    [Fact]
    public void PythonQuery_RequiresPython()
    {
        const string query = "Tìm sách Python nâng cao.";
        SearchTopicGuard.Allows(query, "Python nâng cao", "Python cho kỹ sư", [], [], null, null)
            .Should().BeTrue();
        SearchTopicGuard.Allows(query, "Giáo trình tiếng Nhật", "Tiếng Nhật sơ cấp", [], [], null, null)
            .Should().BeFalse();
    }

    [Fact]
    public void MatchLabel_DoesNotUseRawCosinePercent()
    {
        SearchTopicGuard.MatchLabel(0.78).Should().Be("Phù hợp cao");
        SearchTopicGuard.MatchLabel(0.56).Should().Be("Có liên quan");
    }

    [Fact]
    public void LanguageLearningWithoutLanguage_NeedsClarification()
    {
        var intent = SearchTopicGuard.Parse("Tìm sách ngôn ngữ chuyên ngành");
        intent.NeedsClarification.Should().BeTrue();
        intent.Language.Should().BeNull();
    }

    [Fact]
    public void ForeignLanguageCategory_IsNotAVagueLanguageQuestion()
    {
        SearchTopicGuard.Parse("sách liên quan đến ngoại ngữ").NeedsClarification.Should().BeFalse();
        SearchTopicGuard.Allows(
                "sách liên quan đến ngoại ngữ",
                "English Grammar in Use (Advanced Edition)",
                "Giáo trình ngữ pháp tiếng Anh",
                ["Raymond Murphy"],
                ["Ngoại ngữ"],
                "9780521189064",
                "BK000007",
                "en")
            .Should().BeTrue();
    }

    [Fact]
    public void CompoundQuery_AllowsEachClauseSeparately()
    {
        const string query = "kiểm dùm tôi sách Nguyễn Nhật Ánh và sách liên quan đến ngoại ngữ";
        SearchTopicGuard.SplitIntents(query).Should().HaveCount(2);
        SearchTopicGuard.Allows(
                query,
                "Tôi thấy hoa vàng trên cỏ xanh",
                "Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.",
                ["Nguyễn Nhật Ánh"],
                ["Văn học"],
                "9786041004429",
                "BK000003",
                "vi")
            .Should().BeTrue();
        SearchTopicGuard.Allows(
                query,
                "English Grammar in Use (Advanced Edition)",
                "Giáo trình ngữ pháp tiếng Anh",
                ["Raymond Murphy"],
                ["Ngoại ngữ"],
                "9780521189064",
                "BK000007",
                "en")
            .Should().BeTrue();
        SearchTopicGuard.Allows(
                query,
                "Python nâng cao",
                "Python nâng cao",
                ["Bùi Việt Hà"],
                ["CNTT & Phần mềm"],
                "1234567890",
                "BK000011",
                "en")
            .Should().BeFalse();
    }

    [Fact]
    public void DiscreteMathIntent_RejectsProgrammingAndEnglishGrammar()
    {
        const string query = "Tìm tài liệu toán học tăng tư duy logic và toán học dùng cho sinh viên ngành IT.";
        SearchTopicGuard.Parse(query).Domain.Should().Be("math");
        SearchTopicGuard.Allows(
                query,
                "Toán học rời rạc ứng dụng trong Công nghệ thông tin",
                "Nền tảng logic mệnh đề, đồ thị và thuật toán tổ hợp cho kỹ sư phần mềm.",
                ["Kenneth H. Rosen"],
                ["Khoa học tự nhiên"],
                "9780073383095",
                "BK000009",
                "vi")
            .Should().BeTrue();
        SearchTopicGuard.Allows(
                query,
                "English Grammar in Use (Advanced Edition)",
                "Giáo trình ngữ pháp tiếng Anh toàn diện cho sinh viên và người đi làm.",
                ["Raymond Murphy"],
                ["Ngoại ngữ"],
                "9780521189064",
                "BK000007",
                "en")
            .Should().BeFalse();
        SearchTopicGuard.Allows(
                query,
                "Clean Code: A Handbook of Agile Software Craftsmanship",
                "A guide to writing clean, maintainable code.",
                ["Robert C. Martin"],
                ["Công nghệ thông tin"],
                "9780132350884",
                null,
                "en")
            .Should().BeFalse();
    }

    [Fact]
    public void CompoundPythonAndCleanCode_DoesNotForcePythonOnEveryHit()
    {
        const string query = "Python nâng cao và Clean Code";
        SearchTopicGuard.Allows(query, "Python nâng cao", "Python nâng cao", ["Bùi Việt Hà"], ["CNTT & Phần mềm"], "1234567890", null, "en")
            .Should().BeTrue();
        SearchTopicGuard.Allows(
                query,
                "Clean Code: A Handbook of Agile Software Craftsmanship",
                "A guide to writing clean, maintainable code.",
                ["Robert C. Martin"],
                ["Công nghệ thông tin"],
                "9780132350884",
                null,
                "en")
            .Should().BeTrue();
    }
}
