export type ReportMetric = 'Borrowed' | 'Returned' | 'Overdue' | 'ReturnedCount';

export interface TemplateConfigShape {
  period?: string;
  groupBy?: string;
  metrics?: string[];
  formats?: string[];
}

export interface ManualReportRow {
  date: string;
  category: string;
  borrowed: number;
  returned: number;
  overdue: number;
  returnedCount: number;
  notes: string;
}

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

const metricLabels: Record<string, string> = {
  Borrowed: 'Mượn',
  Returned: 'Trả',
  Overdue: 'Quá hạn',
  ReturnedCount: 'Đã trả',
};

const metricHeaderAliases: Record<ReportMetric, string[]> = {
  Borrowed: ['Mượn', 'Borrowed', 'borrowed'],
  Returned: ['Trả', 'Tra', 'Returned', 'returned'],
  Overdue: ['Quá hạn', 'Qua han', 'Overdue', 'overdue'],
  ReturnedCount: ['Đã trả', 'Da tra', 'ReturnedCount', 'returnedCount'],
};

export const parseTemplateConfiguration = (raw?: string | null): TemplateConfigShape | null => {
  if (!raw) return null;
  try {
    let value: unknown = raw;
    while (typeof value === 'string') value = JSON.parse(value);
    return value as TemplateConfigShape;
  } catch {
    return null;
  }
};

export const getTemplateMetrics = (config: TemplateConfigShape | null): ReportMetric[] => {
  const fromConfig = (config?.metrics ?? []).filter((m): m is ReportMetric =>
    ['Borrowed', 'Returned', 'Overdue', 'ReturnedCount'].includes(m),
  );
  return fromConfig.length ? fromConfig : ['Borrowed', 'Returned', 'Overdue', 'ReturnedCount'];
};

export const getExpectedColumnLabels = (config: TemplateConfigShape | null): string[] => {
  const metrics = getTemplateMetrics(config);
  return ['Ngày', 'Nhóm sách', ...metrics.map((m) => metricLabels[m] ?? m)];
};

export const metricLabel = (metric: string) => metricLabels[metric] ?? metric;

export const emptyManualRow = (): ManualReportRow => ({
  date: '',
  category: '',
  borrowed: 0,
  returned: 0,
  overdue: 0,
  returnedCount: 0,
  notes: '',
});

export const manualRowToApi = (row: ManualReportRow, metrics: ReportMetric[]) => ({
  date: row.date ? new Date(row.date).toISOString() : new Date(0).toISOString(),
  category: row.category.trim(),
  borrowed: metrics.includes('Borrowed') ? row.borrowed : 0,
  returned: metrics.includes('Returned') ? row.returned : 0,
  overdue: metrics.includes('Overdue') ? row.overdue : 0,
  returnedCount: metrics.includes('ReturnedCount') ? row.returnedCount : 0,
  notes: row.notes.trim() || null,
});

const normalizeHeader = (value: string) => value.trim().replace(/^\uFEFF/, '').replace(/^"|"$/g, '');

const splitCsvLine = (line: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
};

const findColumnIndex = (headers: string[], aliases: string[]) => {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h.localeCompare(alias, 'vi', { sensitivity: 'accent' }) === 0);
    if (idx >= 0) return idx;
  }
  return -1;
};

const parseDateCell = (raw: string): string | null => {
  const text = raw.trim().replace(/^"|"$/g, '');
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
};

const parseIntCell = (raw: string): number => {
  const text = raw.trim().replace(/^"|"$/g, '');
  if (!text) return 0;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : -1;
};

export const buildSampleCsv = (config: TemplateConfigShape | null): string => {
  const metrics = getTemplateMetrics(config);
  const headers = ['Ngày', 'Nhóm sách', ...metrics.map((m) => metricLabels[m]), 'Ghi chú'];
  const sample = ['01/10/2026', 'Khoa học', ...metrics.map(() => '0'), ''];
  return `\uFEFF${headers.join(',')}\r\n${sample.join(',')}\r\n`;
};

export const parseReportCsv = (
  text: string,
  config: TemplateConfigShape | null,
): { rows: ManualReportRow[]; issues: ImportIssue[] } => {
  const metrics = getTemplateMetrics(config);
  const issues: ImportIssue[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) {
    return { rows: [], issues: [{ row: 0, field: 'file', message: 'File CSV trống.', severity: 'error' }] };
  }

  const headers = splitCsvLine(lines[0]);
  const dateIdx = findColumnIndex(headers, ['Ngày', 'Date', 'date']);
  const categoryIdx = findColumnIndex(headers, ['Nhóm sách', 'Nhom sach', 'Category', 'category']);
  if (dateIdx < 0) issues.push({ row: 0, field: 'Date', message: 'Thiếu cột bắt buộc «Ngày».', severity: 'error' });
  if (categoryIdx < 0) issues.push({ row: 0, field: 'Category', message: 'Thiếu cột bắt buộc «Nhóm sách».', severity: 'error' });

  const metricIdx: Partial<Record<ReportMetric, number>> = {};
  for (const metric of metrics) {
    const idx = findColumnIndex(headers, metricHeaderAliases[metric]);
    if (idx < 0) {
      issues.push({
        row: 0,
        field: metric,
        message: `Thiếu cột bắt buộc «${metricLabels[metric]}» theo mẫu quy định.`,
        severity: 'error',
      });
    } else {
      metricIdx[metric] = idx;
    }
  }

  const notesIdx = findColumnIndex(headers, ['Ghi chú', 'Ghi chu', 'Notes', 'notes']);

  if (issues.some((x) => x.row === 0 && x.severity === 'error')) {
    return { rows: [], issues };
  }

  const rows: ManualReportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.every((c) => !c.trim())) continue;
    const rowNumber = i;
    const dateRaw = dateIdx >= 0 ? cells[dateIdx] ?? '' : '';
    const isoDate = parseDateCell(dateRaw);
    if (!isoDate) {
      issues.push({
        row: rowNumber,
        field: 'Date',
        message: `Dòng ${rowNumber}: Ngày không hợp lệ («${dateRaw.trim()}»). Dùng dd/MM/yyyy.`,
        severity: 'error',
      });
    }

    const category = categoryIdx >= 0 ? (cells[categoryIdx] ?? '').trim().replace(/^"|"$/g, '') : '';
    if (!category) {
      issues.push({ row: rowNumber, field: 'Category', message: `Dòng ${rowNumber}: Thiếu Nhóm sách.`, severity: 'error' });
    }

    const row = emptyManualRow();
    row.date = isoDate ?? '';
    row.category = category;
    for (const metric of metrics) {
      const idx = metricIdx[metric];
      const val = idx !== undefined ? parseIntCell(cells[idx] ?? '') : 0;
      if (val < 0) {
        issues.push({
          row: rowNumber,
          field: metric,
          message: `Dòng ${rowNumber}: ${metricLabels[metric]} phải là số nguyên không âm.`,
          severity: 'error',
        });
      }
      if (metric === 'Borrowed') row.borrowed = Math.max(0, val);
      if (metric === 'Returned') row.returned = Math.max(0, val);
      if (metric === 'Overdue') row.overdue = Math.max(0, val);
      if (metric === 'ReturnedCount') row.returnedCount = Math.max(0, val);
    }
    if (notesIdx >= 0) row.notes = (cells[notesIdx] ?? '').trim().replace(/^"|"$/g, '');
    rows.push(row);
  }

  if (!rows.length) {
    issues.push({ row: 0, field: 'rows', message: 'Không có dòng dữ liệu hợp lệ trong file.', severity: 'error' });
  }

  return { rows, issues };
};

export const validateManualRows = (rows: ManualReportRow[], config: TemplateConfigShape | null): ImportIssue[] => {
  const metrics = getTemplateMetrics(config);
  const issues: ImportIssue[] = [];
  if (!rows.length) {
    issues.push({ row: 0, field: 'rows', message: 'Chưa có dòng dữ liệu.', severity: 'error' });
    return issues;
  }
  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (!row.date) issues.push({ row: rowNumber, field: 'Date', message: `Dòng ${rowNumber}: Thiếu ngày.`, severity: 'error' });
    if (!row.category.trim()) issues.push({ row: rowNumber, field: 'Category', message: `Dòng ${rowNumber}: Thiếu nhóm sách.`, severity: 'error' });
    for (const metric of metrics) {
      const val =
        metric === 'Borrowed'
          ? row.borrowed
          : metric === 'Returned'
            ? row.returned
            : metric === 'Overdue'
              ? row.overdue
              : row.returnedCount;
      if (val < 0 || !Number.isFinite(val)) {
        issues.push({
          row: rowNumber,
          field: metric,
          message: `Dòng ${rowNumber}: ${metricLabels[metric]} không hợp lệ.`,
          severity: 'error',
        });
      }
    }
  });
  return issues;
};

export const isReadyToSubmit = (issues: ImportIssue[]) => !issues.some((x) => x.severity === 'error');
