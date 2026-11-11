using SmartLibrary.Application.Features.Books;

namespace SmartLibrary.UnitTests.Features.Books;

public class BookCodeRulesTests
{
    [Fact]
    public void FillsTheSmallestGapRatherThanTakingMaximumPlusOne()
    {
        var codes = Enumerable.Range(0, 11).Select(number => $"KHTN{number:D3}").Append("KHTN012");
        Assert.Equal("KHTN011", BookCodeRules.NextAvailable("KHTN", codes));
    }

    [Fact]
    public void UsesOnlyExactPrefixAndNumericSuffix()
        => Assert.Equal("IT002", BookCodeRules.NextAvailable("IT", ["IT001", "CIT002", "IT003", "ITABC", "IT1A", "XIT002"]));

    [Fact]
    public void StartsAtOneAndPadsToAtLeastThreeDigits()
    {
        Assert.Equal("VH001", BookCodeRules.NextAvailable("VH", []));
        Assert.Equal("VH1000", BookCodeRules.NextAvailable("VH", Enumerable.Range(1, 999).Select(number => $"VH{number:D3}")));
    }

    [Fact]
    public void ReservesLegacyUnpaddedAndCaseInsensitiveCodes()
        => Assert.Equal("NN003", BookCodeRules.NextAvailable("NN", ["nn1", "NN002", "NN000"]));

    [Theory]
    [InlineData(" khtn ", "KHTN")]
    [InlineData("IT", "IT")]
    [InlineData("KHTN1", null)]
    [InlineData("Khoa học", null)]
    [InlineData("", null)]
    [InlineData("ABCDEFGHIJKLMNOPQ", null)]
    public void NormalizesAndValidatesCategoryPrefixes(string value, string? expected)
        => Assert.Equal(expected, BookCodeRules.NormalizeCategoryCode(value));
}
