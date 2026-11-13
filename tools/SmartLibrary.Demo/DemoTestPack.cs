using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Repositories;

// Invoked only after Program.cs has enforced the fixed loopback smartlibrary_demo target.
// Append missing cases; never reset a case after the user starts exercising it.
internal static class DemoTestPack
{
    const string Marker = "[LAB-LOCAL]";
    const string Shelf = "Tầng 8 · Kệ LABA";
    const string FullShelf = "Tầng 8 · Kệ LABFULL";
    const string EmptyShelf = "Tầng 8 · Kệ LABEMPTY";
    const string SwapShelf = "Tầng 8 · Kệ LABSWAP";

    public static async Task PrepareAsync(AppDbContext db)
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var now = DateTime.UtcNow;
        var settings = await new CirculationRepository(db).GetSettingsAsync(default);
        var longReader = await LongAsync(db);
        var staff = await db.UserProfiles.Include(item => item.Role)
            .Where(item => item.Role.Name == "Librarian").OrderBy(item => item.CreatedAt).FirstAsync();
        var readerRole = await db.Set<Role>().SingleAsync(item => item.Name == "Reader");
        var profiles = await db.UserProfiles.IgnoreQueryFilters().ToListAsync();
        UserProfile Reader(string key, string label, AccountStatus status = AccountStatus.Active, bool expired = false)
        {
            var email = $"lab.{key.ToLowerInvariant()}@example.test";
            var found = profiles.SingleOrDefault(item => item.Email == email);
            if (found is not null) return found;
            var reader = new UserProfile
            {
                Email = email, FullName = $"[LAB] {label}", StudentId = key, RoleId = readerRole.Id,
                ReaderType = ReaderType.Student, Status = status, IsActive = true,
                MembershipExpiresAt = now.AddDays(expired ? -2 : 365),
                StatusReason = $"{Marker} Hồ sơ giả lập local; không có tài khoản Supabase Auth riêng."
            };
            db.Add(reader); profiles.Add(reader); return reader;
        }
        var clean = Reader("LABR001", "Độc giả thao tác tại quầy");
        var overdueReader = Reader("LABR002", "Độc giả đang quá hạn");
        var debtReader = Reader("LABR003", "Độc giả có hồ sơ và phí");
        var queueReader = Reader("LABR004", "Độc giả trong hàng đợi");
        var nextReader = Reader("LABR005", "Độc giả tiếp theo");
        Reader("LABR006", "Thẻ đã hết hạn", expired: true);
        Reader("LABR007", "Tài khoản đình chỉ", AccountStatus.Suspended);
        Reader("LABR008", "Thẻ chưa kích hoạt", AccountStatus.PendingVerification);
        var limitedReader = Reader("LABR009", "Độc giả đủ hạn mức");

        async Task<Category> CategoryAsync(string code, string name)
        {
            var found = await db.Categories.IgnoreQueryFilters().SingleOrDefaultAsync(item => item.Code == code);
            if (found is not null)
            {
                if (found.IsDeleted || found.Name != name) throw new InvalidOperationException($"Mã danh mục {code} đã được dùng ngoài bộ LAB; không ghi đè.");
                return found;
            }
            var category = new Category { Code = code, Name = name }; db.Add(category); return category;
        }
        var category = await CategoryAsync("LAB", "Thực hành luồng đầy đủ (LAB local)");
        var gapCategory = await CategoryAsync("GAP", "Thực hành cấp mã còn thiếu (GAP local)");
        var shelfNames = (await db.StorageShelves.IgnoreQueryFilters().ToListAsync()).Select(item => item.Name).ToHashSet();
        foreach (var (name, capacity) in new[] { (Shelf, 30), (FullShelf, 1), (EmptyShelf, 3), (SwapShelf, 1) })
            if (!shelfNames.Contains(name)) db.Add(new StorageShelf { Name = name, Capacity = capacity });
        var existing = await db.Books.IgnoreQueryFilters().Where(item => item.Code.StartsWith("LAB") || item.Code.StartsWith("GAP")).ToListAsync();
        var reservedCodes = Enumerable.Range(1, 37).Concat(Enumerable.Range(101, 30))
            .Select(number => $"LAB{number:D3}").Append("GAP001").Append("GAP003").ToHashSet();
        if (existing.Any(item => reservedCodes.Contains(item.Code) && item.Description?.StartsWith(Marker) != true))
            throw new InvalidOperationException("Có mã dành cho ca LAB/GAP bị dùng ngoài bộ test; không nhận làm dữ liệu mẫu.");
        var codes = existing.Select(item => item.Code).ToHashSet();
        var newBooks = new List<Book>();
        BookCopy? Copy(int number, string purpose, BookCondition condition = BookCondition.Good,
            string? location = null, bool available = true, string prefix = "LAB")
        {
            var code = $"{prefix}{number:D3}";
            if (!codes.Add(code)) return null;
            var owner = prefix == "GAP" ? gapCategory : category;
            var book = new Book
            {
                Code = code, CodeCategoryId = owner.Id, Categories = [owner],
                Title = $"[{prefix}] Sách thực hành {number:D2}", Description = $"{Marker} Ca ban đầu: {purpose}. Trạng thái hiện tại đọc trên phiếu/bản sao.",
                Language = "vi", PublishedYear = 2025, TotalCopies = 1,
                AvailableCopies = available && location is not null ? 1 : 0
            };
            var copy = new BookCopy { Book = book, BookId = book.Id, Barcode = $"{code}-01", Condition = condition, IsAvailable = available, Location = location };
            db.Add(copy); newBooks.Add(book); return copy;
        }
        var slots = CirculationRules.PickupSlots(settings, DateTimeOffset.UtcNow);
        if (slots.Count == 0) throw new InvalidOperationException("Không có khung giờ nhận hợp lệ; kiểm tra policy trước khi seed.");
        // Prefer tomorrow, so prepared pending/approved cases survive the user's first test session.
        var pickup = slots.FirstOrDefault(item => CirculationRules.LibraryDate(item.PickupAt.UtcDateTime) > CirculationRules.LibraryDate(now))?.PickupAt.UtcDateTime
            ?? slots.Last().PickupAt.UtcDateTime;
        var oldLongActive = await new CirculationRepository(db).CountActiveLoansAsync(longReader.Id, null, default);
        var maxBooks = CirculationRules.MaxBooksFor(settings, longReader.ReaderType) ?? 5;
        var longBudget = Math.Max(0, maxBooks - oldLongActive - 1); // Leave a slot for a fresh Reader request.
        UserProfile ForLongActive() { if (longBudget <= 0) return clean; longBudget--; return longReader; }
        BorrowRecord Loan(BookCopy copy, UserProfile reader, BorrowStatus status, int dueDays = 7, int renewals = 0)
        {
            var active = CirculationRules.OccupiesCopy(status);
            if (active) { copy.IsAvailable = false; copy.Location = null; copy.Book.AvailableCopies = 0; }
            var hasBorrowed = status is BorrowStatus.Borrowed or BorrowStatus.Overdue or BorrowStatus.Returned;
            var dueAt = CirculationRules.StartOfLibraryDateUtc(now).AddDays(dueDays).AddHours(20);
            var borrowedAt = dueAt.AddDays(-Math.Max(1, CirculationRules.BorrowDays(settings, copy.Book.Language)));
            var loan = new BorrowRecord
            {
                ReaderId = reader.Id, BookCopy = copy, BookCopyId = copy.Id, LibrarianId = staff.Id, Status = status,
                BorrowDate = hasBorrowed ? borrowedAt : null,
                DueDate = hasBorrowed ? dueAt : null,
                ReturnDate = status == BorrowStatus.Returned ? now.AddMinutes(-5) : null,
                ReturnCondition = status == BorrowStatus.Returned ? copy.Condition : null,
                PickupAt = status is BorrowStatus.Pending or BorrowStatus.Approved ? pickup : null,
                AcceptedAt = hasBorrowed ? borrowedAt.AddMinutes(-30) : status == BorrowStatus.Approved ? now.AddHours(-1) : null,
                RenewalCount = renewals, Notes = $"{Marker} {copy.Barcode} · xem mô tả sách để biết mục đích ca ban đầu."
            };
            db.Add(loan); return loan;
        }
        Fine Fee(BorrowRecord loan, decimal amount, string reason, bool paid)
        {
            var fine = new Fine
            {
                BorrowRecord = loan, BorrowRecordId = loan.Id, ReaderId = loan.ReaderId, Amount = amount,
                Reason = reason, Status = paid ? FineStatus.Paid : FineStatus.Pending,
                PaidAt = paid ? now.AddMinutes(-2) : null, PaymentMethod = paid ? "Cash" : null,
                RecordedById = paid ? staff.Id : null, Notes = $"{Marker} Khoản mô phỏng trên database local; không chuyển tiền."
            };
            db.Add(fine);
            if (paid) db.Add(new FinePayment { Fine = fine, Amount = amount, Method = "Cash", Status = FinePaymentStatus.Paid, PaidAt = fine.PaidAt, RecordedById = staff.Id });
            return fine;
        }
        void Incident(BookCopy copy, UserProfile reader, BookIncidentSeverity severity, BookIncidentStatus status, string notes)
        {
            var loan = Loan(copy, reader, BorrowStatus.Returned);
            loan.ReturnCondition = severity == BookIncidentSeverity.Lost ? BookCondition.Lost : BookCondition.Damaged;
            var incident = new BookIncident
            {
                BorrowRecord = loan, BookCopy = copy, ReaderId = reader.Id,
                Kind = severity == BookIncidentSeverity.Lost ? BookIncidentKind.Lost : BookIncidentKind.Damage,
                Severity = severity, Status = status, Description = $"{Marker} {notes}", ReportedBy = staff.Id,
                ConfirmedBy = status == BookIncidentStatus.PendingReview ? null : staff.Id,
                ConfirmedAt = status == BookIncidentStatus.PendingReview ? null : now.AddMinutes(-3)
            };
            if (status is BookIncidentStatus.CompensationPending or BookIncidentStatus.Resolved)
            {
                var amount = CirculationRules.PolicyFee(settings, severity);
                incident.AssessedFee = severity == BookIncidentSeverity.Light ? amount : null;
                if (severity is BookIncidentSeverity.Severe or BookIncidentSeverity.Lost) incident.ReplacementValue = amount;
                incident.CompensationFine = Fee(loan, amount, CirculationRules.CompensationReason(severity), status == BookIncidentStatus.Resolved);
            }
            db.Add(incident);
        }
        void Reserve(BookCopy copy, UserProfile reader, string status, int minutesAgo, DateTime? expires = null)
            => db.Add(new Reservation { ReaderId = reader.Id, BookId = copy.BookId, Book = copy.Book, Status = status,
                ReservedAt = now.AddMinutes(-minutesAgo), ExpiresAt = expires, Notes = $"{Marker} Hàng đợi cho {copy.Barcode}." });

        Copy(1, "Gửi yêu cầu mới từ Reader", location: Shelf);
        if (Copy(2, "Tiếp nhận yêu cầu; có thể huỷ/từ chối") is { } pending) Loan(pending, ForLongActive(), BorrowStatus.Pending);
        if (Copy(3, "Đối chiếu đúng/sai mã rồi giao sách") is { } approved) Loan(approved, ForLongActive(), BorrowStatus.Approved);
        if (Copy(4, "Gia hạn trong ngày hạn trả; chưa quá hạn") is { } renewal) Loan(renewal, ForLongActive(), BorrowStatus.Borrowed, 0);
        if (Copy(5, "Quá hạn ba ngày, phí chỉ tạm tính trước trả") is { } overdue) Loan(overdue, overdueReader, BorrowStatus.Overdue, -3);
        if (Copy(6, "Đã dùng hết số lần gia hạn") is { } maxRenew) Loan(maxRenew, clean, BorrowStatus.Borrowed, 0, settings.MaxRenewals ?? 2);
        if (Copy(7, "Chặn gia hạn vì có độc giả khác đặt trước") is { } reservedLoan)
        { Loan(reservedLoan, clean, BorrowStatus.Borrowed, 0); Reserve(reservedLoan, queueReader, "pending", 60); }
        if (Copy(8, "Ngoài cửa sổ tự gia hạn của Reader") is { } early) Loan(early, clean, BorrowStatus.Borrowed, 7);
        if (Copy(9, "Đã trả tốt, trong kho chờ xếp") is { } returned) Loan(returned, longReader, BorrowStatus.Returned);
        if (Copy(10, "Xác minh hư nhẹ cho Long; sẽ phát sinh phí sau khi xác nhận", BookCondition.Damaged, available: false) is { } lightPending)
            Incident(lightPending, longReader, BookIncidentSeverity.Unknown, BookIncidentStatus.PendingReview, "Xước bìa trước, góc trang 5 gập nhẹ; cần xác minh mức độ.");
        if (Copy(11, "Xác minh hư nặng", BookCondition.Damaged, available: false) is { } severePending)
            Incident(severePending, debtReader, BookIncidentSeverity.Unknown, BookIncidentStatus.PendingReview, "Bong gáy, rơi trang 21–30; chưa kết luận bồi thường.");
        if (Copy(12, "Xác minh mất sách", BookCondition.Lost, available: false) is { } lostPending)
            Incident(lostPending, debtReader, BookIncidentSeverity.Lost, BookIncidentStatus.PendingReview, "Độc giả báo quên sách trên xe; chưa tìm thấy bản sao.");
        if (Copy(13, "Hư nhẹ chưa thanh toán vẫn cho xếp kệ", BookCondition.LightDamaged) is { } lightDebt)
            Incident(lightDebt, debtReader, BookIncidentSeverity.Light, BookIncidentStatus.CompensationPending, "Đã xác minh xước bìa nhẹ, ruột sách nguyên vẹn. Đủ điều kiện sử dụng.");
        if (Copy(14, "Hư nặng chưa thanh toán; chặn xếp kệ", BookCondition.Damaged, available: false) is { } severeDebt)
            Incident(severeDebt, debtReader, BookIncidentSeverity.Severe, BookIncidentStatus.CompensationPending, "Gãy gáy, thiếu trang; không đủ điều kiện sử dụng.");
        if (Copy(15, "Hư nặng đã thanh toán vẫn cần kiểm tra phục hồi", BookCondition.Damaged, available: false) is { } severePaid)
            Incident(severePaid, debtReader, BookIncidentSeverity.Severe, BookIncidentStatus.Resolved, "Đã thanh toán mô phỏng, chưa sửa sách. Không tự mở xếp kệ.");
        if (Copy(16, "Mất đã thanh toán; chỉ phục hồi sau khi tìm thấy", BookCondition.Lost, available: false) is { } lostPaid)
            Incident(lostPaid, debtReader, BookIncidentSeverity.Lost, BookIncidentStatus.Resolved, "Đã thanh toán mô phỏng, chưa tìm thấy sách.");
        if (Copy(17, "Từ chối trách nhiệm chưa tự phục hồi sách", BookCondition.Damaged, available: false) is { } rejectedIncident)
            Incident(rejectedIncident, clean, BookIncidentSeverity.Unknown, BookIncidentStatus.Rejected, "Hư hỏng cũ, không quy trách nhiệm độc giả; bản sao vẫn cần kiểm tra trước khi dùng.");
        if (Copy(18, "Đã trả quá hạn, khoản phí đang chờ thu") is { } fineOnly)
        {
            var loan = Loan(fineOnly, debtReader, BorrowStatus.Returned);
            loan.DueDate = CirculationRules.StartOfLibraryDateUtc(loan.ReturnDate!.Value).AddDays(-3).AddHours(12);
            Fee(loan, 3 * settings.FinePerDay, $"{CirculationRules.OverdueReasonPrefix} 3 ngày", false);
        }
        if (Copy(19, "Ba bản sao riêng của một đầu sách; QR phải khác nhau") is { } multi)
        {
            foreach (var number in new[] { 2, 3 }) db.Add(new BookCopy { Book = multi.Book, BookId = multi.BookId, Barcode = $"LAB019-{number:D2}", Condition = BookCondition.Good, IsAvailable = true });
            multi.Book.TotalCopies = 3;
        }
        Copy(20, "Chiếm đủ sức chứa kệ LABFULL", location: FullShelf);
        if (Copy(21, "Bản sao trên kệ được giữ cho người khác đặt trước", location: Shelf) is { } hold)
            Reserve(hold, queueReader, "ready", 120, now.AddHours(CirculationRules.PickupHours(settings)));
        if (Copy(22, "Trả rồi xếp kệ để chuyển hàng đợi; Long đứng đầu") is { } queue)
        { Loan(queue, queueReader, BorrowStatus.Borrowed); Reserve(queue, longReader, "pending", 120); Reserve(queue, nextReader, "pending", 60); }
        if (Copy(23, "Từ chối yêu cầu riêng, không ảnh hưởng phiếu Long") is { } rejectLoan) Loan(rejectLoan, nextReader, BorrowStatus.Pending);
        if (Copy(24, "Lịch sử yêu cầu đã từ chối") is { } rejected)
            Loan(rejected, longReader, BorrowStatus.Rejected).Notes += " Lý do: độc giả đã chọn tài liệu khác.";
        Copy(25, "Dự phòng để mượn rồi trả hư hỏng/mất", location: Shelf);
        Copy(26, "Dự phòng để mượn tại quầy", location: Shelf);
        if (Copy(27, "Hư nhẹ cũ trên kệ; mượn lại rồi trả không phạt lại", BookCondition.LightDamaged, Shelf) is { } oldLight)
            Incident(oldLight, clean, BookIncidentSeverity.Light, BookIncidentStatus.Resolved, "Xước bìa cũ đã xác minh và thanh toán; lần trả sau giữ hư nhẹ nếu không có hư hỏng mới.");
        Copy(28, "Bản sao mới nhập kho chưa có phiếu");
        if (Copy(29, "Quá lịch nhận hơn 30 phút; tự huỷ khi chạy dọn lịch") is { } expiredPickup)
            Loan(expiredPickup, nextReader, BorrowStatus.Approved).PickupAt = now.AddMinutes(-45);
        Copy(30, "Chiếm đủ sức chứa kệ LABSWAP, dùng thử hoán đổi", location: SwapShelf);
        if (Copy(31, "Đặt trước sẵn sàng cho chính Long", location: Shelf) is { } longHold)
            Reserve(longHold, longReader, "ready", 90, now.AddHours(CirculationRules.PickupHours(settings)));
        if (Copy(32, "Đặt trước của Long hết hạn, chuyển lượt cho người tiếp", location: Shelf) is { } expiredHold)
        { Reserve(expiredHold, longReader, "ready", 3000, now.AddMinutes(-10)); Reserve(expiredHold, nextReader, "pending", 60); }
        if (Copy(33, "Sự cố hư hỏng kèm quá hạn; xác minh hai khoản phí", BookCondition.Damaged, available: false) is { } overdueDamage)
        {
            Incident(overdueDamage, debtReader, BookIncidentSeverity.Unknown, BookIncidentStatus.PendingReview, "Rách 3 trang, trả sau hạn ba ngày; kiểm tra cả bồi thường và quá hạn.");
            var loan = db.ChangeTracker.Entries<BorrowRecord>().Select(item => item.Entity).Single(item => item.BookCopyId == overdueDamage.Id);
            loan.DueDate = CirculationRules.StartOfLibraryDateUtc(loan.ReturnDate!.Value).AddDays(-3).AddHours(12);
        }
        if (Copy(34, "Phí đã miễn chỉ để đối chiếu trạng thái; không chặn Long") is { } waivedCopy)
        {
            var loan = Loan(waivedCopy, longReader, BorrowStatus.Returned);
            loan.DueDate = CirculationRules.StartOfLibraryDateUtc(loan.ReturnDate!.Value).AddDays(-3).AddHours(12);
            var fine = Fee(loan, 3 * settings.FinePerDay, $"{CirculationRules.OverdueReasonPrefix} 3 ngày", false);
            fine.Status = FineStatus.Waived;
            fine.Notes += " Miễn phí mô phỏng; không có thanh toán tiền mặt hoặc PayOS.";
        }
        if (Copy(35, "Hư nhẹ đã miễn bồi thường, đủ điều kiện xếp", BookCondition.LightDamaged) is { } waivedLight)
        {
            Incident(waivedLight, longReader, BookIncidentSeverity.Light, BookIncidentStatus.CompensationPending, "Xước bìa nhẹ đã xác minh; khoản bồi thường đã được miễn trong ca mô phỏng.");
            var incident = db.ChangeTracker.Entries<BookIncident>().Select(item => item.Entity).Single(item => item.BookCopyId == waivedLight.Id);
            incident.CompensationFine!.Status = FineStatus.Waived;
            incident.Status = BookIncidentStatus.Resolved;
        }
        if (Copy(36, "Độc giả đã báo hỏng nhưng chưa nhận trả") is { } reported)
        {
            var loan = Loan(reported, clean, BorrowStatus.Borrowed);
            db.Add(new BookIncident { BorrowRecord = loan, BookCopy = reported, ReaderId = clean.Id,
                Kind = BookIncidentKind.Damage, Severity = BookIncidentSeverity.Unknown, Status = BookIncidentStatus.PendingReview,
                ReportedBy = clean.Id, Description = $"{Marker} Độc giả báo bìa rách, chưa bàn giao sách cho thủ thư. Chưa xác minh, chưa lập bồi thường." });
        }
        if (Copy(37, "Lịch sử từng mất, đã tìm thấy/kiểm tra, đang chờ xếp") is { } restored)
            Incident(restored, debtReader, BookIncidentSeverity.Lost, BookIncidentStatus.Resolved, "Đã thanh toán mô phỏng, sau đó tìm thấy sách và kiểm tra còn tốt. Bản sao hiện Good, trong kho chờ xếp; lịch sử mất vẫn giữ.");
        var cap = CirculationRules.MaxBooksFor(settings, limitedReader.ReaderType);
        if (cap is > 0 and <= 30)
            for (var i = 0; i < cap; i++) if (Copy(101 + i, "Đủ hạn mức cho LABR009") is { } copy) Loan(copy, limitedReader, BorrowStatus.Borrowed);
        Copy(1, "Đã dùng số 001; tạo mới phải nhận 002", prefix: "GAP");
        Copy(3, "Đã dùng số 003; không được bỏ qua khoảng trống 002", prefix: "GAP");
        if (newBooks.Count > 0) db.Add(new Notification
        {
            UserId = longReader.Id, Title = "Bộ thực hành LAB đã sẵn sàng", Type = "borrow",
            Message = "Có yêu cầu chờ, lịch nhận, gia hạn và hàng đợi mẫu. Làm luồng mượn trước, xác minh hư hỏng/phí sau.",
            Metadata = "{\"href\":\"/history?tab=loans\"}"
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        Console.WriteLine($"Đã thêm {newBooks.Count} đầu sách LAB/GAP còn thiếu. Không reset ca cũ, không tạo tài khoản Supabase Auth, không sửa policy.");
    }

    public static async Task ActivateOverdueAsync(AppDbContext db)
    {
        var category = await db.Categories.SingleOrDefaultAsync(item => item.Code == "LAB")
            ?? throw new InvalidOperationException("Chạy demo:prepare-tests trước.");
        if (await db.Books.IgnoreQueryFilters().AnyAsync(item => item.Code == "LAB090"))
        {
            Console.WriteLine("LAB090 đã được tạo trước đây; giữ tiến độ, không biến phiếu đã trả thành quá hạn lại."); return;
        }
        var reader = await LongAsync(db);
        var book = new Book { Code = "LAB090", CodeCategoryId = category.Id, Categories = [category], TotalCopies = 1,
            Title = "[LAB] Sách thực hành 90", Description = $"{Marker} Ca quá hạn chủ động cho Long. Kích hoạt cuối buổi; không phải giao dịch mượn mới qua UI.", Language = "vi" };
        var copy = new BookCopy { Book = book, Barcode = "LAB090-01", Condition = BookCondition.Good, IsAvailable = false };
        db.Add(new BorrowRecord { ReaderId = reader.Id, BookCopy = copy, Status = BorrowStatus.Overdue,
            BorrowDate = DateTime.UtcNow.AddDays(-13), DueDate = CirculationRules.StartOfLibraryDateUtc(DateTime.UtcNow).AddDays(-3).AddHours(12),
            Notes = $"{Marker} Kích hoạt chủ động bằng demo:test-overdue để thử hạn chế mượn, chặn gia hạn, phí chỉ chốt khi trả." });
        await db.SaveChangesAsync();
        Console.WriteLine("Đã kích hoạt LAB090-01 cho Long: quá hạn ba ngày theo lịch Việt Nam, chưa lập phí. Có thể bị chặn mượn mới cho tới khi trả/thu phí.");
    }

    static Task<UserProfile> LongAsync(AppDbContext db) => db.UserProfiles.SingleAsync(
        item => item.Email.Replace("@", "").ToLower() == "longnhde180230fpt.edu.vn");

    public static async Task ExportStatusAsync(AppDbContext db)
    {
        var books = await db.Books.AsNoTracking().Where(item => item.Code.StartsWith("LAB") || item.Code.StartsWith("GAP"))
            .Include(item => item.Copies).OrderBy(item => item.Code).ToListAsync();
        var loans = await db.BorrowRecords.AsNoTracking().Where(item => item.BookCopy.Book.Code.StartsWith("LAB") || item.BookCopy.Book.Code.StartsWith("GAP"))
            .Include(item => item.Reader).Include(item => item.BookCopy).OrderBy(item => item.CreatedAt).ToListAsync();
        var incidents = await db.BookIncidents.AsNoTracking().Where(item => item.BookCopy.Book.Code.StartsWith("LAB") || item.BookCopy.Book.Code.StartsWith("GAP")).ToListAsync();
        var fines = await db.Fines.AsNoTracking().Where(item => item.BorrowRecord.BookCopy.Book.Code.StartsWith("LAB") || item.BorrowRecord.BookCopy.Book.Code.StartsWith("GAP")).ToListAsync();
        var reservations = await db.Reservations.AsNoTracking().Where(item => item.Book.Code.StartsWith("LAB") || item.Book.Code.StartsWith("GAP")).ToListAsync();
        var reader = await LongAsync(db);
        var settings = await new CirculationRepository(db).GetSettingsAsync(default);
        var open = await new CirculationRepository(db).CountActiveLoansAsync(reader.Id, null, default);
        var longPendingFee = await db.Fines.Where(item => item.ReaderId == reader.Id && item.Status == FineStatus.Pending).SumAsync(item => item.Amount);
        var errors = new List<string>();
        foreach (var book in books)
        {
            var counted = book.Copies.Count(item => item.IsAvailable && item.Location is not null && item.Condition is not (BookCondition.Damaged or BookCondition.Lost));
            if (book.TotalCopies != book.Copies.Count || book.AvailableCopies != counted) errors.Add($"Sai tồn kho {book.Code}");
            foreach (var copy in book.Copies)
            {
                var active = loans.Count(item => item.BookCopyId == copy.Id && CirculationRules.OccupiesCopy(item.Status));
                if (active > 1 || active > 0 && (copy.IsAvailable || copy.Location is not null)) errors.Add($"Phiếu/vị trí không nhất quán {copy.Barcode}");
                if (copy.Condition is BookCondition.Damaged or BookCondition.Lost && (copy.IsAvailable || copy.Location is not null)) errors.Add($"Sách hỏng/mất khả dụng {copy.Barcode}");
            }
        }
        var payload = new
        {
            GeneratedAtUtc = DateTime.UtcNow, Database = "smartlibrary_demo@127.0.0.1:55439", Settings = settings,
            Long = new { reader.Email, reader.StudentId, reader.Status, OpenLoans = open, PendingAmount = longPendingFee },
            InvariantErrors = errors,
            Accounts = await db.UserProfiles.AsNoTracking().Include(item => item.Role)
                .Where(item => item.Email.StartsWith("lab.") || item.Id == reader.Id || item.Role.Name == "Librarian" || item.Role.Name == "Admin")
                .Select(item => new { item.Email, item.FullName, item.StudentId, Role = item.Role.Name, item.Status, item.MembershipExpiresAt }).ToListAsync(),
            Cases = books.Select(book => new
            {
                book.Id, book.Code, book.Title, book.Description, book.TotalCopies, book.AvailableCopies,
                ReaderUrl = $"http://localhost:5173/books/{book.Id}",
                Copies = book.Copies.Select(copy => new { copy.Id, copy.Barcode, Condition = copy.Condition.ToString(), copy.IsAvailable, copy.Location,
                    Loans = loans.Where(loan => loan.BookCopyId == copy.Id).Select(loan => new { loan.Id, Status = loan.Status.ToString(), Reader = loan.Reader.Email, loan.Reader.StudentId, loan.PickupAt, loan.DueDate, loan.ReturnDate, loan.RenewalCount }),
                    Incidents = incidents.Where(item => item.BookCopyId == copy.Id).Select(item => new { item.Id, Status = item.Status.ToString(), Severity = item.Severity.ToString(), item.Description, item.AssessedFee }),
                    Fines = fines.Where(item => loans.Any(loan => loan.Id == item.BorrowRecordId && loan.BookCopyId == copy.Id)).Select(item => new { item.Id, item.Amount, Status = item.Status.ToString(), item.Reason }) }),
                Reservations = reservations.Where(item => item.BookId == book.Id).Select(item => new { item.Id, item.ReaderId, item.Status, item.ReservedAt, item.ExpiresAt })
            })
        };
        var directory = Path.Combine(Directory.GetCurrentDirectory(), "artifacts", "manual-testing");
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "lab-status.json");
        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            WriteIndented = true, Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() }
        }));
        Console.WriteLine($"LAB/GAP: {books.Count} đầu sách, {books.Sum(item => item.Copies.Count)} bản sao, {loans.Count} phiếu, {incidents.Count} hồ sơ, {fines.Count} phí, {reservations.Count} đặt trước.");
        Console.WriteLine($"Long: {open} phiếu chiếm hạn mức, {longPendingFee:N0}đ chưa thanh toán. Snapshot: {path}");
        if (errors.Count > 0) throw new InvalidOperationException(string.Join("; ", errors));
        Console.WriteLine("Đối chiếu tồn kho, mã bản sao, phiếu mở và sách hỏng/mất: OK.");
    }
}
