using Microsoft.EntityFrameworkCore;
using SmartLibrary.Application.Common;
using SmartLibrary.Application.Features.Books;
using SmartLibrary.Infrastructure.Persistence;

namespace SmartLibrary.Infrastructure.Services;

public class BookCodeGenerator(AppDbContext db) : IBookCodeGenerator
{
    public async Task<Result<string>> GetNextAsync(Guid categoryId, bool forCreation = false, CancellationToken ct = default)
    {
        if (forCreation && db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Cấp mã sách phải nằm trong transaction tạo sách.");

        var category = forCreation
            ? await db.Categories.FromSqlInterpolated($"SELECT * FROM categories WHERE id = {categoryId} AND is_deleted = FALSE FOR UPDATE").AsNoTracking().FirstOrDefaultAsync(ct)
            : await db.Categories.AsNoTracking().FirstOrDefaultAsync(item => item.Id == categoryId && !item.IsDeleted, ct);
        if (category is null) return Result<string>.Failure("Không tìm thấy danh mục cấp mã.");
        var prefix = BookCodeRules.NormalizeCategoryCode(category.Code);
        if (prefix is null) return Result<string>.Failure("Danh mục chưa có mã hợp lệ. Hãy cập nhật mã danh mục trước.");

        if (forCreation)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({"book-code:" + prefix})::bigint)", ct);
        // Deleted titles also reserve their codes so restore cannot collide with a new book/QR.
        var codes = await db.Books.IgnoreQueryFilters().AsNoTracking()
            .Where(book => book.Code.ToUpper().StartsWith(prefix)).Select(book => book.Code).ToListAsync(ct);
        return Result<string>.Success(BookCodeRules.NextAvailable(prefix, codes));
    }
}
