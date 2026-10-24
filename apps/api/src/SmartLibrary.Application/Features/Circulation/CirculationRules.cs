using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.Application.Features.Circulation;

/// <summary>
/// Pure circulation rules. Policy numbers come from PolicyRules; fallbacks are not official FPT TP.HCM regulations.
/// </summary>
public static class CirculationRules
{
    public const string OverdueReasonPrefix = "Phạt quá hạn";
    public const string CompensationLostPrefix = "Bồi thường mất sách";
    public const string CompensationDamagePrefix = "Bồi thường hư hỏng";
    public const string LostNote = "Đã lập hồ sơ thất lạc, chờ thủ thư xác minh bản sao và phiếu mượn. Chưa tính bồi thường.";
    public const string DamagedNote = "Đã lập hồ sơ hư hỏng, chờ thủ thư đánh giá mức độ. Chưa tính bồi thường.";
    public const string ReservationPending = "pending";
    public const string ReservationReady = "ready";
    public const string ReservationFulfilled = "fulfilled";
    public const string ReservationCancelled = "cancelled";
    public const string ReservationExpired = "expired";

    public static DateTime LibraryDate(DateTime utc)
        => TimeZoneInfo.ConvertTimeFromUtc(NormalizeUtc(utc), LibraryTimeZone()).Date;

    /// <summary>
    /// UTC instant of 00:00 on the Vietnam calendar date that contains <paramref name="utc"/>.
    /// A due timestamp is overdue once it is strictly before this instant on a later library day.
    /// </summary>
    public static DateTime StartOfLibraryDateUtc(DateTime utc)
    {
        var localMidnight = DateTime.SpecifyKind(LibraryDate(utc), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(localMidnight, LibraryTimeZone());
    }

    public static DateTime StartOfLibraryDateUtc(DateOnly date)
    {
        var localMidnight = DateTime.SpecifyKind(date.ToDateTime(TimeOnly.MinValue), DateTimeKind.Unspecified);
        return TimeZoneInfo.ConvertTimeToUtc(localMidnight, LibraryTimeZone());
    }

    public static bool IsPastDueOnLibraryCalendar(DateTime? dueUtc, DateTime nowUtc)
        => CalendarOverdueDays(dueUtc, nowUtc) > 0;

    public static int CalendarOverdueDays(DateTime? dueUtc, DateTime returnedUtc)
    {
        if (!dueUtc.HasValue) return 0;
        var days = (LibraryDate(returnedUtc) - LibraryDate(dueUtc.Value)).Days;
        return days > 0 ? days : 0;
    }

    public static bool OccupiesCopy(BorrowStatus status)
        => status is BorrowStatus.Pending or BorrowStatus.Approved or BorrowStatus.Borrowed or BorrowStatus.Overdue;

    public static bool IsUnexpiredReadyHold(string? status, DateTime? expiresAt, DateTime nowUtc)
        => status == ReservationReady && (expiresAt == null || expiresAt >= nowUtc);

    public static decimal OverdueFineAmount(int overdueDays, int feePerDay)
    {
        if (overdueDays <= 0 || feePerDay <= 0) return 0;
        return overdueDays * feePerDay;
    }

    public static bool IsVietnamese(string? language)
    {
        if (string.IsNullOrWhiteSpace(language)) return true;
        var value = language.Trim().ToLowerInvariant();
        return value is "vi" or "vn" or "vie" or "vietnamese" or "tiếng việt" or "tieng viet";
    }

    public static bool IsTextbook(IEnumerable<string>? categoryNames)
    {
        if (categoryNames is null) return false;
        return categoryNames.Any(name =>
            name.Contains("giáo trình", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("giao trinh", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("textbook", StringComparison.OrdinalIgnoreCase));
    }

    public static int RenewalDays(CirculationSettings settings, string? language)
        => IsVietnamese(language) ? settings.RenewalDaysVi : settings.RenewalDaysForeign;

    public static int BorrowDays(CirculationSettings settings, string? language)
        => IsVietnamese(language) ? settings.BorrowDaysVi : settings.BorrowDaysForeign;

    public static int? MaxBooksFor(CirculationSettings settings, ReaderType? readerType)
        => readerType == ReaderType.Lecturer
            ? settings.MaxBooksLecturer ?? settings.MaxBooks
            : settings.MaxBooksStudent ?? settings.MaxBooks;

    public static int PickupHours(CirculationSettings settings)
        => settings.PickupDeadlineHours > 0
            ? settings.PickupDeadlineHours
            : settings.HoldHours is > 0 ? settings.HoldHours.Value : 24;

    public static IReadOnlyList<PickupSlotDto> PickupSlots(CirculationSettings settings, DateTimeOffset now)
    {
        var zone = LibraryTimeZone();
        var today = TimeZoneInfo.ConvertTime(now, zone).Date;
        var slotMinutes = Math.Max(1, settings.PickupSlotMinutes);
        var capacity = Math.Max(1, settings.PickupCapacityPerSlot);
        var slots = new List<DateTimeOffset>();

        for (var offset = 0; offset < Math.Max(1, settings.PickupDaysAhead); offset++)
        {
            var date = today.AddDays(offset);
            if (date.DayOfWeek == DayOfWeek.Sunday) continue;
            var start = date.AddHours(9);
            var end = date.AddHours(date.DayOfWeek == DayOfWeek.Saturday ? 15 : 17);
            for (var local = start; local.AddMinutes(slotMinutes) <= end; local = local.AddMinutes(slotMinutes))
            {
                var localTime = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);
                var pickupAt = new DateTimeOffset(localTime, zone.GetUtcOffset(localTime));
                if (pickupAt <= now) continue;
                slots.Add(pickupAt);
            }
        }

        return slots.Select(pickupAt => new PickupSlotDto(pickupAt, capacity, capacity)).ToList();
    }

    public static bool IsPickupSlot(CirculationSettings settings, DateTimeOffset pickupAt, DateTimeOffset now)
        => PickupSlots(settings, now).Any(slot => slot.PickupAt == pickupAt);

    public static bool IsOpenReservation(string? status)
        => status is ReservationPending or ReservationReady;

    public static bool InSelfRenewWindow(DateTime? dueUtc, DateTime nowUtc, CirculationSettings settings)
    {
        if (!dueUtc.HasValue) return false;
        var due = LibraryDate(dueUtc.Value);
        var today = LibraryDate(nowUtc);
        var start = due.AddDays(-Math.Max(0, settings.SelfRenewBeforeDays));
        var end = due.AddDays(Math.Max(0, settings.SelfRenewAfterDays));
        return today >= start && today <= end;
    }

    public static string? ValidateRenewal(
        CirculationSettings settings,
        int renewalCount,
        DateTime? dueUtc,
        DateTime nowUtc,
        bool byLibrarian,
        bool isOverdue,
        bool hasReservation,
        bool isTextbook)
    {
        if (settings.MaxRenewals is null)
            return "Chưa cấu hình chính sách gia hạn. Vào Quản trị > Chính sách để thiết lập số lần gia hạn.";
        if (renewalCount >= settings.MaxRenewals.Value)
            return $"Đã hết số lần gia hạn ({settings.MaxRenewals.Value}).";
        if (settings.BlockRenewIfOverdue && isOverdue)
            return "Không gia hạn khi sách đang quá hạn (theo chính sách).";
        if (settings.BlockRenewIfReserved && hasReservation)
            return "Không gia hạn vì đang có độc giả khác đặt trước (theo chính sách).";
        if (isTextbook && settings.TextbookRequiresApproval && !byLibrarian)
            return "Giáo trình theo học kỳ cần thủ thư phê duyệt gia hạn.";
        if (!byLibrarian && !InSelfRenewWindow(dueUtc, nowUtc, settings))
            return "Ngoài cửa sổ tự gia hạn (mặc định 1 ngày trước hạn đến 1 ngày sau hạn, có thể cấu hình).";
        return null;
    }

    public static string? ValidateBorrower(AccountStatus status, bool isActive, DateTime? membershipExpiresAt, DateTime nowUtc)
    {
        if (!isActive || status == AccountStatus.Suspended)
            return "Tài khoản đang bị đình chỉ hoặc khóa. Không tự mở khi chỉ thanh toán phí.";
        if (status != AccountStatus.Active)
            return "Thẻ độc giả chưa được kích hoạt.";
        if (membershipExpiresAt.HasValue && membershipExpiresAt.Value.Date < LibraryDate(nowUtc))
            return "Thẻ thành viên đã hết hạn.";
        return null;
    }

    public static bool IsCompensationReason(string? reason)
        => !string.IsNullOrWhiteSpace(reason)
           && (reason.StartsWith(CompensationLostPrefix, StringComparison.OrdinalIgnoreCase)
               || reason.StartsWith(CompensationDamagePrefix, StringComparison.OrdinalIgnoreCase));

    public static bool IsOverdueReason(string? reason)
        => !string.IsNullOrWhiteSpace(reason)
           && reason.StartsWith(OverdueReasonPrefix, StringComparison.OrdinalIgnoreCase);

    public static bool TryParseSeverity(string? value, out BookIncidentSeverity severity)
    {
        severity = BookIncidentSeverity.Unknown;
        if (string.IsNullOrWhiteSpace(value))
            return false;
        return Enum.TryParse(value, true, out severity) && severity != BookIncidentSeverity.Unknown;
    }

    public static string? ValidateIncidentConfirmation(
        BookIncidentKind kind,
        BookIncidentStatus status,
        BookIncidentSeverity severity,
        decimal? replacementValue,
        decimal? assessedFee)
    {
        if (status != BookIncidentStatus.PendingReview)
            return "Hồ sơ này không còn chờ xác nhận.";
        if (kind == BookIncidentKind.Lost && severity != BookIncidentSeverity.Lost)
            return "Hồ sơ thất lạc: xác nhận mất sách sau khi đối chiếu bản sao và phiếu mượn, hoặc từ chối nếu tìm thấy sách.";
        return severity switch
        {
            BookIncidentSeverity.Light when assessedFee is null or <= 0
                => "Hư hỏng nhẹ cần nhập mức phí theo mức độ. Không mặc định đền nguyên giá sách.",
            BookIncidentSeverity.Severe when replacementValue is null or <= 0
                => "Hư hỏng nặng không sửa được: nhập giá mua đền do thủ thư xác minh. Hệ thống không có giá sách mặc định.",
            BookIncidentSeverity.Lost when replacementValue is null or <= 0
                => "Mất sách: nhập giá trị tài liệu do thủ thư xác minh. Không tự lấy giá từ catalog.",
            BookIncidentSeverity.Unknown
                => "Chọn mức độ: hư hỏng nhẹ, hư hỏng nặng hoặc mất sách.",
            _ => null
        };
    }

    public static decimal CompensationAmount(BookIncidentSeverity severity, decimal? replacementValue, decimal? assessedFee)
        => decimal.Round(severity == BookIncidentSeverity.Light ? assessedFee ?? 0 : replacementValue ?? 0, 0);

    public static string CompensationReason(BookIncidentSeverity severity)
        => severity == BookIncidentSeverity.Lost ? CompensationLostPrefix : CompensationDamagePrefix;

    public static BookCondition CopyConditionAfterConfirm(BookIncidentSeverity severity)
        => severity == BookIncidentSeverity.Lost ? BookCondition.Lost : BookCondition.Damaged;

    public static bool CopyAvailableAfterConfirm(BookIncidentSeverity severity)
        => severity == BookIncidentSeverity.Light;

    private static DateTime NormalizeUtc(DateTime utc)
        => utc.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(utc, DateTimeKind.Utc)
            : utc.ToUniversalTime();

    private static TimeZoneInfo LibraryTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(
                OperatingSystem.IsWindows() ? "SE Asia Standard Time" : "Asia/Ho_Chi_Minh");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.Utc;
        }
    }

    public static BookIncident CreatePendingIncident(
        Guid loanId, Guid copyId, Guid readerId, BookCondition condition, Guid reportedBy)
    {
        var lost = condition == BookCondition.Lost;
        return new BookIncident
        {
            BorrowRecordId = loanId,
            BookCopyId = copyId,
            ReaderId = readerId,
            Kind = lost ? BookIncidentKind.Lost : BookIncidentKind.Damage,
            Severity = lost ? BookIncidentSeverity.Lost : BookIncidentSeverity.Unknown,
            Status = BookIncidentStatus.PendingReview,
            Description = lost ? LostNote : DamagedNote,
            ReportedBy = reportedBy == Guid.Empty ? null : reportedBy
        };
    }
}
