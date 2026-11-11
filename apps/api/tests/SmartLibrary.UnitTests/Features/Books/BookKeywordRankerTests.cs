using FluentAssertions;
using SmartLibrary.Infrastructure.Text;

namespace SmartLibrary.UnitTests.Features.Books;

public class BookKeywordRankerTests
{
    [Theory]
    [InlineData("P")]
    [InlineData("Py")]
    [InlineData("Pyt")]
    public void ShortTitlePrefixes_ReturnMatchingBooks(string query)
    {
        var score = BookKeywordRanker.Score(
            query,
            "Python cơ bản",
            "Sách nhập môn lập trình",
            "BK-001",
            null,
            ["Bùi Việt Hà"],
            ["CNTT & Phần mềm"]);

        score.Should().BeGreaterThan(0);
    }

    [Fact]
    public void ShortPrefix_DoesNotMatchAnUnrelatedBook()
    {
        var score = BookKeywordRanker.Score(
            "P",
            "Clean Code",
            "A guide to maintainable software.",
            "BK-001",
            null,
            ["Robert Martin"],
            ["Công nghệ thông tin"]);

        score.Should().Be(0);
    }
}
