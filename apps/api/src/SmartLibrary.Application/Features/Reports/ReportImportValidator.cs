using System.Globalization;
using System.Text.Json;

namespace SmartLibrary.Application.Features.Reports;

public static class ReportImportValidator
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private static readonly Dictionary<string, string[]> MetricHeaderAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Borrowed"] = ["Lượt mượn", "Mượn", "Borrowed", "borrowed", "So muon"],
        ["Returned"] = ["Lượt trả", "Trả", "Tra", "Returned", "returned", "So tra"],
    };

    private static readonly string[][] DateHeaders = [["Ngày", "Ngay", "Date", "date"]];
    private static readonly string[][] CategoryHeaders = [["Nhóm sách", "Nhom sach", "Category", "category", "Danh mục"]];
    private static readonly string[][] NotesHeaders = [["Ghi chú", "Ghi chu", "Notes", "notes"]];

    public static TemplateImportSchema ParseSchema(string? configurationJson)
    {
        var metrics = new List<string> { "Borrowed", "Returned" };
        try
        {
            if (!string.IsNullOrWhiteSpace(configurationJson))
            {
                using var doc = JsonDocument.Parse(configurationJson);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.String)
                {
                    var inner = root.GetString();
                    if (!string.IsNullOrWhiteSpace(inner))
                    {
                        using var innerDoc = JsonDocument.Parse(inner);
                        metrics = ReadMetrics(innerDoc.RootElement, metrics);
                    }
                }
                else if (root.ValueKind == JsonValueKind.Object)
                {
                    metrics = ReadMetrics(root, metrics);
                }
            }
        }
        catch
        {
            // keep defaults
        }

        metrics = metrics.Where(metric => metric is "Borrowed" or "Returned").Distinct().ToList();
        if (metrics.Count == 0)
            metrics = ["Borrowed", "Returned"];

        var columns = new List<ExpectedColumnDto>
        {
            new("Date", "Ngày", true, DateHeaders.SelectMany(x => x).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()),
            new("Category", "Nhóm sách", true, CategoryHeaders.SelectMany(x => x).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()),
        };

        foreach (var metric in metrics)
        {
            if (!MetricHeaderAliases.TryGetValue(metric, out var aliases)) continue;
            columns.Add(new ExpectedColumnDto(metric, MetricLabel(metric), true, aliases));
        }

        columns.Add(new ExpectedColumnDto("Notes", "Ghi chú", false, NotesHeaders.SelectMany(x => x).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()));
        return new TemplateImportSchema(metrics, columns);
    }

    public static ValidateReportRowsResult Validate(Guid templateId, string? configurationJson, IReadOnlyList<ReportRowDto>? rows)
    {
        var schema = ParseSchema(configurationJson);
        var issues = new List<ReportImportIssueDto>();
        var rowList = rows ?? [];

        if (rowList.Count == 0)
        {
            issues.Add(new ReportImportIssueDto(0, "rows", "File hoặc bảng nhập liệu chưa có dòng dữ liệu nào.", "error"));
            return new ValidateReportRowsResult(false, issues, schema.ExpectedColumnLabels, 0, templateId);
        }

        var validRows = 0;
        for (var i = 0; i < rowList.Count; i++)
        {
            var rowNumber = i + 1;
            var row = rowList[i];
            var rowValid = true;

            if (row.Date == default)
            {
                issues.Add(new ReportImportIssueDto(rowNumber, "Date", "Thiếu hoặc sai định dạng cột Ngày (dd/MM/yyyy hoặc yyyy-MM-dd).", "error"));
                rowValid = false;
            }

            if (string.IsNullOrWhiteSpace(row.Category))
            {
                issues.Add(new ReportImportIssueDto(rowNumber, "Category", "Thiếu Nhóm sách / Danh mục.", "error"));
                rowValid = false;
            }

            foreach (var metric in schema.Metrics)
            {
                var value = MetricValue(row, metric);
                if (value < 0)
                {
                    issues.Add(new ReportImportIssueDto(rowNumber, metric, $"{MetricLabel(metric)} không được âm.", "error"));
                    rowValid = false;
                }
            }

            if (rowValid) validRows++;
        }

        var ready = issues.Count == 0 && validRows > 0;
        return new ValidateReportRowsResult(ready, issues, schema.ExpectedColumnLabels, validRows, templateId);
    }

    public static ValidateReportRowsResult ValidateCsvHeaders(Guid templateId, string? configurationJson, IReadOnlyList<string> headers)
    {
        var schema = ParseSchema(configurationJson);
        var issues = new List<ReportImportIssueDto>();
        var normalized = headers.Select(NormalizeHeader).Where(x => x.Length > 0).ToList();

        foreach (var column in schema.Columns.Where(x => x.Required))
        {
            if (!column.Aliases.Any(alias => normalized.Contains(NormalizeHeader(alias), StringComparer.OrdinalIgnoreCase)))
            {
                issues.Add(new ReportImportIssueDto(0, column.Key,
                    $"Thiếu cột bắt buộc «{column.Label}» (chấp nhận: {string.Join(", ", column.Aliases.Take(4))}).", "error"));
            }
        }

        var ready = issues.Count == 0;
        return new ValidateReportRowsResult(ready, issues, schema.ExpectedColumnLabels, 0, templateId);
    }

    private static List<string> ReadMetrics(JsonElement root, List<string> defaults)
    {
        if (root.TryGetProperty("metrics", out var metrics) && metrics.ValueKind == JsonValueKind.Array)
        {
            var parsed = metrics.EnumerateArray()
                .Where(x => x.ValueKind == JsonValueKind.String)
                .Select(x => x.GetString())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();
            if (parsed.Count > 0) return parsed;
        }
        return defaults;
    }

    private static int MetricValue(ReportRowDto row, string metric) => metric switch
    {
        "Borrowed" => row.Borrowed,
        "Returned" => row.Returned,
        _ => 0,
    };

    private static string MetricLabel(string metric) => metric switch
    {
        "Borrowed" => "Lượt mượn",
        "Returned" => "Lượt trả",
        _ => metric,
    };

    public static string NormalizeHeader(string value) => value.Trim().Trim('\uFEFF', '"', ' ');

    public static bool TryParseDate(string raw, out DateTime date)
    {
        var text = raw.Trim().Trim('"');
        if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out date))
            return true;
        if (DateTime.TryParseExact(text, ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"], CultureInfo.InvariantCulture, DateTimeStyles.None, out date))
            return true;
        return DateTime.TryParse(text, new CultureInfo("vi-VN"), DateTimeStyles.None, out date);
    }

    public static int ParseInt(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 0;
        var text = raw.Trim().Trim('"');
        return int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) ? value : -1;
    }
}

public sealed record ExpectedColumnDto(string Key, string Label, bool Required, IReadOnlyList<string> Aliases);

public sealed record TemplateImportSchema(IReadOnlyList<string> Metrics, IReadOnlyList<ExpectedColumnDto> Columns)
{
    public IReadOnlyList<string> ExpectedColumnLabels => Columns.Where(x => x.Required).Select(x => x.Label).ToList();
}

public sealed record ReportImportIssueDto(int Row, string Field, string Message, string Severity);

public sealed record ValidateReportRowsRequest(Guid TemplateId, IReadOnlyList<ReportRowDto>? Rows);

public sealed record ValidateReportRowsResult(bool IsReady, IReadOnlyList<ReportImportIssueDto> Issues, IReadOnlyList<string> ExpectedColumns, int ValidRowCount, Guid TemplateId);
