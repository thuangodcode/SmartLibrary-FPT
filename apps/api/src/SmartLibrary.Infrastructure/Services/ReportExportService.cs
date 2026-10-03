using SmartLibrary.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace SmartLibrary.Infrastructure.Services;

public class ReportExportService : IReportExportService
{
    private readonly ILogger<ReportExportService> _logger;

    public ReportExportService(ILogger<ReportExportService> logger)
    {
        _logger = logger;
    }

    public Task<byte[]> ExportToExcelAsync<T>(IEnumerable<T> data, string sheetName, CancellationToken ct = default)
    {
        _logger.LogInformation("Exporting data to Excel sheet: {SheetName}", sheetName);
        // TODO: Implement using ClosedXML or EPPlus
        return Task.FromResult(Array.Empty<byte>());
    }

    public Task<byte[]> ExportToWordAsync(string templatePath, Dictionary<string, string> placeholders, CancellationToken ct = default)
    {
        _logger.LogInformation("Exporting document from template: {TemplatePath}", templatePath);
        // TODO: Implement using DocumentFormat.OpenXml
        return Task.FromResult(Array.Empty<byte>());
    }
}
