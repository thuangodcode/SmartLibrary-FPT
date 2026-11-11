using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Application.Features.Circulation;
using SmartLibrary.Infrastructure.Persistence.Repositories;

// This utility can only write to this explicitly named loopback database.
const string localConnection = "Host=127.0.0.1;Port=55439;Database=smartlibrary_demo;Username=postgres;Pooling=false";
var guard = new NpgsqlConnectionStringBuilder(localConnection);
if (guard.Host != "127.0.0.1" || guard.Database != "smartlibrary_demo") throw new Exception("Demo database guard failed.");
var envPath = Path.GetFullPath(args.FirstOrDefault(arg => !arg.StartsWith("--")) ?? ".env");
var sourceConnection = File.ReadLines(envPath).First(line => line.StartsWith("ConnectionStrings__DefaultConnection=")).Split('=', 2)[1].Trim().Trim('"', '\'');
AppDbContext Context(string connection) => new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).UseSnakeCaseNamingConvention().Options);
await using var admin = new NpgsqlConnection(new NpgsqlConnectionStringBuilder(localConnection) { Database = "postgres" }.ConnectionString);
await admin.OpenAsync();
await using (var check = new NpgsqlCommand("SELECT count(*) FROM pg_database WHERE datname='smartlibrary_demo'", admin))
    if (Convert.ToInt32(await check.ExecuteScalarAsync()) == 0)
        await new NpgsqlCommand("CREATE DATABASE smartlibrary_demo", admin).ExecuteNonQueryAsync();
await using var db = Context(localConnection);
if (await db.Database.CanConnectAsync() && await db.Database.SqlQueryRaw<int>("SELECT count(*)::int AS \"Value\" FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles'").SingleAsync() > 0)
{
    if (args.Contains("--repair-auth"))
    {
        // Only the guarded local target is modified; the source transaction cannot write.
        await using var authSource = Context(sourceConnection);
        await using var authRead = await authSource.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
        await authSource.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
        var sourceRoles = await authSource.Set<Role>().AsNoTracking().ToListAsync();
        var sourcePermissions = await authSource.Set<Permission>().AsNoTracking().ToListAsync();
        var sourceLinks = await authSource.Set<RolePermission>().AsNoTracking().ToListAsync();
        await authRead.CommitAsync();
        await using var repair = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync("""
            DO $$ BEGIN
                IF to_regclass('public.permissions') IS NULL AND to_regclass('public.permission') IS NOT NULL THEN
                    ALTER TABLE public.permission RENAME TO permissions;
                END IF;
            END $$;
            """);
        var roleIds = (await db.Set<Role>().Select(item => item.Id).ToListAsync()).ToHashSet();
        var permissionIds = (await db.Set<Permission>().Select(item => item.Id).ToListAsync()).ToHashSet();
        var links = (await db.Set<RolePermission>().Select(item => new { item.RoleId, item.PermissionId }).ToListAsync())
            .Select(item => (item.RoleId, item.PermissionId)).ToHashSet();
        db.AddRange(sourceRoles.Where(item => !roleIds.Contains(item.Id)));
        db.AddRange(sourcePermissions.Where(item => !permissionIds.Contains(item.Id)));
        db.AddRange(sourceLinks.Where(item => !links.Contains((item.RoleId, item.PermissionId))));
        await db.SaveChangesAsync();
        await repair.CommitAsync();
        Console.WriteLine("Local permission schema/references repaired. Existing profiles and business data preserved; Supabase read-only.");
    }
    if (args.Contains("--handoff") && !await db.Books.AnyAsync(book => book.Code == "DEMO013"))
    {
        var category = await db.Categories.SingleAsync(item => item.Code == "DEMO");
        var reader = await db.UserProfiles.SingleAsync(u => u.Email.Replace("@", "").ToLower() == "longnhde180230fpt.edu.vn");
        var staffId = await db.UserProfiles.Where(u => u.Role.Name == "Librarian").Select(u => u.Id).FirstAsync();
        var handoffSettings = await new CirculationRepository(db).GetSettingsAsync(CancellationToken.None);
        var pickup = CirculationRules.PickupSlots(handoffSettings, DateTimeOffset.UtcNow).First().PickupAt.UtcDateTime;
        var book = new Book { Code = "DEMO013", CodeCategoryId = category.Id, Categories = [category], Title = "[Demo] Chờ giao sách — đối chiếu mã", Language = "vi", TotalCopies = 1 };
        var copy = new BookCopy { Book = book, Barcode = "DEMO013-01", Condition = BookCondition.Good, IsAvailable = false };
        db.Add(new BorrowRecord { ReaderId = reader.Id, BookCopy = copy, LibrarianId = staffId, Status = BorrowStatus.Approved, PickupAt = pickup, AcceptedAt = DateTime.UtcNow, Notes = "[DEMO-LOCAL] Phiếu chờ giao bổ sung sau kiểm thử." });
        await db.SaveChangesAsync();
        Console.WriteLine("Handoff fixture DEMO013-01 is ready.");
    }
    if (args.Contains("--overdue"))
    {
        var copy = await db.BookCopies.Include(c => c.Book).SingleAsync(c => c.Barcode == "DEMO011-01");
        if (await db.BorrowRecords.AnyAsync(l => l.BookCopyId == copy.Id && l.Status != BorrowStatus.Returned && l.Status != BorrowStatus.Rejected))
            throw new Exception("Ca quá hạn đang có phiếu. Hãy xử lý phiếu trước khi tạo lại.");
        var reader = await db.UserProfiles.SingleAsync(u => u.Email.Replace("@", "").ToLower() == "longnhde180230fpt.edu.vn");
        db.Add(new BorrowRecord { ReaderId = reader.Id, BookCopyId = copy.Id, Status = BorrowStatus.Overdue, BorrowDate = DateTime.UtcNow.AddDays(-17), DueDate = DateTime.UtcNow.AddDays(-3), Notes = "[DEMO-LOCAL] Ca quá hạn 3 ngày; trả sách và kiểm tra phí theo chính sách." });
        if (copy.IsAvailable && copy.Location != null) copy.Book.AvailableCopies = Math.Max(0, copy.Book.AvailableCopies - 1);
        copy.Location = null; copy.IsAvailable = false;
        await db.SaveChangesAsync();
        Console.WriteLine("Overdue fixture DEMO011-01 is ready. It intentionally blocks new borrowing until returned/fees settled.");
    }
    if (!await db.Books.AnyAsync(book => book.Code == "DEMO001"))
        throw new Exception("Database local chưa seed hoàn chỉnh; không tự reset hoặc ghi đè dữ liệu đang có.");
    Console.WriteLine("Demo database already exists; no data reset. Use it as-is.");
    return;
}
await db.Database.EnsureCreatedAsync();
// Snapshot only reference/catalog data and required account identities. Source is read-only at PostgreSQL level.
await using var source = Context(sourceConnection);
await using var readOnly = await source.Database.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead);
await source.Database.ExecuteSqlRawAsync("SET TRANSACTION READ ONLY");
var profiles = await source.UserProfiles.AsNoTracking().Include(item => item.Role)
    .Where(item => item.Email.Replace("@", "").ToLower() == "longnhde180230fpt.edu.vn" || item.Role.Name == "Librarian" || item.Role.Name == "Admin").ToListAsync();
var longReader = profiles.SingleOrDefault(item => item.Email.Replace("@", "").ToLower() == "longnhde180230fpt.edu.vn")
    ?? throw new Exception("Không tìm thấy đúng tài khoản Long. Chưa seed dữ liệu.");
var roles = await source.Set<Role>().AsNoTracking().ToListAsync();
var permissions = await source.Set<Permission>().AsNoTracking().ToListAsync();
var rolePermissions = await source.Set<RolePermission>().AsNoTracking().ToListAsync();
foreach (var profile in profiles) { profile.Role = null!; profile.CreatedBy = null; }
db.AddRange(roles); db.AddRange(permissions); db.AddRange(rolePermissions); db.AddRange(profiles);
var categories = await source.Categories.AsNoTracking().ToListAsync();
var authors = await source.Authors.AsNoTracking().ToListAsync();
var publishers = await source.Publishers.AsNoTracking().ToListAsync();
var books = await source.Books.AsNoTracking().ToListAsync();
var copies = await source.BookCopies.AsNoTracking().ToListAsync();
var shelves = await source.StorageShelves.AsNoTracking().ToListAsync();
var categoryLinks = await source.Books.AsNoTracking().Select(book => new { book.Id, Categories = book.Categories.Select(c => c.Id).ToList(), Authors = book.Authors.Select(a => a.Id).ToList() }).ToListAsync();
var policies = await source.PolicyRules.AsNoTracking().Include(item => item.Parameters).ToListAsync();
foreach (var policy in policies) { policy.CreatedBy = null; policy.UpdatedBy = null; }
await readOnly.CommitAsync();
db.AddRange(categories); db.AddRange(authors); db.AddRange(publishers); db.AddRange(books); db.AddRange(copies); db.AddRange(shelves); db.AddRange(policies);
foreach (var book in books) { book.TotalCopies = copies.Count(c => c.BookId == book.Id); book.AverageRating = 0; }
// No real loans, fines, incidents or payment attempts are copied into the demo environment.
foreach (var copy in copies) copy.IsAvailable = copy.Condition is not (BookCondition.Damaged or BookCondition.Lost);
foreach (var book in books) book.AvailableCopies = copies.Count(c => c.BookId == book.Id && c.IsAvailable && c.Location != null);
foreach (var link in categoryLinks)
{
    var book = books.Single(b => b.Id == link.Id);
    foreach (var categoryId in link.Categories) book.Categories.Add(categories.Single(c => c.Id == categoryId));
    foreach (var authorId in link.Authors) book.Authors.Add(authors.Single(a => a.Id == authorId));
}
await db.SaveChangesAsync();
// EnsureCreated produces the current EF model; mark the matching migration baseline only on this new local database.
await db.Database.ExecuteSqlRawAsync("CREATE TABLE IF NOT EXISTS \"__EFMigrationsHistory\" (migration_id varchar(150) PRIMARY KEY, product_version varchar(32) NOT NULL)");
foreach (var migration in db.Database.GetMigrations())
    await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"__EFMigrationsHistory\" VALUES ({migration}, {"9.0.2"}) ON CONFLICT DO NOTHING");
var settings = await new CirculationRepository(db).GetSettingsAsync(CancellationToken.None);
var now = DateTime.UtcNow;
var staff = profiles.First(item => roles.Single(role => role.Id == item.RoleId).Name == "Librarian");
longReader.IsActive = true; longReader.Status = AccountStatus.Active;
longReader.MembershipExpiresAt = now.AddYears(1);
var demoCategory = new Category { Name = "Thực hành nghiệp vụ (demo local)", Code = "DEMO" };
var demoShelf = new StorageShelf { Name = "Tầng 9 · Kệ DEMO", Capacity = 20 };
var fullShelf = new StorageShelf { Name = "Tầng 9 · Kệ FULL", Capacity = 1 };
db.AddRange(demoCategory, demoShelf, fullShelf);
BookCopy Copy(int index, string title, BookCondition condition = BookCondition.Good, string? location = null, bool available = true)
{
    var book = new Book { Code = $"DEMO{index:D3}", CodeCategoryId = demoCategory.Id, Title = $"[Demo] {title}", Description = "Dữ liệu thực hành riêng trên database local.", Language = "vi", TotalCopies = 1, AvailableCopies = available && location != null ? 1 : 0, Categories = [demoCategory] };
    var copy = new BookCopy { Book = book, BookId = book.Id, Barcode = $"{book.Code}-01", Condition = condition, Location = location, IsAvailable = available };
    db.Add(copy); return copy;
}
BorrowRecord Loan(BookCopy copy, BorrowStatus status, int? dueDays = null)
{
    var active = status is BorrowStatus.Borrowed or BorrowStatus.Overdue;
    var loan = new BorrowRecord { ReaderId = longReader.Id, BookCopy = copy, BookCopyId = copy.Id, LibrarianId = staff.Id, Status = status, CreatedAt = now.AddDays(-20), BorrowDate = active || status == BorrowStatus.Returned ? now.AddDays(-14) : null, DueDate = dueDays.HasValue ? now.AddDays(dueDays.Value) : null, PickupAt = CirculationRules.PickupSlots(settings, DateTimeOffset.UtcNow).First().PickupAt.UtcDateTime, AcceptedAt = status == BorrowStatus.Pending ? null : now.AddHours(-1), ReturnDate = status == BorrowStatus.Returned ? now.AddHours(-2) : null, Notes = "[DEMO-LOCAL] Dữ liệu thực hành cho Long." };
    if (status != BorrowStatus.Returned) { copy.IsAvailable = false; copy.Location = null; copy.Book.AvailableCopies = 0; }
    db.Add(loan); return loan;
}
BookIncident Incident(BorrowRecord loan, BookIncidentSeverity severity, string description)
{
    var pending = severity == BookIncidentSeverity.Unknown;
    var lost = severity == BookIncidentSeverity.Lost;
    var incident = new BookIncident { BorrowRecord = loan, BorrowRecordId = loan.Id, BookCopy = loan.BookCopy, BookCopyId = loan.BookCopyId, ReaderId = longReader.Id, Kind = lost ? BookIncidentKind.Lost : BookIncidentKind.Damage, Severity = severity, Status = pending ? BookIncidentStatus.PendingReview : BookIncidentStatus.Resolved, Description = "[DEMO-LOCAL] " + description, ReportedBy = staff.Id, ConfirmedBy = pending ? null : staff.Id, ConfirmedAt = pending ? null : now.AddHours(-1) };
    loan.ReturnCondition = lost ? BookCondition.Lost : BookCondition.Damaged;
    if (!pending)
    {
        var fine = new Fine { BorrowRecord = loan, BorrowRecordId = loan.Id, ReaderId = longReader.Id, Amount = CirculationRules.PolicyFee(settings, severity), Reason = lost ? "Bồi thường mất sách (demo)" : "Bồi thường hư hỏng (demo)", Status = FineStatus.Paid, PaidAt = now.AddHours(-1), PaymentMethod = "demo", Notes = "[DEMO-LOCAL] Đã thanh toán giả lập để không khoá các ca mượn." };
        // Existing assessed fixtures start settled. New confirmations/returns exercise real pending-fee logic.
        db.Add(fine); incident.CompensationFine = fine; incident.CompensationFineId = fine.Id; incident.Status = BookIncidentStatus.Resolved;
    }
    db.Add(incident); return incident;
}
Loan(Copy(1, "Yêu cầu chờ duyệt"), BorrowStatus.Pending);
Loan(Copy(2, "Chờ đối chiếu và giao sách"), BorrowStatus.Approved);
Loan(Copy(3, "Đang mượn — trả đúng hạn"), BorrowStatus.Borrowed, 7);
// Overdue is prepared separately so it doesn't block the first approval/handoff test.
var damagedLoan = Loan(Copy(4, "Trả hư hỏng — chờ xác minh", BookCondition.Damaged, available: false), BorrowStatus.Returned, 4);
Incident(damagedLoan, BookIncidentSeverity.Unknown, "Rách trang 15–18 và bong gáy. Cần đánh giá mức độ.");
var light = Loan(Copy(5, "Hư nhẹ — có thể xếp kệ", BookCondition.LightDamaged), BorrowStatus.Returned, 4);
Incident(light, BookIncidentSeverity.Light, "Xước bìa, ruột sách nguyên vẹn. Xác minh hư nhẹ, vẫn sử dụng được.");
var severe = Loan(Copy(6, "Hư nặng — giữ kho", BookCondition.Damaged, available: false), BorrowStatus.Returned, 4);
Incident(severe, BookIncidentSeverity.Severe, "Bong gáy, rơi nhiều trang. Không đủ điều kiện cho mượn.");
var lost = Loan(Copy(7, "Thất lạc — thử tìm thấy", BookCondition.Lost, available: false), BorrowStatus.Returned, 4);
Incident(lost, BookIncidentSeverity.Lost, "Độc giả báo thất lạc. Chưa ghi nhận tìm thấy bản sao.");
Loan(Copy(8, "Đã trả tốt — chờ xếp kệ"), BorrowStatus.Returned, 4).ReturnCondition = BookCondition.Good;
Copy(9, "Sẵn sàng trên kệ — mượn mới", location: demoShelf.Name);
Copy(10, "Chiếm đủ sức chứa kệ FULL", location: fullShelf.Name);
Copy(11, "Để dành thử quá hạn", location: demoShelf.Name);
Copy(12, "Để dành thử trả hư hỏng", location: demoShelf.Name);
await db.SaveChangesAsync();
Console.WriteLine($"Local demo ready for {longReader.Email}: DEMO001-01 through DEMO012-01. Real fines were not copied; Supabase unchanged.");
