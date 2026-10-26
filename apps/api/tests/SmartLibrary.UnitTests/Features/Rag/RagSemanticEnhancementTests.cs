using FluentAssertions;
using SmartLibrary.Application.Features.Rag;
using SmartLibrary.Infrastructure.Text;

namespace SmartLibrary.UnitTests.Features.Rag;

public class RagSemanticEnhancementTests
{
    [Fact]
    public void SemanticSynonyms_Expand_ReturnsExpectedSynonyms()
    {
        var synonyms = SemanticSynonyms.Expand("lap trinh");
        synonyms.Should().Contain("programming");
        synonyms.Should().Contain("software development");

        var dbSynonyms = SemanticSynonyms.Expand("co so du lieu");
        dbSynonyms.Should().Contain("database");
        dbSynonyms.Should().Contain("sql");

        var aiSynonyms = SemanticSynonyms.Expand("tri tue nhan tao");
        aiSynonyms.Should().Contain("artificial intelligence");
        aiSynonyms.Should().Contain("machine learning");
    }

    [Fact]
    public void SemanticSynonyms_HasSynonymMatch_DetectsCrossLingualMatch()
    {
        var matched = SemanticSynonyms.HasSynonymMatch(
            "tim sach lap trinh",
            "clean code: a handbook of agile software craftsmanship programming");
        matched.Should().BeTrue();

        var aiMatched = SemanticSynonyms.HasSynonymMatch(
            "sach tri tue nhan tao",
            "hands-on machine learning with scikit-learn artificial intelligence");
        aiMatched.Should().BeTrue();

        var unrelated = SemanticSynonyms.HasSynonymMatch(
            "sach toan hoc",
            "english grammar in use foreign languages");
        unrelated.Should().BeFalse();
    }

    [Fact]
    public void QueryExpander_Expand_EnrichesProgrammingQuery()
    {
        var expanded = QueryExpander.Expand("sách lập trình", isBookSearch: true);
        expanded.Should().Contain("software development");
        expanded.Should().Contain("programming");
        expanded.Should().StartWith("Tìm sách trong thư viện đại học phù hợp với nhu cầu sau:");
    }

    [Fact]
    public void QueryExpander_Expand_EnrichesAiQuery()
    {
        var expanded = QueryExpander.Expand("tìm hiểu trí tuệ nhân tạo", isBookSearch: true);
        expanded.Should().Contain("artificial intelligence");
        expanded.Should().Contain("machine learning");
    }

    [Fact]
    public void SearchTopicGuard_Allows_MatchesViaSynonyms()
    {
        // Query in Vietnamese, book metadata in English
        const string query = "Tìm sách lập trình phần mềm";
        var allowed = SearchTopicGuard.Allows(
            query,
            "Clean Code",
            "A Handbook of Agile Software Craftsmanship",
            ["Robert C. Martin"],
            ["Programming", "Software Development"],
            "9780132350884",
            "BK000001",
            "en");

        allowed.Should().BeTrue();
    }

    [Fact]
    public void BookKeywordRanker_ScoresHigher_WhenCrossLingualSynonymsMatch()
    {
        var scoreWithSynonym = BookKeywordRanker.Score(
            "sách lập trình",
            "Clean Code",
            "A Handbook of Agile Software Craftsmanship and programming principles",
            "BK000001",
            "9780132350884",
            ["Robert C. Martin"],
            ["Programming"],
            "en");

        scoreWithSynonym.Should().BeGreaterThan(0.5);
    }
}
