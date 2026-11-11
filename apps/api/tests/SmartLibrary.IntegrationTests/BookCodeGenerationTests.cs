using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Npgsql;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Migrations;
using SmartLibrary.Infrastructure.Services;

namespace SmartLibrary.IntegrationTests;

public sealed class BookCodePostgresFactAttribute : FactAttribute
{
    public BookCodePostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTLIBRARY_TEST_POSTGRES")))
            Skip = "Cần PostgreSQL kiểm thử riêng trong SMARTLIBRARY_TEST_POSTGRES; không dùng database dự án.";
    }
}

public class BookCodeGenerationTests
{
    [BookCodePostgresFact]
    public async Task MigrationLinksCategoriesWithoutChangingLegacyBookOrCopyCodes()
    {
        await using var database = await CodeDatabase.CreateAsync();
        var category = Guid.NewGuid(); var book = Guid.NewGuid();
        await database.ExecuteAsync($"""
            INSERT INTO categories(id, name) VALUES ('{category}', 'Khoa học tự nhiên');
            INSERT INTO books(id, code) VALUES ('{book}', 'KHTN012');
            INSERT INTO book_categories VALUES ('{book}', '{category}');
            INSERT INTO book_copies(id, book_id, barcode) VALUES ('{Guid.NewGuid()}', '{book}', 'KHTN012-01');
            """);
        await database.MigrateAsync();
        // SQL is intentionally idempotent for the EF and Supabase migration paths.
        await database.MigrateAsync();
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT c.code, b.code, b.code_category_id, copy.barcode FROM categories c JOIN books b ON b.code_category_id=c.id JOIN book_copies copy ON copy.book_id=b.id", connection);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal("KHTN", reader.GetString(0));
        Assert.Equal("KHTN012", reader.GetString(1));
        Assert.Equal(category, reader.GetGuid(2));
        Assert.Equal("KHTN012-01", reader.GetString(3));
    }

    [BookCodePostgresFact]
    public async Task PreviewFillsGapAndKeepsDeletedBookCodesReserved()
    {
        await using var database = await CodeDatabase.CreateAsync();
        await database.MigrateAsync();
        var category = Guid.NewGuid();
        await database.ExecuteAsync($"INSERT INTO categories(id, name, code) VALUES ('{category}', 'Khoa học tự nhiên', 'KHTN')");
        foreach (var number in Enumerable.Range(0, 11).Append(12))
            await database.ExecuteAsync($"INSERT INTO books(id, code, is_deleted) VALUES ('{Guid.NewGuid()}', 'KHTN{number:D3}', {(number == 5 ? "TRUE" : "FALSE")})");
        await using var context = database.Context();
        var result = await new BookCodeGenerator(context).GetNextAsync(category);
        Assert.True(result.IsSuccess, result.Error);
        Assert.Equal("KHTN011", result.Data);
    }

    [BookCodePostgresFact]
    public async Task ConcurrentCreationsReceiveDifferentConsecutiveCodes()
    {
        await using var database = await CodeDatabase.CreateAsync();
        await database.MigrateAsync();
        var category = Guid.NewGuid();
        await database.ExecuteAsync($"INSERT INTO categories(id, name, code) VALUES ('{category}', 'Test category', 'IT')");
        var firstHasLock = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var first = Task.Run(async () =>
        {
            await using var context = database.Context();
            await using var transaction = await context.Database.BeginTransactionAsync();
            var result = await new BookCodeGenerator(context).GetNextAsync(category, true);
            firstHasLock.SetResult();
            await secondStarted.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO books(id, code) VALUES ({Guid.NewGuid()}, {result.Data!})");
            await transaction.CommitAsync();
            return result;
        });
        var second = Task.Run(async () =>
        {
            await firstHasLock.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await using var context = database.Context();
            await using var transaction = await context.Database.BeginTransactionAsync();
            secondStarted.SetResult();
            var result = await new BookCodeGenerator(context).GetNextAsync(category, true);
            await context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO books(id, code) VALUES ({Guid.NewGuid()}, {result.Data!})");
            await transaction.CommitAsync();
            return result;
        });
        var results = await Task.WhenAll(first, second).WaitAsync(TimeSpan.FromSeconds(20));
        Assert.All(results, result => Assert.True(result.IsSuccess, result.Error));
        Assert.Equal(new[] { "IT001", "IT002" }, results.Select(result => result.Data).OrderBy(code => code).ToArray());
    }

    [BookCodePostgresFact]
    public async Task AllocatorRejectsCreationOutsideATransaction()
    {
        await using var database = await CodeDatabase.CreateAsync();
        await using var context = database.Context();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new BookCodeGenerator(context).GetNextAsync(Guid.NewGuid(), true));
    }

    private sealed class CodeDatabase : IAsyncDisposable
    {
        public string ConnectionString { get; }
        private readonly string _schema;
        private CodeDatabase(string connectionString, string schema) { ConnectionString = connectionString; _schema = schema; }
        public static async Task<CodeDatabase> CreateAsync()
        {
            var builder = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SMARTLIBRARY_TEST_POSTGRES"));
            if (builder.Database?.StartsWith("smartlibrary_test_", StringComparison.Ordinal) != true)
                throw new InvalidOperationException("Chỉ được dùng database có tên bắt đầu bằng smartlibrary_test_.");
            var schema = "code_" + Guid.NewGuid().ToString("N");
            builder.SearchPath = schema;
            var database = new CodeDatabase(builder.ConnectionString, schema);
            await database.ExecuteAsync($"""
                CREATE SCHEMA "{schema}";
                CREATE TABLE categories(id uuid PRIMARY KEY, name text NOT NULL, description text, image_url text, parent_id uuid,
                    is_deleted boolean NOT NULL DEFAULT FALSE, created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW());
                CREATE TABLE books(id uuid PRIMARY KEY, code varchar(32) UNIQUE NOT NULL, is_deleted boolean NOT NULL DEFAULT FALSE);
                CREATE TABLE book_categories(book_id uuid, category_id uuid, PRIMARY KEY(book_id,category_id));
                CREATE TABLE book_copies(id uuid PRIMARY KEY, book_id uuid, barcode text);
                """);
            return database;
        }
        public AppDbContext Context() => new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(ConnectionString).UseSnakeCaseNamingConvention().Options);
        public async Task ExecuteAsync(string sql)
        {
            await using var connection = new NpgsqlConnection(ConnectionString);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync();
        }
        public async Task MigrateAsync()
        {
            foreach (var operation in new AddCategoryCodes().UpOperations.Cast<SqlOperation>()) await ExecuteAsync(operation.Sql);
        }
        public async ValueTask DisposeAsync() => await ExecuteAsync($"DROP SCHEMA \"{_schema}\" CASCADE");
    }
}
