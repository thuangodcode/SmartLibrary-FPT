using FluentAssertions;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Application.Features.Circulation.DTOs;
using SmartLibrary.Domain.Enums;

namespace SmartLibrary.UnitTests.Features.Circulation;

public class CirculationRulesTests
{
    [Fact]
    public void CalendarOverdueDays_OnTimeOrEarly_IsZero()
    {
        var due = new DateTime(2026, 10, 22, 10, 0, 0, DateTimeKind.Utc);
        CirculationRules.CalendarOverdueDays(due, due).Should().Be(0);
        CirculationRules.CalendarOverdueDays(due, due.AddHours(-5)).Should().Be(0);
    }

    [Fact]
    public void CalendarOverdueDays_UsesLibraryCalendarDate()
    {
        var due = new DateTime(2026, 10, 20, 0, 0, 0, DateTimeKind.Utc);
        var returned = new DateTime(2026, 10, 22, 0, 0, 0, DateTimeKind.Utc);
        CirculationRules.CalendarOverdueDays(due, returned).Should().Be(2);
    }

    [Fact]
    public void CalendarOverdueDays_ReturnOnDueDate_IsZero()
    {
        var due = new DateTime(2026, 10, 21, 17, 0, 0, DateTimeKind.Utc); // 22/10 00:00 VN
        var returnedSameDay = new DateTime(2026, 10, 22, 16, 59, 0, DateTimeKind.Utc); // 22/10 23:59 VN
        CirculationRules.CalendarOverdueDays(due, returnedSameDay).Should().Be(0);
        CirculationRules.IsPastDueOnLibraryCalendar(due, returnedSameDay).Should().BeFalse();
    }

    [Fact]
    public void CalendarOverdueDays_NextLibraryDay_IsOne()
    {
        var due = new DateTime(2026, 10, 21, 17, 0, 0, DateTimeKind.Utc); // 22/10 00:00 VN
        var nextMidnight = new DateTime(2026, 10, 22, 17, 0, 0, DateTimeKind.Utc); // 23/10 00:00 VN
        CirculationRules.CalendarOverdueDays(due, nextMidnight).Should().Be(1);
        CirculationRules.IsPastDueOnLibraryCalendar(due, nextMidnight).Should().BeTrue();
    }

    [Fact]
    public void CalendarOverdueDays_VietnamMidnightBoundary()
    {
        var dueEndOfVnDay = new DateTime(2026, 10, 21, 16, 59, 59, DateTimeKind.Utc); // 21/10 23:59:59 VN
        var justAfterMidnight = new DateTime(2026, 10, 21, 17, 0, 0, DateTimeKind.Utc); // 22/10 00:00 VN
        CirculationRules.CalendarOverdueDays(dueEndOfVnDay, justAfterMidnight).Should().Be(1);
        CirculationRules.IsPastDueOnLibraryCalendar(dueEndOfVnDay, dueEndOfVnDay).Should().BeFalse();
    }

    [Fact]
    public void StartOfLibraryDateUtc_MatchesVietnamMidnight()
    {
        var duringVnMorning = new DateTime(2026, 10, 21, 17, 30, 0, DateTimeKind.Utc); // 22/10 00:30 VN
        CirculationRules.StartOfLibraryDateUtc(duringVnMorning)
            .Should().Be(new DateTime(2026, 10, 21, 17, 0, 0, DateTimeKind.Utc));
        var dueSameVnDay = new DateTime(2026, 10, 22, 10, 0, 0, DateTimeKind.Utc);
        (dueSameVnDay < CirculationRules.StartOfLibraryDateUtc(duringVnMorning)).Should().BeFalse();
        CirculationRules.IsPastDueOnLibraryCalendar(dueSameVnDay, duringVnMorning).Should().BeFalse();
    }

    [Fact]
    public void StartOfLibraryDateUtc_ForSelectedDateUsesVietnamMidnight()
    {
        CirculationRules.StartOfLibraryDateUtc(new DateOnly(2026, 10, 24))
            .Should().Be(new DateTime(2026, 10, 23, 17, 0, 0, DateTimeKind.Utc));
    }

    [Fact]
    public void OccupiesCopy_ExcludesPendingRequests()
    {
        CirculationRules.OccupiesCopy(BorrowStatus.Pending).Should().BeTrue();
        CirculationRules.OccupiesCopy(BorrowStatus.Rejected).Should().BeFalse();
        CirculationRules.OccupiesCopy(BorrowStatus.Returned).Should().BeFalse();
        CirculationRules.OccupiesCopy(BorrowStatus.Borrowed).Should().BeTrue();
        CirculationRules.OccupiesCopy(BorrowStatus.Overdue).Should().BeTrue();
        CirculationRules.OccupiesCopy(BorrowStatus.Approved).Should().BeTrue();
    }

    [Fact]
    public void PickupSlots_UsesLibraryHoursAndExcludesSunday()
    {
        var slots = CirculationRules.PickupSlots(
            new CirculationSettings { PickupSlotMinutes = 30, PickupDaysAhead = 14, PickupCapacityPerSlot = 3 },
            DateTimeOffset.UtcNow);
        var localSlots = slots.Select(slot => TimeZoneInfo.ConvertTime(slot.PickupAt, TimeZoneInfo.FindSystemTimeZoneById("SE Asia Standard Time")))
            .ToList();

        localSlots.Should().NotBeEmpty();
        localSlots.Should().OnlyContain(slot => slot.DayOfWeek != DayOfWeek.Sunday);
        localSlots.Should().OnlyContain(slot => (slot.Minute == 0 || slot.Minute == 30) && slot.Second == 0);
        localSlots.Where(slot => slot.DayOfWeek == DayOfWeek.Saturday)
            .Should().OnlyContain(slot => slot.Hour >= 9 && (slot.Hour < 15));
        localSlots.Where(slot => slot.DayOfWeek is not DayOfWeek.Saturday)
            .Should().OnlyContain(slot => slot.Hour >= 9 && slot.Hour < 17);
        slots.Should().OnlyContain(slot => slot.Capacity == 3 && slot.RemainingCapacity == 3);
    }

    [Fact]
    public void IsUnexpiredReadyHold_IgnoresExpiredPickupWindow()
    {
        var now = new DateTime(2026, 10, 22, 10, 0, 0, DateTimeKind.Utc);
        CirculationRules.IsUnexpiredReadyHold("ready", now.AddMinutes(-1), now).Should().BeFalse();
        CirculationRules.IsUnexpiredReadyHold("ready", now.AddMinutes(1), now).Should().BeTrue();
        CirculationRules.IsUnexpiredReadyHold("pending", now.AddMinutes(1), now).Should().BeFalse();
    }

    [Fact]
    public void OverdueFineAmount_RequiresPositiveDaysAndRate()
    {
        CirculationRules.OverdueFineAmount(0, 5000).Should().Be(0);
        CirculationRules.OverdueFineAmount(3, 0).Should().Be(0);
        CirculationRules.OverdueFineAmount(3, 5000).Should().Be(15000);
    }

    [Fact]
    public void ValidateBorrower_BlocksSuspendedAndExpired()
    {
        CirculationRules.ValidateBorrower(AccountStatus.Suspended, true, null, DateTime.UtcNow)
            .Should().NotBeNull();
        CirculationRules.ValidateBorrower(AccountStatus.Active, true, DateTime.UtcNow.AddDays(-2), DateTime.UtcNow)
            .Should().NotBeNull();
        CirculationRules.ValidateBorrower(AccountStatus.Active, true, DateTime.UtcNow.AddDays(10), DateTime.UtcNow)
            .Should().BeNull();
    }

    [Fact]
    public void ValidateRenewal_RespectsMaxCountAndWindow()
    {
        var settings = new CirculationSettings
        {
            MaxRenewals = 4,
            BlockRenewIfOverdue = true,
            BlockRenewIfReserved = false,
            SelfRenewBeforeDays = 1,
            SelfRenewAfterDays = 1,
            TextbookRequiresApproval = true
        };
        var due = DateTime.UtcNow.AddDays(3);
        CirculationRules.ValidateRenewal(settings, 4, due, DateTime.UtcNow, true, false, false, false)
            .Should().Contain("hết số lần");
        CirculationRules.ValidateRenewal(settings, 0, due, DateTime.UtcNow, false, false, false, false)
            .Should().Contain("cửa sổ");
        CirculationRules.ValidateRenewal(settings, 0, DateTime.UtcNow.AddHours(12), DateTime.UtcNow, false, false, false, false)
            .Should().BeNull();
        CirculationRules.ValidateRenewal(settings, 0, DateTime.UtcNow, DateTime.UtcNow, true, true, false, false)
            .Should().Contain("quá hạn");
        CirculationRules.ValidateRenewal(settings, 0, DateTime.UtcNow, DateTime.UtcNow, false, false, false, true)
            .Should().Contain("Giáo trình");
        CirculationRules.ValidateRenewal(settings, 0, DateTime.UtcNow, DateTime.UtcNow, true, false, false, true)
            .Should().BeNull();
    }

    [Fact]
    public void ValidateRenewal_DoesNotBlockReservationUnlessConfigured()
    {
        var settings = new CirculationSettings { MaxRenewals = 4, BlockRenewIfReserved = false };
        CirculationRules.ValidateRenewal(settings, 0, DateTime.UtcNow, DateTime.UtcNow, true, false, true, false)
            .Should().BeNull();
        var blocked = settings with { BlockRenewIfReserved = true };
        CirculationRules.ValidateRenewal(blocked, 0, DateTime.UtcNow, DateTime.UtcNow, true, false, true, false)
            .Should().Contain("đặt trước");
    }

    [Fact]
    public void ValidateRenewal_BlocksReaderWithUnpaidFineOnlyWhenPolicyRequiresIt()
    {
        var settings = new CirculationSettings
        {
            MaxRenewals = 4,
            RestrictIfUnpaid = true,
            SelfRenewBeforeDays = 1,
            SelfRenewAfterDays = 1
        };
        var due = DateTime.UtcNow.AddHours(12);

        CirculationRules.ValidateRenewal(settings, 0, due, DateTime.UtcNow, false, false, false, false, true)
            .Should().Contain("phí chưa thanh toán");
        CirculationRules.ValidateRenewal(settings with { RestrictIfUnpaid = false },
                0, due, DateTime.UtcNow, false, false, false, false, true)
            .Should().BeNull();
        CirculationRules.ValidateRenewal(settings, 0, due, DateTime.UtcNow, true, false, false, false, true)
            .Should().BeNull();
    }

    [Fact]
    public void ValidateRenewal_AppliesReaderSpecificLimitOverdueReservationAndTextbookRules()
    {
        var due = DateTime.UtcNow;
        var settings = new CirculationSettings
        {
            MaxRenewals = 2,
            BlockRenewIfOverdue = true,
            BlockRenewIfReserved = true,
            SelfRenewBeforeDays = 1,
            SelfRenewAfterDays = 1,
            TextbookRequiresApproval = true
        };

        CirculationRules.ValidateRenewal(settings, 2, due, due, false, false, false, false)
            .Should().Contain("hết số lần");
        CirculationRules.ValidateRenewal(settings, 0, due, due.AddDays(1), false, true, false, false)
            .Should().Contain("quá hạn");
        CirculationRules.ValidateRenewal(settings, 0, due, due, false, false, true, false)
            .Should().Contain("đặt trước");
        CirculationRules.ValidateRenewal(settings, 0, due, due, false, false, false, true)
            .Should().Contain("Giáo trình");
    }

    [Fact]
    public void MaxBooksFor_UsesGroupThenFallback()
    {
        var settings = new CirculationSettings { MaxBooks = 5, MaxBooksStudent = 10, MaxBooksLecturer = 20 };
        CirculationRules.MaxBooksFor(settings, ReaderType.Student).Should().Be(10);
        CirculationRules.MaxBooksFor(settings, ReaderType.Lecturer).Should().Be(20);
        CirculationRules.MaxBooksFor(settings, ReaderType.External).Should().Be(10);
        CirculationRules.MaxBooksFor(new CirculationSettings { MaxBooks = 5 }, ReaderType.Lecturer).Should().Be(5);
    }

    [Fact]
    public void BorrowDays_UsesLanguageSpecificPolicy()
    {
        var settings = new CirculationSettings { BorrowDays = 14, BorrowDaysVi = 7, BorrowDaysForeign = 14 };
        CirculationRules.BorrowDays(settings, "vi").Should().Be(7);
        CirculationRules.BorrowDays(settings, "en").Should().Be(14);
    }

    [Fact]
    public void IsTextbook_DetectsVietnameseCategory()
    {
        CirculationRules.IsTextbook(["Công nghệ", "Giáo trình kỳ 1"]).Should().BeTrue();
        CirculationRules.IsTextbook(["Tiểu thuyết"]).Should().BeFalse();
    }

    [Fact]
    public void ValidateIncidentConfirmation_LostNeedsVerifiedValue()
    {
        CirculationRules.ValidateIncidentConfirmation(
            BookIncidentKind.Lost, BookIncidentStatus.PendingReview, BookIncidentSeverity.Lost, null, null)
            .Should().Contain("giá trị tài liệu");
        CirculationRules.ValidateIncidentConfirmation(
            BookIncidentKind.Lost, BookIncidentStatus.PendingReview, BookIncidentSeverity.Light, 200000, 10000)
            .Should().Contain("thất lạc");
        CirculationRules.ValidateIncidentConfirmation(
            BookIncidentKind.Lost, BookIncidentStatus.PendingReview, BookIncidentSeverity.Lost, 200000, null)
            .Should().BeNull();
    }

    [Fact]
    public void ValidateIncidentConfirmation_LightDamageIsNotFullReplacement()
    {
        CirculationRules.ValidateIncidentConfirmation(
            BookIncidentKind.Damage, BookIncidentStatus.PendingReview, BookIncidentSeverity.Light, 200000, null)
            .Should().Contain("mức phí theo mức độ");
        CirculationRules.ValidateIncidentConfirmation(
            BookIncidentKind.Damage, BookIncidentStatus.PendingReview, BookIncidentSeverity.Light, null, 30000)
            .Should().BeNull();
        CirculationRules.CompensationAmount(BookIncidentSeverity.Light, 200000, 30000).Should().Be(30000);
        CirculationRules.CompensationAmount(BookIncidentSeverity.Lost, 200000, 30000).Should().Be(200000);
    }
}
