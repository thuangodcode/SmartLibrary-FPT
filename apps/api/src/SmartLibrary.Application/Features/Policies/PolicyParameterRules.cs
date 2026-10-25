using System.Globalization;
using SmartLibrary.Application.Features.Policies.DTOs;

namespace SmartLibrary.Application.Features.Policies;

/// <summary>
/// Kiểm tra số ngày, số lượng và mức phí do Admin nhập. Không dùng giá trị mặc định 7/14 hay phí cố định.
/// </summary>
public static class PolicyParameterRules
{
    public const int MinDays = 1;
    public const int MaxDays = 365;
    public const int MinHours = 1;
    public const int MaxHours = 720;
    public const int MinCount = 1;
    public const int MaxCount = 200;
    public const int MinFee = 1;
    public const int MaxFee = 100_000_000;

    private static readonly HashSet<string> DayKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "max_days", "max_days_vi", "max_days_foreign", "max_days_en",
        "renewal_days", "renewal_days_vi", "renewal_days_foreign", "renewal_days_en"
    };

    private static readonly HashSet<string> WindowDayKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "self_renew_before_days", "self_renew_after_days"
    };

    private static readonly HashSet<string> HourKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "hold_hours", "pickup_deadline_hours", "pickup_slot_minutes"
    };

    private static readonly HashSet<string> CountKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "max_books", "max_books_student", "max_books_lecturer",
        "max_renewals", "pickup_capacity_per_slot", "pickup_days_ahead"
    };

    private static readonly HashSet<string> FeeKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "overdue_fee_per_day", "damage_fee", "damaged_book_fee", "lost_book_fee", "lost_fee"
    };

    public static string? Validate(
        string? policyType,
        string? status,
        IEnumerable<PolicyRuleParameterDto> parameters)
    {
        var filled = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in parameters)
        {
            if (string.IsNullOrWhiteSpace(parameter.Key))
                continue;
            var key = parameter.Key.Trim();
            var value = parameter.Value?.Trim() ?? string.Empty;
            if (value.Length == 0)
                continue;
            var error = ValidateOne(key, value);
            if (error is not null)
                return error;
            filled[key] = value;
        }

        var isActive = string.Equals(status, "Active", StringComparison.OrdinalIgnoreCase);
        if (isActive
            && string.Equals(policyType, "BorrowDuration", StringComparison.OrdinalIgnoreCase)
            && !filled.ContainsKey("max_days"))
            return "Vui lòng nhập số ngày mượn (số nguyên dương).";

        return null;
    }

    public static string? ValidateOne(string key, string value)
    {
        if (DayKeys.Contains(key))
            return ValidateInt(value, MinDays, MaxDays, "Số ngày");
        if (WindowDayKeys.Contains(key))
            return ValidateInt(value, 0, MaxDays, "Số ngày cửa sổ gia hạn");
        if (HourKeys.Contains(key))
            return ValidateInt(value, MinHours, MaxHours, "Số giờ");
        if (CountKeys.Contains(key))
            return ValidateInt(value, MinCount, MaxCount, "Số lượng");
        if (FeeKeys.Contains(key))
            return ValidateInt(value, MinFee, MaxFee, "Mức phí");
        if (IsFlagKey(key) && !IsFlagValue(value))
            return "Giá trị Có/Không chỉ nhận true hoặc false.";
        return null;
    }

    private static bool IsFlagKey(string key)
        => key.StartsWith("block_", StringComparison.OrdinalIgnoreCase)
            || key.Equals("restrict_if_unpaid", StringComparison.OrdinalIgnoreCase)
            || key.Equals("allow_reservation", StringComparison.OrdinalIgnoreCase)
            || key.Equals("textbook_requires_approval", StringComparison.OrdinalIgnoreCase)
            || key.Equals("on_site_only", StringComparison.OrdinalIgnoreCase);

    private static bool IsFlagValue(string value)
        => value.Equals("true", StringComparison.OrdinalIgnoreCase)
            || value.Equals("false", StringComparison.OrdinalIgnoreCase)
            || value == "1"
            || value == "0";

    private static string? ValidateInt(string value, int min, int max, string label)
    {
        if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number))
            return $"{label} phải là số nguyên.";
        if (number < min || number > max)
            return $"{label} phải từ {min} đến {max}.";
        return null;
    }
}
