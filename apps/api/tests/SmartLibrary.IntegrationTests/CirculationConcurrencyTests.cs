namespace SmartLibrary.IntegrationTests;

/// <summary>
/// Concurrent circulation invariants must be proven on PostgreSQL, not with mocks.
/// These tests stay skipped until a dedicated non-production database is configured.
/// Do not point them at production/Supabase without an isolated dataset.
/// </summary>
public class CirculationConcurrencyTests
{
    [Fact(Skip = "Chưa có PostgreSQL kiểm thử riêng. Bật sau khi có database non-production; không chạy trên production.")]
    public void ConcurrentApprove_SameCopy_AtMostOneSuccess()
    {
    }

    [Fact(Skip = "Chưa có PostgreSQL kiểm thử riêng. Bật sau khi có database non-production; không chạy trên production.")]
    public void ConcurrentExpireAndReady_SameQueue_AtMostOneReaderReady()
    {
    }

    [Fact(Skip = "Chưa có PostgreSQL kiểm thử riêng. Bật sau khi có database non-production; không chạy trên production.")]
    public void ConcurrentConfirmIncident_AtMostOneCompensationFine()
    {
    }
}
