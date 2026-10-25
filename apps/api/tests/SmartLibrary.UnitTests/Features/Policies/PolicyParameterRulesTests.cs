using FluentAssertions;
using SmartLibrary.Application.Features.Policies;
using SmartLibrary.Application.Features.Policies.DTOs;

namespace SmartLibrary.UnitTests.Features.Policies;

public class PolicyParameterRulesTests
{
    [Fact]
    public void Validate_AcceptsPositiveBorrowDays()
    {
        var error = PolicyParameterRules.Validate("BorrowDuration", "Active", [
            new PolicyRuleParameterDto { Key = "max_days", Value = "14" }
        ]);
        error.Should().BeNull();
    }

    [Fact]
    public void Validate_RejectsZeroOrTextDays()
    {
        PolicyParameterRules.ValidateOne("max_days", "0").Should().Contain("từ");
        PolicyParameterRules.ValidateOne("max_days", "abc").Should().Contain("số nguyên");
        PolicyParameterRules.ValidateOne("max_days", "-7").Should().Contain("từ");
    }

    [Fact]
    public void Validate_RejectsOutOfRangeFee()
    {
        PolicyParameterRules.ValidateOne("damage_fee", "0").Should().Contain("từ");
        PolicyParameterRules.ValidateOne("lost_book_fee", "100000001").Should().Contain("từ");
        PolicyParameterRules.ValidateOne("damage_fee", "10000").Should().BeNull();
    }

    [Fact]
    public void Validate_ActiveBorrowDurationRequiresMaxDays()
    {
        var error = PolicyParameterRules.Validate("BorrowDuration", "Active", [
            new PolicyRuleParameterDto { Key = "max_days_vi", Value = "7" }
        ]);
        error.Should().Contain("số ngày mượn");
    }

    [Fact]
    public void Validate_AllowsEmptyOptionalFields()
    {
        var error = PolicyParameterRules.Validate("FineFee", "Active", [
            new PolicyRuleParameterDto { Key = "overdue_fee_per_day", Value = "5000" },
            new PolicyRuleParameterDto { Key = "damage_fee", Value = "" }
        ]);
        error.Should().BeNull();
    }
}
