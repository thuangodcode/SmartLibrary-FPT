using Microsoft.EntityFrameworkCore;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Repositories;

namespace SmartLibrary.IntegrationTests;

public class BookCatalogSortQueryTests
{
    [Theory]
    [InlineData(true, false, false)]
    [InlineData(true, true, false)]
    [InlineData(false, false, true)]
    public void SortedCatalogQuery_TranslatesForPostgres(bool byReview, bool ascending, bool byBorrow)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused;Password=unused")
            .UseSnakeCaseNamingConvention()
            .Options;
        using var context = new AppDbContext(options);
        var books = context.Books.IgnoreQueryFilters().AsNoTracking().Where(book => !book.IsDeleted);
        var query = BookRepository.OrderCatalog(books, context, byReview, ascending, byBorrow)
            .AsSplitQuery()
            .Include(book => book.Authors.Where(author => !author.IsDeleted))
            .Include(book => book.Categories.Where(category => !category.IsDeleted))
            .Skip(18).Take(18);

        var sql = query.ToQueryString();

        Assert.Contains("ORDER BY", sql);
        Assert.Contains("count(", sql, StringComparison.OrdinalIgnoreCase);
    }
}
