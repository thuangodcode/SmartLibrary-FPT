using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Notifications;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    [BookCodePostgresFact]
    public async Task LegacyInboxResolvesEveryLoanEventAndReservationAndFineForItsOwner()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.Include(x => x.BookCopy).ThenInclude(x => x.Book).SingleAsync();
        var time = DateTime.UtcNow.AddDays(-2);
        var previous = new BorrowRecord { ReaderId = loan.ReaderId, BookCopyId = loan.BookCopyId };
        var fine = new Fine { ReaderId = loan.ReaderId, BorrowRecordId = loan.Id, Amount = 20000 };
        db.AddRange(previous, fine);
        var samples = new[] {
            new Notification { Type = "borrow", Title = "Đã gửi yêu cầu mượn", Message = "Bản sao TEST001-01 đang được giữ cho bạn." },
            new Notification { Type = "borrow", Title = "Yêu cầu mượn đã được tiếp nhận", Message = "Tiếp nhận “Sách kiểm thử”." },
            new Notification { Type = "borrow", Title = "Đã hoàn tất mượn sách", Message = $"Bản sao: {loan.BookCopyId} · TEST001-01." },
            new Notification { Type = "borrow", Title = "Yêu cầu mượn bị từ chối", Message = "Từ chối “Sách kiểm thử”." },
            new Notification { Type = "return", Title = "Đã trả sách", Message = "Đã trả “Tên cũ trước khi đổi tên”." },
            new Notification { Type = "renewal", Title = "Đã gia hạn sách", Message = "“Sách kiểm thử” được gia hạn." },
            new Notification { Type = "due_soon", Message = "“Sách kiểm thử” sắp đến hạn." },
            new Notification { Type = "overdue", Message = "“Sách kiểm thử” đã quá hạn." },
            new Notification { Type = "reservation", Title = "Đã đặt trước", Message = "“Tên cũ”" },
            new Notification { Type = "reservation", Title = "Sách sẵn sàng nhận", Message = "“Sách kiểm thử” đã sẵn sàng." },
            new Notification { Type = "fine", Title = "Khoản phí mới" },
            new Notification { Type = "fine_paid", Title = "Đã thanh toán khoản phí" },
            new Notification { Type = "fine", Title = "Hồ sơ mất/hỏng sách" },
            new Notification { Type = "borrow", Title = "Yêu cầu mượn bị từ chối", Message = "Đã đạt hạn mức mượn." }
        };
        foreach (var n in samples) { n.UserId = loan.ReaderId; n.Metadata = "{\"href\":\"/history?tab=loans\",\"entityId\":null}"; db.Add(n); }
        await db.SaveChangesAsync();
        await db.BorrowRecords.Where(x => x.Id == loan.Id).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.CreatedAt, time).SetProperty(x => x.UpdatedAt, time)
            .SetProperty(x => x.AcceptedAt, time).SetProperty(x => x.BorrowDate, time).SetProperty(x => x.ReturnDate, time));
        await db.BorrowRecords.Where(x => x.Id == previous.Id).ExecuteUpdateAsync(s => s
            .SetProperty(x => x.CreatedAt, time.AddDays(-10)).SetProperty(x => x.UpdatedAt, time.AddDays(-10)));
        await db.Fines.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time).SetProperty(x => x.PaidAt, time));
        await db.BookIncidents.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time));
        await db.Reservations.ExecuteUpdateAsync(s => s.SetProperty(x => x.ReservedAt, time));
        await db.Notifications.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time));
        db.ChangeTracker.Clear();
        var inbox = new NotificationInbox(new UnitOfWork(db));
        var page = await inbox.ListMineAsync(loan.ReaderId, 1, 50);
        for (var i = 0; i < samples.Length; i++)
        {
            var expected = i < 8 || i == 12 ? $"/history?tab=loans&loanId={loan.Id}" :
                i < 10 ? $"/books/{loan.BookCopy.BookId}" : i < 12 ? $"/history?tab=fines&fineId={fine.Id}" : null;
            Assert.Equal(expected, page.Items.Single(x => x.Id == samples[i].Id).Href);
        }
        Assert.Empty((await inbox.ListMineAsync(fixture.StaffId, 1, 50)).Items);
        // The non-paged inbox uses exactly the same resolver.
        Assert.Equal(page.Items.Count, (await inbox.ListMineAsync(loan.ReaderId)).Count);
    }

    [BookCodePostgresFact]
    public async Task AmbiguousLegacyNotificationDoesNotGuessOrLeakAnotherReadersLoan()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var loan = await db.BorrowRecords.SingleAsync();
        var first = new Fine { ReaderId = loan.ReaderId, BorrowRecordId = loan.Id, Amount = 20000 };
        var second = new Fine { ReaderId = loan.ReaderId, BorrowRecordId = loan.Id, Amount = 100000 };
        var ambiguous = new Notification { UserId = loan.ReaderId, Type = "fine", Title = "Khoản phí mới" };
        var otherReader = new Notification { UserId = fixture.StaffId, Type = "return", Title = "Đã trả sách", Message = "“Sách kiểm thử”" };
        db.AddRange(first, second, ambiguous, otherReader);
        await db.SaveChangesAsync();
        var time = DateTime.UtcNow;
        await db.Fines.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time));
        await db.Notifications.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time));
        await db.BorrowRecords.ExecuteUpdateAsync(s => s.SetProperty(x => x.ReturnDate, time));
        db.ChangeTracker.Clear();
        var inbox = new NotificationInbox(new UnitOfWork(db));
        Assert.Null((await inbox.ListMineAsync(loan.ReaderId, 1, 50)).Items.Single().Href);
        Assert.Null((await inbox.ListMineAsync(fixture.StaffId, 1, 50)).Items.Single().Href);
    }
    [BookCodePostgresFact]
    public async Task LegacyReadyNoticeDoesNotUseAnotherBooksNewReservationTimestamp()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var reservation = await db.Reservations.Include(x => x.Book).SingleAsync();
        var otherBook = new Book { Code = "OTHER001", Title = "Cuốn khác" };
        var other = new Reservation { ReaderId = reservation.ReaderId, Book = otherBook };
        var notice = new Notification { UserId = reservation.ReaderId, Type = "reservation", Title = "Sách sẵn sàng nhận", Message = "“Sách kiểm thử” đã sẵn sàng." };
        db.AddRange(other, notice);
        await db.SaveChangesAsync();
        var time = DateTime.UtcNow;
        await db.Reservations.Where(x => x.Id == reservation.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReservedAt, time.AddDays(-5)));
        await db.Reservations.Where(x => x.Id == other.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.ReservedAt, time));
        await db.Notifications.ExecuteUpdateAsync(s => s.SetProperty(x => x.CreatedAt, time));
        db.ChangeTracker.Clear();
        var inbox = new NotificationInbox(new UnitOfWork(db));
        Assert.Equal($"/books/{reservation.BookId}", (await inbox.ListMineAsync(reservation.ReaderId)).Single().Href);
        // Two different books sharing a title cannot be disambiguated by name.
        await db.Books.Where(x => x.Id == otherBook.Id).ExecuteUpdateAsync(s => s.SetProperty(x => x.Title, "Sách kiểm thử"));
        Assert.Null((await inbox.ListMineAsync(reservation.ReaderId)).Single().Href);
    }

}
