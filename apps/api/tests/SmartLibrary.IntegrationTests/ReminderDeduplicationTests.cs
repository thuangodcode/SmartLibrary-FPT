using System.Reflection;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Api.HostedServices;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task RemindersStayUniqueAcrossWorkerRunsAndPostgresJsonbRoundTrips()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using (var setup = fixture.Context())
        {
            await PrepareReminderLoanAsync(setup);
            await RunReminderTickAsync(setup);
        }
        // A fresh context reads PostgreSQL's reordered/formatted jsonb, not tracked strings.
        await using var restarted = fixture.Context();
        await RunReminderTickAsync(restarted);
        await RunReminderTickAsync(restarted);
        Assert.Single(await restarted.Notifications.Where(item => item.Type == "due_soon").ToListAsync());
        Assert.Single(await restarted.Notifications.Where(item => item.Type == "membership_expiring").ToListAsync());
    }

    [BookCodePostgresFact]
    public async Task RemindersRecognizeEquivalentLegacyMetadataAndIgnoreUnexpectedShapes()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using (var setup = fixture.Context())
        {
            var loan = await PrepareReminderLoanAsync(setup);
            await setup.Entry(loan.Reader).ReloadAsync();
            setup.AddRange(
                new Notification { UserId = loan.ReaderId, Type = "due_soon", Title = "Legacy loan",
                    Metadata = $"{{ \"entityId\": \"{loan.Id.ToString().ToUpperInvariant()}\", \"href\": \"/history?tab=loans\" }}" },
                new Notification { UserId = loan.ReaderId, Type = "membership_expiring", Title = "Legacy card",
                    Metadata = JsonSerializer.Serialize(new { expiresAt = new DateTimeOffset(loan.Reader.MembershipExpiresAt!.Value).ToOffset(TimeSpan.FromHours(7)), href = "/profile" }) },
                new Notification { UserId = loan.ReaderId, Type = "due_soon", Title = "Old array", Metadata = "[]" },
                new Notification { UserId = loan.ReaderId, Type = "due_soon", Title = "Old number", Metadata = "{\"entityId\":42}" });
            await setup.SaveChangesAsync();
        }
        await using var db = fixture.Context();
        await RunReminderTickAsync(db);
        Assert.Equal(4, await db.Notifications.CountAsync());
    }

    static async Task<BorrowRecord> PrepareReminderLoanAsync(AppDbContext db)
    {
        var loan = await db.BorrowRecords.Include(item => item.Reader).Include(item => item.BookCopy).SingleAsync();
        loan.Status = BorrowStatus.Borrowed;
        loan.DueDate = DateTime.UtcNow.AddHours(12);
        loan.ReturnDate = null; loan.ReturnCondition = null;
        loan.BookCopy.Condition = BookCondition.Good;
        loan.Reader.MembershipExpiresAt = DateTime.UtcNow.AddDays(2);
        await db.SaveChangesAsync();
        return loan;
    }

    static Task RunReminderTickAsync(AppDbContext db) => (Task)typeof(BorrowPickupExpirationWorker)
        .GetMethod("CreateRemindersAsync", BindingFlags.Static | BindingFlags.NonPublic)!
        .Invoke(null, [db, CancellationToken.None])!;
}
