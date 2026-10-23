namespace SmartLibrary.Domain.Enums;

public static class PolicyRuleKinds
{
    public static readonly PolicyRuleType[] PolicyTypes =
    {
        PolicyRuleType.BorrowLimit,
        PolicyRuleType.BorrowDuration,
        PolicyRuleType.Renewal,
        PolicyRuleType.Reservation,
        PolicyRuleType.FineFee,
        PolicyRuleType.CategoryOverride
    };

    public static readonly PolicyRuleType[] RegulationTypes =
    {
        PolicyRuleType.LibraryUse,
        PolicyRuleType.OpeningHours,
        PolicyRuleType.LibraryService,
        PolicyRuleType.Conduct,
        PolicyRuleType.Safety,
        PolicyRuleType.DocumentCare,
        PolicyRuleType.DocumentUse,
        PolicyRuleType.QuotaInfo,
        PolicyRuleType.ReturnRule,
        PolicyRuleType.RenewalInfo,
        PolicyRuleType.Compensation,
        PolicyRuleType.General,
        PolicyRuleType.Violation,
        PolicyRuleType.Other
    };

    public static bool IsRegulation(PolicyRuleType type) =>
        Array.IndexOf(RegulationTypes, type) >= 0;

    public static bool IsPolicy(PolicyRuleType type) =>
        Array.IndexOf(PolicyTypes, type) >= 0;
}
