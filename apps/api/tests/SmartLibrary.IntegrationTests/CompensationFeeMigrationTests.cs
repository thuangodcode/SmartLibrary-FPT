using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations.Operations;
using Npgsql;
using SmartLibrary.Domain.Entities;
using SmartLibrary.Domain.Enums;
using SmartLibrary.Infrastructure.Persistence;
using SmartLibrary.Infrastructure.Persistence.Migrations;
using SmartLibrary.Infrastructure.Persistence.Repositories;

namespace SmartLibrary.IntegrationTests;

public sealed partial class CopyLifecycleTests
{
    const string CompensationMigration = "20261112000000_AlignCompensationFees";

    [BookCodePostgresFact]
    public async Task CompensationMigrationAlignsEffectivePoliciesWithoutRepricingExistingLiabilities()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        var current = await db.PolicyRules.Include(item => item.Parameters).SingleAsync();
        current.Priority = 100;
        db.AddRange(
            new PolicyRuleParameter { PolicyRuleId = current.Id, ParamKey = "damaged_book_fee", ParamValue = "12000" },
            new PolicyRuleParameter { PolicyRuleId = current.Id, ParamKey = "lost_fee", ParamValue = "15000" });
        var empty = FeePolicy("EMPTY");
        var legacy = FeePolicy("LEGACY");
        legacy.Parameters = [new() { ParamKey = "DAMAGED_BOOK_FEE", ParamValue = "12000" }, new() { ParamKey = "lost_fee", ParamValue = "15000" }];
        var excluded = new[] { FeePolicy("DRAFT"), FeePolicy("INACTIVE"), FeePolicy("FUTURE"), FeePolicy("EXPIRED"), FeePolicy("DELETED"), FeePolicy("OTHER") };
        excluded[0].Status = PolicyRuleStatus.Draft;
        excluded[1].Status = PolicyRuleStatus.Inactive;
        excluded[2].EffectiveFrom = DateTime.UtcNow.AddDays(1);
        excluded[3].EffectiveTo = DateTime.UtcNow.AddDays(-1);
        excluded[4].IsDeleted = true;
        excluded[5].PolicyType = PolicyRuleType.BorrowLimit;
        foreach (var policy in excluded)
            policy.Parameters = [new() { ParamKey = "damage_fee", ParamValue = "7000" }, new() { ParamKey = "lost_book_fee", ParamValue = "15000" }];
        db.AddRange(excluded);
        db.AddRange(empty, legacy);

        var loan = await db.BorrowRecords.SingleAsync();
        var pending = new Fine { BorrowRecordId = loan.Id, ReaderId = loan.ReaderId, Amount = 15000, Reason = "Hư nặng trước migration" };
        var paid = new Fine { BorrowRecordId = loan.Id, ReaderId = loan.ReaderId, Amount = 12000, Status = FineStatus.Paid, PaidAt = DateTime.UtcNow, Reason = "Hư nhẹ đã thanh toán" };
        var payment = new FinePayment { Fine = paid, Amount = paid.Amount, Status = FinePaymentStatus.Paid, PaidAt = paid.PaidAt };
        var incident = await db.BookIncidents.SingleAsync();
        incident.AssessedFee = pending.Amount;
        incident.CompensationFine = pending;
        db.AddRange(pending, payment);
        await db.SaveChangesAsync();
        await db.Entry(pending).ReloadAsync();
        await db.Entry(paid).ReloadAsync();
        await db.Entry(payment).ReloadAsync();
        var oldPending = (pending.Id, pending.Amount, pending.Status, pending.Reason, pending.UpdatedAt);
        var oldPaid = (paid.Id, paid.Amount, paid.Status, paid.PaidAt, paid.UpdatedAt);
        var oldPayment = (payment.Id, payment.Amount, payment.Status, payment.PaidAt, payment.UpdatedAt);

        await BaselineBeforeCompensationMigrationAsync(db);
        await db.Database.MigrateAsync();
        db.ChangeTracker.Clear();

        var settings = await new CirculationRepository(db).GetSettingsAsync(default);
        Assert.Equal(20000, settings.DamageFee);
        Assert.Equal(100000, settings.LostFee);
        Assert.Equal(5000, settings.FinePerDay);
        foreach (var id in new[] { current.Id, empty.Id, legacy.Id })
        {
            var parameters = await db.PolicyRuleParameters.Where(item => item.PolicyRuleId == id).ToListAsync();
            Assert.Equal("20000", parameters.Single(item => item.ParamKey == "damage_fee").ParamValue);
            Assert.Equal("100000", parameters.Single(item => item.ParamKey == "lost_book_fee").ParamValue);
            Assert.All(parameters.Where(item => item.ParamKey.Equals("damaged_book_fee", StringComparison.OrdinalIgnoreCase)), item => Assert.Equal("20000", item.ParamValue));
            Assert.All(parameters.Where(item => item.ParamKey == "lost_fee"), item => Assert.Equal("100000", item.ParamValue));
        }
        var ids = excluded.Select(item => item.Id).ToList();
        var untouched = await db.PolicyRuleParameters.Where(item => ids.Contains(item.PolicyRuleId)).ToListAsync();
        Assert.Equal(12, untouched.Count);
        Assert.All(untouched, item => Assert.Equal(item.ParamKey == "damage_fee" ? "7000" : "15000", item.ParamValue));
        pending = await db.Fines.SingleAsync(item => item.Id == pending.Id);
        paid = await db.Fines.SingleAsync(item => item.Id == paid.Id);
        payment = await db.FinePayments.SingleAsync();
        Assert.Equal(oldPending, (pending.Id, pending.Amount, pending.Status, pending.Reason, pending.UpdatedAt));
        Assert.Equal(oldPaid, (paid.Id, paid.Amount, paid.Status, paid.PaidAt, paid.UpdatedAt));
        Assert.Equal(oldPayment, (payment.Id, payment.Amount, payment.Status, payment.PaidAt, payment.UpdatedAt));
        Assert.Equal(15000m, (await db.BookIncidents.SingleAsync()).AssessedFee);
        Assert.Contains(CompensationMigration, await db.Database.GetAppliedMigrationsAsync());
    }

    [BookCodePostgresFact]
    public Task CompensationMigrationPreservesAdminEditsAfterEfThenSqlThenRestart()
        => CheckAdminEditsSurviveBothPathsAsync(sqlFirst: false);

    [BookCodePostgresFact]
    public Task CompensationMigrationPreservesAdminEditsAfterSqlThenEfThenRestart()
        => CheckAdminEditsSurviveBothPathsAsync(sqlFirst: true);

    [BookCodePostgresFact]
    public async Task CompensationMigrationSqlRequiresEarlierEfMigrationsBeforeRecordingItsMarker()
    {
        await using var fixture = await Fixture.CreateAsync();
        await using (var db = fixture.Context())
        {
            var sql = await CompensationSqlAsync();
            var error = await Assert.ThrowsAsync<PostgresException>(() => db.Database.ExecuteSqlRawAsync(sql));
            Assert.Equal("P0001", error.SqlState);
            Assert.Contains("Apply earlier EF migrations", error.MessageText);
        }
        await using var unchanged = fixture.Context();
        var settings = await new CirculationRepository(unchanged).GetSettingsAsync(default);
        Assert.Equal(10000, settings.DamageFee);
        Assert.Equal(200000, settings.LostFee);
        Assert.DoesNotContain(CompensationMigration, await unchanged.Database.GetAppliedMigrationsAsync());
    }

    static PolicyRule FeePolicy(string code) => new()
    {
        Code = code, Name = code, PolicyType = PolicyRuleType.FineFee, Status = PolicyRuleStatus.Active,
        EffectiveFrom = DateTime.UtcNow.AddDays(-1), EffectiveTo = DateTime.UtcNow.AddDays(1)
    };

    static async Task CheckAdminEditsSurviveBothPathsAsync(bool sqlFirst)
    {
        await using var fixture = await Fixture.CreateAsync();
        await using var db = fixture.Context();
        await BaselineBeforeCompensationMigrationAsync(db);
        var sql = await CompensationSqlAsync();
        // Keep the standalone script's data change identical to the startup migration.
        var efSql = Assert.IsType<SqlOperation>(new AlignCompensationFees().UpOperations.Single()).Sql;
        Assert.Contains(efSql.ReplaceLineEndings("\n"), sql.ReplaceLineEndings("\n"));
        if (sqlFirst) await db.Database.ExecuteSqlRawAsync(sql);
        else await db.Database.MigrateAsync();
        var initial = await new CirculationRepository(db).GetSettingsAsync(default);
        Assert.Equal(20000, initial.DamageFee);
        Assert.Equal(100000, initial.LostFee);

        var parameters = await db.PolicyRuleParameters.ToListAsync();
        parameters.Single(item => item.ParamKey == "damage_fee").ParamValue = "35000";
        parameters.Single(item => item.ParamKey == "lost_book_fee").ParamValue = "175000";
        await db.SaveChangesAsync();

        // Reconnect like an API restart, also execute the alternate migration path twice.
        await using var restarted = fixture.Context();
        await restarted.Database.MigrateAsync();
        await restarted.Database.ExecuteSqlRawAsync(sql);
        await restarted.Database.ExecuteSqlRawAsync(sql);
        await restarted.Database.MigrateAsync();
        var edited = await new CirculationRepository(restarted).GetSettingsAsync(default);
        Assert.Equal(35000, edited.DamageFee);
        Assert.Equal(175000, edited.LostFee);
        Assert.Single(await restarted.Database.GetAppliedMigrationsAsync(), item => item == CompensationMigration);
    }

    static async Task BaselineBeforeCompensationMigrationAsync(AppDbContext db)
    {
        // The fixture already creates the current model in its private schema.
        // Only this data migration remains pending, exactly as on an upgraded API.
        await db.Database.ExecuteSqlRawAsync("CREATE TABLE \"__EFMigrationsHistory\" (migration_id varchar(150) PRIMARY KEY, product_version varchar(32) NOT NULL)");
        foreach (var migration in db.Database.GetMigrations().Where(item => item != CompensationMigration))
            await db.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO \"__EFMigrationsHistory\" VALUES ({migration}, {"9.0.2"})");
    }

    static Task<string> CompensationSqlAsync() => File.ReadAllTextAsync(
        Path.Combine(AppContext.BaseDirectory, "Migrations", "00028_align_compensation_fees.sql"));
}
