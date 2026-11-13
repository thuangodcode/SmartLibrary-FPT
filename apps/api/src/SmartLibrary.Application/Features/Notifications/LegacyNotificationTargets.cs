using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Interfaces;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.Application.Features.Notifications;

// Older circulation notifications did not persist their target ID. Reconstruct
// only unambiguous links from the recipient's own records; never select the
// latest loan merely because its title happens to match.
internal static class LegacyNotificationTargets
{
    public static async Task FillAsync(IUnitOfWork uow, Guid userId,
        IReadOnlyList<Notification> rows, IReadOnlyList<InboxNotificationDto> items, CancellationToken ct)
    {
        var missing = rows.Zip(items).Where(pair => pair.Second.Href is null &&
            pair.First.Type is "borrow" or "return" or "renewal" or "due_soon" or "overdue"
                or "fine" or "fine_paid" or "fine_payment_reconciliation" or "reservation").ToList();
        if (missing.Count == 0) return;
        // One batch per entity kind, independent of inbox page size.
        var loans = await uow.Repository<BorrowRecord>().Query().AsNoTracking()
            .Where(x => x.ReaderId == userId)
            .Include(x => x.BookCopy).ThenInclude(x => x.Book).ToListAsync(ct);
        var fines = await uow.Repository<Fine>().Query().AsNoTracking()
            .Where(x => x.ReaderId == userId).ToListAsync(ct);
        var reservations = await uow.Repository<Reservation>().Query().AsNoTracking()
            .Where(x => x.ReaderId == userId).Include(x => x.Book).ToListAsync(ct);
        var incidents = await uow.Repository<BookIncident>().Query().AsNoTracking()
            .Where(x => x.ReaderId == userId).ToListAsync(ct);
        foreach (var (notice, item) in missing)
        {
            var time = notice.CreatedAt;
            // All these event timestamps and the notification were written in
            // the same operation. Allow a small save-time skew, not a day-wide guess.
            bool At(DateTime? value) => value.HasValue && Math.Abs((value.Value - time).TotalSeconds) <= 5;
            bool Mentions(BorrowRecord loan) =>
                Regex.IsMatch(notice.Message, $@"(?<![\p{{L}}\p{{N}}-]){Regex.Escape(loan.BookCopy.Barcode)}(?![\p{{L}}\p{{N}}-])", RegexOptions.IgnoreCase)
                || notice.Message.Contains(loan.BookCopyId.ToString(), StringComparison.OrdinalIgnoreCase)
                || notice.Message.Contains($"“{loan.BookCopy.Book.Title}”", StringComparison.Ordinal);
            Guid? Unique(IEnumerable<Guid> ids)
            {
                var matches = ids.Distinct().Take(2).ToList();
                return matches.Count == 1 ? matches[0] : null;
            }
            Guid? loanId = null;
            if (notice.Type == "reservation")
            {
                Guid? bookId = null;
                if (notice.Title == "Đã đặt trước")
                {
                    var created = reservations.Where(x => At(x.ReservedAt)).ToList();
                    var named = created.Where(x => notice.Message.Contains($"“{x.Book.Title}”", StringComparison.Ordinal)).ToList();
                    bookId = Unique((named.Count > 0 ? named : created).Select(x => x.BookId));
                }
                // Ready/expired events may have no event timestamp left after
                // subsequent updates. Require an exact quoted title and one
                // owned book, even if that book has several reservations.
                bookId ??= Unique(reservations.Where(x => x.ReservedAt <= time.AddSeconds(5)
                    && notice.Message.Contains($"“{x.Book.Title}”", StringComparison.Ordinal)).Select(x => x.BookId));
                if (bookId.HasValue) item.Href = $"/books/{bookId:D}";
            }
            else if (notice.Type is "fine" or "fine_paid" or "fine_payment_reconciliation")
            {
                // An incident report is not a fine yet, despite its old 'fine' type.
                if (notice.Title == "Hồ sơ mất/hỏng sách")
                    loanId = Unique(incidents.Where(x => At(x.CreatedAt)).Select(x => x.BorrowRecordId));
                else
                {
                    var fineId = Unique(fines.Where(x => notice.Type == "fine_paid" ? At(x.PaidAt) : At(x.CreatedAt)).Select(x => x.Id));
                    if (fineId.HasValue) item.Href = $"/history?tab=fines&fineId={fineId:D}";
                }
            }
            else
            {
                // Prefer the event's own timestamp, so historical title changes
                // and repeated borrowing of the same copy do not misroute it.
                DateTime? EventAt(BorrowRecord loan) => notice.Type switch
                {
                    "return" => loan.ReturnDate,
                    "borrow" => notice.Title switch
                    {
                        "Yêu cầu mượn đã được tiếp nhận" => loan.AcceptedAt,
                        "Đã hoàn tất mượn sách" or "Đã mượn sách" => loan.BorrowDate,
                        "Đã gửi yêu cầu mượn" => loan.CreatedAt,
                        "Yêu cầu mượn bị từ chối" or "Yêu cầu mượn đã hết hạn" => loan.UpdatedAt,
                        _ => null
                    },
                    _ => loan.UpdatedAt
                };
                var candidates = loans.Where(x => At(EventAt(x))).ToList();
                var mentioned = candidates.Where(Mentions).ToList();
                // A rejected validation can have no request at all. Its timestamp
                // alone must never attach it to another request being processed.
                var requiresIdentity = notice.Type == "borrow" && notice.Title == "Yêu cầu mượn bị từ chối";
                loanId = Unique((mentioned.Count > 0 || requiresIdentity ? mentioned : candidates).Select(x => x.Id));
                if (!loanId.HasValue && notice.Type is "renewal" or "due_soon" or "overdue")
                    loanId = Unique(loans.Where(x => Mentions(x) && x.BorrowDate <= time.AddSeconds(5)
                        && (!x.ReturnDate.HasValue || x.ReturnDate >= time)).Select(x => x.Id));
            }
            if (loanId.HasValue) item.Href = $"/history?tab=loans&loanId={loanId:D}";
        }
    }
}
