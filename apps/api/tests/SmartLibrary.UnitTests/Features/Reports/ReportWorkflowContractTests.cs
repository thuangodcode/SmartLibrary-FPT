using System.Text.Json;
using FluentAssertions;
using SmartLibrary.Application.Features.Reports;
using SmartLibrary.Domain.Entities;

namespace SmartLibrary.UnitTests.Features.Reports;

public class ReportWorkflowContractTests
{
    private static readonly JsonSerializerOptions WebJson = new(JsonSerializerDefaults.Web);

    [Fact]
    public void ReportRequestDto_ExposesAssignmentAndLatestReviewFields()
    {
        var reportId = Guid.NewGuid();
        var dto = new ReportRequestDto(
            Guid.NewGuid(), Guid.NewGuid(), "Librarian", Guid.NewGuid(), "Activity", "Activity",
            new DateTime(2026, 10, 1), new DateTime(2026, 11, 1), null, "Pending",
            DateTime.UtcNow, reportId, reportId, "Rejected", "Please correct the category breakdown.");

        using var json = JsonDocument.Parse(JsonSerializer.Serialize(dto, WebJson));
        var root = json.RootElement;

        root.GetProperty("librarianId").GetGuid().Should().Be(dto.LibrarianId);
        root.GetProperty("templateId").GetGuid().Should().Be(dto.TemplateId);
        root.GetProperty("reportType").GetString().Should().Be("Activity");
        root.GetProperty("status").GetString().Should().Be("Pending");
        root.GetProperty("reportId").GetGuid().Should().Be(reportId);
        root.GetProperty("lastReportId").GetGuid().Should().Be(reportId);
        root.GetProperty("lastReportStatus").GetString().Should().Be("Rejected");
        root.GetProperty("lastReviewComment").GetString().Should().Be("Please correct the category breakdown.");
    }

    [Fact]
    public void RejectionPayload_DeserializesExplicitFlagAndReason()
    {
        var request = JsonSerializer.Deserialize<UpdateReportRequest>(
            """{"isRejected":true,"comment":"Please correct the report."}""",
            WebJson);

        request.Should().NotBeNull();
        request!.IsRejected.Should().BeTrue();
        request.Comment.Should().Be("Please correct the report.");
    }

    [Fact]
    public void CreateReportPayload_AcceptsOptionalRequestId()
    {
        var requestId = Guid.NewGuid();
        var request = JsonSerializer.Deserialize<CreateReportRequest>(
            $$"""{"templateId":"{{Guid.NewGuid()}}","format":"CSV","periodStart":"2026-10-01T00:00:00Z","periodEnd":"2026-11-01T00:00:00Z","requestId":"{{requestId}}"}""",
            WebJson);

        request.Should().NotBeNull();
        request!.RequestId.Should().Be(requestId);
    }

    [Fact]
    public void NewReportRequest_DefaultsToPending()
    {
        new ReportRequest().Status.Should().Be("Pending");
    }

    [Fact]
    public void ReportImportSchema_OnlyExposesBorrowAndReturnCountsForLegacyTemplates()
    {
        var schema = ReportImportValidator.ParseSchema(
            """{"metrics":["Borrowed","Returned","Overdue","ReturnedCount"]}""");

        schema.Metrics.Should().Equal("Borrowed", "Returned");
        schema.ExpectedColumnLabels.Should().Contain("Lượt mượn").And.Contain("Lượt trả")
            .And.NotContain("Quá hạn").And.NotContain("Đã trả");
    }
}
