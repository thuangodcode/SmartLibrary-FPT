namespace SmartLibrary.Application.Interfaces;

public interface IReportExportService
{
    Task<byte[]> ExportToExcelAsync<T>(IEnumerable<T> data, string sheetName, CancellationToken ct = default);
    Task<byte[]> ExportToWordAsync(string templatePath, Dictionary<string, string> placeholders, CancellationToken ct = default);
}
