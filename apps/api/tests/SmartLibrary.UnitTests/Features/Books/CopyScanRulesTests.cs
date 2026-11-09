using SmartLibrary.Application.Features.Books;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.UnitTests.Features.Books;

public class CopyScanRulesTests
{
    [Theory]
    [InlineData(null, "A", 1)]
    [InlineData("A", "B", 0)]
    [InlineData("A", "A", 0)]
    [InlineData("A", null, -1)]
    [InlineData(null, null, 0)]
    public void TransferBetweenShelvesDoesNotIncreaseAvailableStock(string? before, string? after, int expected)
        => Assert.Equal(expected, CopyScanRules.ShelfAvailabilityDelta(before, after));

    [Theory]
    [InlineData("Borrowed", true)]
    [InlineData("Overdue", true)]
    [InlineData("Pending", false)]
    [InlineData("Approved", false)]
    [InlineData("Returned", false)]
    [InlineData("Rejected", false)]
    [InlineData("Cancelled", false)]
    [InlineData(null, false)]
    public void ReturnRequiresAPhysicalLoan(string? status, bool expected)
        => Assert.Equal(expected, CopyScanRules.CanReturn(status));

    [Theory]
    [InlineData(true, null, BookCondition.New, false, true)]
    [InlineData(true, null, BookCondition.Good, false, true)]
    [InlineData(true, null, BookCondition.Fair, false, true)]
    [InlineData(true, null, BookCondition.LightDamaged, false, true)]
    [InlineData(true, "Tầng 1 · Kệ A", BookCondition.Good, false, false)]
    [InlineData(false, null, BookCondition.Good, false, false)]
    [InlineData(true, null, BookCondition.Damaged, false, false)]
    [InlineData(true, null, BookCondition.Lost, false, false)]
    [InlineData(true, null, BookCondition.Good, true, false)]
    public void ShelvingRequiresAGoodWarehouseCopyWithoutAnOpenLoan(
        bool available, string? location, BookCondition condition, bool hasOpenLoan, bool expected)
        => Assert.Equal(expected, CopyScanRules.CanShelve(available, location, condition, hasOpenLoan));
}
