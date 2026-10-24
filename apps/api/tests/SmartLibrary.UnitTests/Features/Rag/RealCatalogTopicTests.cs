using FluentAssertions;
using SmartLibrary.Application.Features.Rag;

namespace SmartLibrary.UnitTests.Features.Rag;

/// <summary>
/// Đánh giá trên đúng 11 đầu sách đang có trong Supabase (2026-10-24). Không có sách tiếng Nhật.
/// </summary>
public class RealCatalogTopicTests
{
    private static readonly CatalogBook[] Catalog =
    [
        Book("Clean Architecture: A Craftsman's Guide to Software Structure and Design", "Building maintainable software architectures.", "Robert C. Martin", "Công nghệ thông tin", "9780134494166", "en"),
        Book("Clean Code: A Handbook of Agile Software Craftsmanship", "A guide to writing clean, maintainable code.", "Robert C. Martin", "Công nghệ thông tin", "9780132350884", "en"),
        Book("Digital Marketing Thực Chiến", "Cẩm nang tiếp thị kỹ thuật số đa kênh từ chiến lược đến thực thi tăng trưởng.", "Philip Kotler", "Kinh tế và Quản trị", "9786040000097", "vi"),
        Book("English Grammar in Use (Advanced Edition)", "Giáo trình ngữ pháp tiếng Anh toàn diện cho sinh viên và người đi làm.", "Raymond Murphy", "Ngoại ngữ", "9780521189064", "en"),
        Book("Python cơ bản", "Sách cơ bản về Python", "Bùi Việt Hà", "CNTT & Phần mềm", "9111111111111111", "vi"),
        Book("Python nâng cao", "Python nâng cao", "Bùi Việt Hà", "CNTT & Phần mềm", "1234567890", "en"),
        Book("Refactoring: Improving the Design of Existing Code", "A classic guide to code refactoring techniques.", "Martin Fowler", "Công nghệ thông tin", "9780134757599", "en"),
        Book("Toán học rời rạc ứng dụng trong Công nghệ thông tin", "Nền tảng logic mệnh đề, đồ thị và thuật toán tổ hợp cho kỹ sư phần mềm.", "Kenneth H. Rosen", "Khoa học tự nhiên", "9780073383095", "vi"),
        Book("Tôi thấy hoa vàng trên cỏ xanh", "Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.", "Nguyễn Nhật Ánh", "Văn học", "9786041004429", "vi"),
        Book("Tư duy nhanh và chậm (Thinking, Fast and Slow)", "Khám phá hai hệ thống thúc đẩy cách chúng ta suy nghĩ và đưa ra quyết định.", "Daniel Kahneman", "Khoa học xã hội", "9786040000080", "vi"),
        Book("Typography & Thiết kế thị giác đương đại", "Quy chuẩn thiết kế bố cục, phân cấp thị giác và nghệ thuật typography.", "Ellen Lupton", "Văn hóa và Nghệ thuật", "9781568989693", "vi"),
    ];

    [Theory]
    [InlineData("Tìm sách ngôn ngữ chuyên ngành tiếng Nhật.")]
    [InlineData("Tìm sách tiếng Nhật chuyên ngành công nghệ thông tin.")]
    [InlineData("Tìm sách từ vựng tiếng Nhật thương mại.")]
    [InlineData("Tìm sách tiếng Nhật")]
    public void JapaneseQueries_AgainstLiveCatalog_ReturnNoBooks(string query)
    {
        Matches(query).Should().BeEmpty(
            "catalog hiện không có sách tiếng Nhật; không được trả Python, ngữ pháp Anh hoặc văn học Nguyễn Nhật Ánh");
    }

    [Fact]
    public void PythonAdvanced_ReturnsPythonAdvancedNotJapaneseOrEnglishGrammar()
    {
        var titles = Matches("Tìm sách Python nâng cao.");
        titles.Should().Contain("Python nâng cao");
        titles.Should().NotContain("English Grammar in Use (Advanced Edition)");
        titles.Should().NotContain("Tôi thấy hoa vàng trên cỏ xanh");
    }

    [Fact]
    public void EnglishGrammar_ReturnsMurphyNotPython()
    {
        Matches("Tìm sách ngữ pháp tiếng Anh.").Should().Equal("English Grammar in Use (Advanced Edition)");
    }

    [Fact]
    public void MissingBook_ReturnsEmpty()
    {
        Matches("Tìm sách xyzzy-khong-ton-tai-trong-thu-vien").Should().BeEmpty();
    }

    [Fact]
    public void ExactIsbn_ReturnsCleanCode()
    {
        Matches("9780132350884").Should().Equal("Clean Code: A Handbook of Agile Software Craftsmanship");
    }

    [Fact]
    public void ExactTitle_ReturnsCleanCode()
    {
        Matches("Clean Code").Should().Contain("Clean Code: A Handbook of Agile Software Craftsmanship");
    }

    [Fact]
    public void VagueLanguageQuery_NeedsClarificationInsteadOfDumpingCatalog()
    {
        var intent = SearchTopicGuard.Parse("Tìm sách ngôn ngữ");
        intent.NeedsClarification.Should().BeTrue();
        Matches("Tìm sách ngôn ngữ").Should().BeEmpty();
    }

    [Fact]
    public void CompoundAuthorAndForeignLanguage_ReturnsBothNotPython()
    {
        var titles = Matches("kiểm dùm tôi sách Nguyễn Nhật Ánh và sách liên quan đến ngoại ngữ kiểm dùm tôi");
        titles.Should().Contain("Tôi thấy hoa vàng trên cỏ xanh");
        titles.Should().Contain("English Grammar in Use (Advanced Edition)");
        titles.Should().NotContain("Python nâng cao");
        titles.Should().NotContain("Python cơ bản");
    }

    [Fact]
    public void CompoundPythonAndCleanCode_ReturnsBoth()
    {
        var titles = Matches("Python nâng cao và Clean Code");
        titles.Should().Contain("Python nâng cao");
        titles.Should().Contain("Clean Code: A Handbook of Agile Software Craftsmanship");
    }

    [Fact]
    public void HardwareAndDiscreteMathProse_ReturnsOnlyRosenNotLiteratureOrCleanCode()
    {
        const string query =
            "Tôi đang học ngành Công nghệ thông tin và muốn tìm tài liệu để bổ sung kiến thức cho hai phần mà tôi đang gặp khó khăn. "
            + "Thứ nhất, tôi muốn hiểu cách các linh kiện điện tử siêu nhỏ được tích hợp trên một tấm bán dẫn, "
            + "cách các thành phần bên trong bộ xử lý phối hợp với nhau và nguyên lý thiết kế các mạch điện tử trong thiết bị máy tính. "
            + "Bên cạnh đó, tôi cũng cần học cách xác định một mệnh đề đúng hay sai, sử dụng các quy tắc logic để suy luận, "
            + "làm việc với tập hợp và quan hệ, tính số cách sắp xếp các đối tượng và chứng minh các kết luận bằng lập luận toán học. "
            + "Tôi muốn tìm một cuốn sách giải thích về cấu tạo và thiết kế các hệ thống điện tử ở cấp độ linh kiện, "
            + "đồng thời tìm thêm một cuốn sách giúp tôi nắm vững tư duy logic, các phương pháp chứng minh và những nền tảng toán học phục vụ khoa học máy tính.";

        var intent = SearchTopicGuard.Parse(query);
        intent.Topics.Should().Contain("hardware");
        intent.Topics.Should().Contain("math");
        var titles = Matches(query);
        titles.Should().Equal("Toán học rời rạc ứng dụng trong Công nghệ thông tin");
        titles.Should().NotContain("Tôi thấy hoa vàng trên cỏ xanh");
        titles.Should().NotContain("Clean Code: A Handbook of Agile Software Craftsmanship");
        titles.Should().NotContain("Clean Architecture: A Craftsman's Guide to Software Structure and Design");
        titles.Should().NotContain("Refactoring: Improving the Design of Existing Code");

        var leaked = new[]
        {
            Hit("Tôi thấy hoa vàng trên cỏ xanh", "Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.", "Nguyễn Nhật Ánh", "Văn học", 0.82),
            Hit("Clean Code: A Handbook of Agile Software Craftsmanship", "A guide to writing clean, maintainable code.", "Robert C. Martin", "Công nghệ thông tin", 0.8),
            Hit("Clean Architecture: A Craftsman's Guide to Software Structure and Design", "Building maintainable software architectures.", "Robert C. Martin", "Công nghệ thông tin", 0.79),
            Hit("Refactoring: Improving the Design of Existing Code", "A classic guide to code refactoring techniques.", "Martin Fowler", "Công nghệ thông tin", 0.78),
            Hit("Toán học rời rạc ứng dụng trong Công nghệ thông tin", "Nền tảng logic mệnh đề, đồ thị và thuật toán tổ hợp cho kỹ sư phần mềm.", "Kenneth H. Rosen", "Khoa học tự nhiên", 0.7),
        };
        SearchTopicGuard.Filter(query, leaked).Select(item => item.Title).Should()
            .Equal("Toán học rời rạc ứng dụng trong Công nghệ thông tin");
    }

    private static SmartLibrary.Application.Features.Rag.DTOs.RagSearchHit Hit(
        string title, string content, string author, string category, double score)
        => new()
        {
            SourceType = "book",
            SourceId = Guid.NewGuid(),
            Title = title,
            Content = content,
            Author = author,
            Categories = [category],
            Score = score
        };

    [Fact]
    public void LongDiscreteMathDescription_ReturnsRosenNotProgrammingOrEnglishGrammar()
    {
        const string query =
            "Tôi là sinh viên ngành Công nghệ thông tin và nhận thấy mình còn cứng về nền tảng toán học để học lập trình tốt hơn. "
            + "Tôi muốn hiểu cách máy tính xử lý những điều kiện đúng sai, cách biểu diễn dữ liệu thành các nhóm phần tử, "
            + "cách xác định mối quan hệ giữa các đối tượng và cách chứng minh một thuật toán có hiệu quả hay không. "
            + "Tôi không muốn tìm sách dạy căn bản ngôn ngữ lập trình cụ thể mà muốn tìm tài liệu toán học tăng tư duy logic "
            + "và toán học dùng cho sinh viên ngành IT. Hãy tìm sách phù hợp trong thư viện.";

        SearchTopicGuard.SplitIntents(query).Should().ContainSingle();
        var titles = Matches(query);
        titles.Should().Contain("Toán học rời rạc ứng dụng trong Công nghệ thông tin");
        titles.Should().NotContain("Clean Code: A Handbook of Agile Software Craftsmanship");
        titles.Should().NotContain("Clean Architecture: A Craftsman's Guide to Software Structure and Design");
        titles.Should().NotContain("Refactoring: Improving the Design of Existing Code");
        titles.Should().NotContain("English Grammar in Use (Advanced Edition)");
        titles.Should().NotContain("Python nâng cao");
    }

    [Fact]
    public void FiveBooks_CommaSeparated_ReturnsEachNamedBook()
    {
        var titles = Matches("Python nâng cao, Clean Code, Refactoring, English Grammar, hoa vàng trên cỏ xanh");
        titles.Should().Contain("Python nâng cao");
        titles.Should().Contain("Clean Code: A Handbook of Agile Software Craftsmanship");
        titles.Should().Contain("Refactoring: Improving the Design of Existing Code");
        titles.Should().Contain("English Grammar in Use (Advanced Edition)");
        titles.Should().Contain("Tôi thấy hoa vàng trên cỏ xanh");
        titles.Should().NotContain("Digital Marketing Thực Chiến");
    }

    [Fact]
    public void FiveBooks_MessyWordingWithoutAnd_StillFindsNamedBooks()
    {
        var titles = Matches("kiếm dùm python clean code refactoring hoa vàng với ngữ pháp english giúp tôi");
        titles.Should().Contain("Python nâng cao");
        titles.Should().Contain("Clean Code: A Handbook of Agile Software Craftsmanship");
        titles.Should().Contain("Refactoring: Improving the Design of Existing Code");
        titles.Should().Contain("Tôi thấy hoa vàng trên cỏ xanh");
        titles.Should().Contain("English Grammar in Use (Advanced Edition)");
        titles.Should().NotContain("Typography & Thiết kế thị giác đương đại");
    }

    [Fact]
    public void RepeatedSach_SplitsFiveRequests()
    {
        SearchTopicGuard.SplitIntents(
                "sách Python sách Clean Code sách Refactoring sách hoa vàng sách English Grammar")
            .Should().HaveCountGreaterThanOrEqualTo(4);
    }

    [Fact]
    public void NguyenNhatAnh_IsNotJapaneseLanguageEvidence()
    {
        SearchTopicGuard.Allows(
                "Tìm sách tiếng Nhật",
                "Tôi thấy hoa vàng trên cỏ xanh",
                "Tiểu thuyết nổi tiếng của Nguyễn Nhật Ánh.",
                ["Nguyễn Nhật Ánh"],
                ["Văn học"],
                "9786041004429",
                "BK000003",
                "vi")
            .Should().BeFalse();
    }

    private static List<string> Matches(string query)
        => Catalog
            .Where(book => SearchTopicGuard.Allows(
                query, book.Title, book.Description, [book.Author], [book.Category], book.Isbn, null, book.Language))
            .Select(book => book.Title)
            .ToList();

    private static CatalogBook Book(
        string title, string description, string author, string category, string isbn, string language)
        => new(title, description, author, category, isbn, language);

    private sealed record CatalogBook(
        string Title, string Description, string Author, string Category, string Isbn, string Language);
}
