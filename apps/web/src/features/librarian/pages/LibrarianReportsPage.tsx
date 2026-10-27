import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownToLine,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileWarning,
  Filter,
  Info,
  LoaderCircle,
  PenLine,
  Plus,
  Search,
  Send,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  buildSampleCsv,
  emptyManualRow,
  getExpectedColumnLabels,
  getTemplateMetrics,
  isReadyToSubmit,
  manualRowToApi,
  parseReportCsv,
  parseTemplateConfiguration,
  validateManualRows,
  type ImportIssue,
  type ManualReportRow,
} from '../../reports/reportTemplateUtils';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './LibrarianReportsPage.css';
import './LibrarianReportStatus.css';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface Template {
  id: string;
  name: string;
  reportType: string;
  description: string | null;
  configuration: string;
  isEnabled: boolean;
  createdAt: string;
}

interface ReportItem {
  id: string;
  code: string;
  name: string;
  submitter: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  format: string;
  status: string;
  isViewed: boolean;
  isApproved: boolean;
  isRejected?: boolean;
}

interface ReportList {
  items: ReportItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ReportRequest {
  id: string;
  librarianId: string;
  librarianName: string;
  templateId: string;
  templateName: string;
  reportType: string;
  periodStart: string;
  periodEnd: string;
  name: string;
  status: string;
  createdAt: string;
  reportId?: string | null;
  lastReportStatus?: string | null;
  lastReviewComment?: string | null;
}

type CreateMode = 'auto' | 'manual' | 'import';

const formatDate = (val: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(val));
  } catch {
    return val;
  }
};

const formatDateTime = (val: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date(val));
  } catch {
    return val;
  }
};

const toDateInput = (value: string, exclusiveEnd = false) => {
  const date = new Date(value);
  if (exclusiveEnd) date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const LibrarianReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const requestId = new URLSearchParams(location.search).get('requestId');
  const token = useAuthStore((state) => state.accessToken);
  const createModalOpen = location.pathname.endsWith('/reports/new');

  // Data states
  const [templates, setTemplates] = useState<Template[]>([]);
  const [requests, setRequests] = useState<ReportRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(true);
  const [reports, setReports] = useState<ReportList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createMode, setCreateMode] = useState<CreateMode>('auto');
  const [manualRows, setManualRows] = useState<ManualReportRow[]>([emptyManualRow()]);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importReady, setImportReady] = useState(false);

  // Create Report Form states
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [reportName, setReportName] = useState('');
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [format, setFormat] = useState('CSV');
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load Templates
  const loadTemplates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/librarian/reports/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await parseApiResponse<ApiEnvelope<Template[]>>(res);
      if (!res.ok || !data?.success || !data.data) {
        throw new Error(data?.error || `Không tải được mẫu báo cáo (HTTP ${res.status}).`);
      }
      setTemplates(data.data);
      if (data.data.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(data.data[0].id);
      }
    } catch (caught) {
      setToastMessage(caught instanceof Error ? caught.message : 'Không tải được danh sách mẫu báo cáo.');
    }
  }, [token, selectedTemplateId]);

  const loadRequests = useCallback(async () => {
    if (!token) {
      setRequestLoading(false);
      return;
    }
    setRequestLoading(true);
    setRequestError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/librarian/reports/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<ApiEnvelope<ReportRequest[]>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không tải được yêu cầu báo cáo.');
      }
      setRequests(result.data);
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Không tải được yêu cầu báo cáo.');
    } finally {
      setRequestLoading(false);
    }
  }, [token]);

  // Load Reports
  const loadReports = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '10',
      });
      if (search.trim()) params.set('search', search.trim());
      if (monthFilter) params.set('month', monthFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`${API_BASE_URL}/api/librarian/reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<ApiEnvelope<ReportList>>(res);
      if (!res.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không tải được danh sách báo cáo.');
      }
      setReports(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tải danh sách.');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, monthFilter, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTemplates();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTemplates]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadReports();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [loadReports]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRequests(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  // Auto-generate name when template or date changes
  const activeTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId],
  );

  const activeRequest = useMemo(
    () => requests.find((request) => request.id === requestId),
    [requests, requestId],
  );

  useEffect(() => {
    if (!activeRequest) return;
    const timer = window.setTimeout(() => {
      setSelectedTemplateId(activeRequest.templateId);
      setReportName(activeRequest.name || activeRequest.templateName);
      setPeriodStart(toDateInput(activeRequest.periodStart));
      setPeriodEnd(toDateInput(activeRequest.periodEnd, true));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeRequest]);

  const activeTemplateConfig = useMemo(
    () => parseTemplateConfiguration(activeTemplate?.configuration),
    [activeTemplate?.configuration],
  );

  const templateMetrics = useMemo(() => getTemplateMetrics(activeTemplateConfig), [activeTemplateConfig]);

  const expectedColumns = useMemo(
    () => getExpectedColumnLabels(activeTemplateConfig),
    [activeTemplateConfig],
  );

  const manualValidationIssues = useMemo(
    () => (createMode === 'manual' ? validateManualRows(manualRows, activeTemplateConfig) : []),
    [createMode, manualRows, activeTemplateConfig],
  );

  const canSubmitManual = createMode !== 'manual' || isReadyToSubmit(manualValidationIssues);
  const canSubmitImport = createMode !== 'import' || importReady;
  const requestedRequestUnavailable = Boolean(requestId && !requestLoading && (!activeRequest || activeRequest.status === 'Submitted'));

  useEffect(() => {
    if (activeTemplate) {
      if (activeRequest?.templateId === activeTemplate.id) {
        const timer = window.setTimeout(() => setReportName(activeRequest.name || activeRequest.templateName), 0);
        return () => window.clearTimeout(timer);
      }
      const now = new Date();
      const timer = window.setTimeout(() => {
        setReportName(`${activeTemplate.name} - T${now.getMonth() + 1}/${now.getFullYear()}`);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [activeTemplate, activeRequest]);

  // KPI Calculations
  const stats = useMemo(() => {
    const items = reports?.items ?? [];
    const total = reports?.totalCount ?? 0;
    const approved = items.filter((x) => x.isApproved).length;
    const viewed = items.filter((x) => x.isViewed && !x.isApproved).length;
    const pending = items.filter((x) => !x.isViewed && !x.isApproved).length;
    return { total, approved, viewed, pending, templateCount: templates.length };
  }, [reports, templates]);

  const resetCreateForm = () => {
    setCreateMode('auto');
    setManualRows([emptyManualRow()]);
    setImportIssues([]);
    setImportFileName(null);
    setImportReady(false);
  };

  const openCreateModal = () => {
    resetCreateForm();
    navigate('/librarian/reports/new');
  };

  const syncServerValidation = async (rows: ManualReportRow[]) => {
    if (!token || !selectedTemplateId) return false;
    const apiRows = rows.map((r) => manualRowToApi(r, templateMetrics));
    try {
      const res = await fetch(`${API_BASE_URL}/api/librarian/reports/validate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplateId, rows: apiRows }),
      });
      const result = await parseApiResponse<
        ApiEnvelope<{ isReady: boolean; issues: { row: number; field: string; message: string; severity: string }[] }>
      >(res);
      if (!res.ok || !result?.success || !result.data) {
        setImportReady(false);
        setToastMessage(result?.error || `Không kiểm tra được dữ liệu (HTTP ${res.status}).`);
        return false;
      }
      const issues: ImportIssue[] = (result.data.issues ?? []).map((x) => ({
        row: x.row,
        field: x.field,
        message: x.message,
        severity: x.severity === 'warning' ? 'warning' : 'error',
      }));
      setImportIssues(issues);
      setImportReady(result.data.isReady);
      return result.data.isReady;
    } catch (caught) {
      setImportReady(false);
      setToastMessage(caught instanceof Error ? caught.message : 'Không kết nối được để kiểm tra dữ liệu.');
      return false;
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    setImportFileName(file.name);
    setImportReady(false);
    setImportIssues([]);
    setManualRows([]);
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setImportIssues([{ row: 0, field: 'file', message: 'Vui lòng chọn file có định dạng CSV.', severity: 'error' }]);
      return;
    }
    try {
      const text = await file.text();
      const { rows, issues } = parseReportCsv(text, activeTemplateConfig);
      setImportIssues(issues);
      if (!isReadyToSubmit(issues)) {
        setManualRows([]);
        return;
      }
      setManualRows(rows);
      await syncServerValidation(rows);
    } catch (caught) {
      setImportReady(false);
      setImportIssues([{ row: 0, field: 'file', message: caught instanceof Error ? `Không đọc được file CSV: ${caught.message}` : 'Không đọc được file CSV.', severity: 'error' }]);
    }
  };

  const downloadSampleCsv = () => {
    const blob = new Blob([buildSampleCsv(activeTemplateConfig)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mau-bao-cao-${activeTemplate?.name ?? 'template'}.csv`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTemplateId) return;
    if (requestId && requestedRequestUnavailable) {
      setToastMessage('Yêu cầu này không còn khả dụng hoặc không được giao cho tài khoản của bạn.');
      return;
    }

    if (!periodStart || !periodEnd) {
      setToastMessage('Vui lòng chọn ngày bắt đầu và kết thúc kỳ báo cáo.');
      return;
    }

    if (new Date(periodEnd) <= new Date(periodStart)) {
      setToastMessage('Ngày kết thúc phải lớn hơn ngày bắt đầu kỳ báo cáo.');
      return;
    }

    if (createMode === 'manual' && !isReadyToSubmit(manualValidationIssues)) {
      setToastMessage('Dữ liệu nhập tay chưa đạt chuẩn mẫu. Vui lòng sửa các cảnh báo bên dưới.');
      return;
    }

    if (createMode === 'import' && !importReady) {
      setToastMessage('File import chưa hợp lệ hoặc chưa được xác nhận sẵn sàng nộp.');
      return;
    }

    setSubmitting(true);
    try {
      const useCustomRows = createMode === 'manual' || createMode === 'import';
      let customRows: ReturnType<typeof manualRowToApi>[] | undefined;
      if (useCustomRows) {
        customRows = manualRows.map((r) => manualRowToApi(r, templateMetrics));
        const ok = await syncServerValidation(manualRows);
        if (!ok) {
          setToastMessage('Máy chủ từ chối dữ liệu — kiểm tra lại các trường theo mẫu quy định.');
          return;
        }
      }

      const payload = {
        templateId: selectedTemplateId,
        name: reportName.trim() || undefined,
        format,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000).toISOString(),
        customRows,
        ...(activeRequest ? { requestId: activeRequest.id } : {}),
      };

      const res = await fetch(`${API_BASE_URL}/api/librarian/reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await parseApiResponse<ApiEnvelope<{ id: string }>>(res);
      if (!res.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể tạo báo cáo.');
      }

      setToastMessage('Đã gửi báo cáo thành công tới Quản trị viên (Admin)!');
      resetCreateForm();
      await loadReports();
      await loadRequests();
      navigate(`/librarian/reports/${result.data.id}`);
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Lỗi khi gửi báo cáo.');
    } finally {
      setSubmitting(false);
    }
  };

  // Download CSV
  const handleDownloadCsv = async (id: string, code: string) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/librarian/reports/${id}/export?format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setToastMessage('Không thể xuất file CSV.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${code}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setToastMessage('Lỗi khi tải file báo cáo.');
    }
  };

  return (
    <div className={`lib-reports-page${createModalOpen ? ' lib-reports-page-create' : ''}`}>
      {/* ── Header ── */}
      <header className="lib-reports-header">
        <div>
          <div className="lib-reports-eyebrow">
            <ChartNoAxesCombined size={14} />
            <span>KHÔNG GIAN THỦ THƯ • THỐNG KÊ & BÁO CÁO</span>
          </div>
          <h1>Quản lý báo cáo</h1>
          <p>Lập báo cáo định kỳ theo mẫu chuẩn quy định và gửi Admin xét duyệt, theo dõi phản hồi.</p>
        </div>
        <div className="lib-reports-actions">
          <button
            type="button"
            className="lib-btn lib-btn-primary"
            onClick={openCreateModal}
          >
            <Plus size={16} /> Lập &amp; gửi báo cáo mới
          </button>
        </div>
      </header>

      {/* ── KPI Cards ── */}
      <section className="lib-reports-kpis" aria-label="Tổng quan báo cáo">
        <article className="lib-kpi-card">
          <div className="lib-kpi-top">
            <span className="lib-kpi-icon orange"><FileText size={19} /></span>
          </div>
          <div>
            <h3 className="lib-kpi-value">{stats.total}</h3>
            <p className="lib-kpi-label">Tổng báo cáo đã gửi</p>
            <p className="lib-kpi-note">Lưu trữ trên hệ thống</p>
          </div>
        </article>

        <article className="lib-kpi-card">
          <div className="lib-kpi-top">
            <span className="lib-kpi-icon green"><CheckCircle2 size={19} /></span>
          </div>
          <div>
            <h3 className="lib-kpi-value">{stats.approved}</h3>
            <p className="lib-kpi-label">Báo cáo đã duyệt</p>
            <p className="lib-kpi-note">Admin đã phê duyệt chính thức</p>
          </div>
        </article>

        <article className="lib-kpi-card">
          <div className="lib-kpi-top">
            <span className="lib-kpi-icon blue"><Clock size={19} /></span>
          </div>
          <div>
            <h3 className="lib-kpi-value">{stats.viewed + stats.pending}</h3>
            <p className="lib-kpi-label">Đang chờ xử lý</p>
            <p className="lib-kpi-note">{stats.viewed} đã xem · {stats.pending} mới gửi</p>
          </div>
        </article>

        <article className="lib-kpi-card">
          <div className="lib-kpi-top">
            <span className="lib-kpi-icon purple"><FileSpreadsheet size={19} /></span>
          </div>
          <div>
            <h3 className="lib-kpi-value">{templates.length}</h3>
            <p className="lib-kpi-label">Mẫu báo cáo quy định</p>
            <p className="lib-kpi-note">Do Admin ban hành cấu hình</p>
          </div>
        </article>
      </section>

      <section className="lib-reports-panel lib-report-requests-panel">
        <div className="lib-panel-header">
          <div className="lib-panel-header-copy">
            <span>YÊU CẦU TỪ ADMIN</span>
            <h2>Báo cáo được giao cho bạn</h2>
          </div>
          <span className="lib-request-count"><ClipboardList size={15}/>{requests.filter((request) => request.status !== 'Submitted').length} yêu cầu cần nộp</span>
        </div>
        {requestError ? (
          <div className="lib-data-notice lib-request-error" role="alert"><AlertCircle size={16}/><span>{requestError}</span><button type="button" onClick={() => void loadRequests()}>Thử lại</button></div>
        ) : requestLoading ? (
          <div className="lib-request-empty"><LoaderCircle size={22} className="lib-spin"/><span>Đang tải yêu cầu được giao…</span></div>
        ) : requests.length ? (
          <div className="lib-report-request-list">
            {requests.map((request) => (
              <article key={request.id}>
                <div className="lib-request-copy">
                  <strong>{request.name || request.templateName}</strong>
                  <span>{request.reportType} · {request.templateName}</span>
                </div>
                <div className="lib-request-period">
                  <strong>{formatDate(request.periodStart)} – {formatDate(new Date(new Date(request.periodEnd).getTime() - 86400000).toISOString())}</strong>
                  <span>Kỳ báo cáo được yêu cầu</span>
                </div>
                {request.lastReviewComment && request.lastReportStatus === 'Rejected' && (
                  <p className="lib-request-feedback"><strong>Admin yêu cầu chỉnh sửa:</strong> {request.lastReviewComment}</p>
                )}
                <div className="lib-request-statuses" aria-label="Trạng thái báo cáo">
                  {request.lastReportStatus === 'Approved' ? (
                    <span className="lib-request-status is-approved"><CheckCircle2 size={13}/>Đã duyệt</span>
                  ) : request.status === 'Submitted' ? (
                    <>
                      <span className="lib-request-status is-submitted"><Send size={13}/>Đã gửi</span>
                      <span className={`lib-request-status is-review${request.lastReportStatus === 'Rejected' ? ' is-rejected' : ''}`}>
                        {request.lastReportStatus === 'Rejected' ? <AlertCircle size={13}/> : <Clock size={13}/>}
                        {request.lastReportStatus === 'Rejected' ? 'Cần nộp lại' : 'Chờ duyệt'}
                      </span>
                    </>
                  ) : (
                    <span className="lib-request-status is-waiting"><Clock size={13}/>{request.lastReportStatus === 'Rejected' ? 'Cần nộp lại' : 'Chờ gửi'}</span>
                  )}
                </div>
                {request.status === 'Submitted'
                  ? request.reportId && <Link className="lib-request-action secondary" to={`/librarian/reports/${request.reportId}`}><Eye size={15}/> Xem báo cáo đã gửi</Link>
                  : <button type="button" className="lib-request-action" onClick={() => navigate(`/librarian/reports/new?requestId=${request.id}`)}><Send size={15}/>{request.lastReportStatus === 'Rejected' ? 'Chỉnh sửa & nộp lại' : 'Lập báo cáo'}</button>}
              </article>
            ))}
          </div>
        ) : (
          <div className="lib-request-empty"><ClipboardList size={22}/><strong>Chưa có yêu cầu mới từ Admin</strong><span>Các yêu cầu được giao cho bạn sẽ hiển thị tại đây.</span></div>
        )}
      </section>

      {/* ── Main Panel: List of Reports ── */}
      <section className="lib-reports-panel">
        <div className="lib-panel-header">
          <div className="lib-panel-header-copy">
            <span>DANH SÁCH LƯU TRỮ</span>
            <h2>Báo cáo đã gửi tới Quản trị viên</h2>
          </div>
        </div>

        {/* Filters */}
        <div className="lib-reports-filters">
          <label className="lib-filter-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Tìm theo tên báo cáo hoặc mã RPT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="lib-filter-select">
            <CalendarDays size={15} />
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              title="Lọc theo tháng"
            />
          </label>

          <label className="lib-filter-select">
            <Filter size={15} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="Ready">Sẵn sàng</option>
              <option value="Processing">Đang xử lý</option>
              <option value="Error">Lỗi</option>
            </select>
          </label>
        </div>

        {/* Error notification */}
        {error && (
          <div className="lib-data-notice" style={{ background: '#fff2f0', borderColor: '#f7ccc7', color: '#b93a32' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Table */}
        <div className="lib-table-wrap">
          <table className="lib-table">
            <thead>
              <tr>
                <th>Mã báo cáo</th>
                <th>Tên báo cáo &amp; người gửi</th>
                <th>Kỳ báo cáo</th>
                <th>Ngày gửi</th>
                <th>Trạng thái duyệt</th>
                <th>Định dạng</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="lib-table-empty">
                    <LoaderCircle size={24} className="lib-spin" style={{ margin: '0 auto', color: '#eb753c' }} />
                    <p style={{ marginTop: 8 }}>Đang tải danh sách báo cáo…</p>
                  </td>
                </tr>
              ) : reports?.items.length ? (
                reports.items.map((item) => (
                  <tr
                    key={item.id}
                    className="lib-report-row-clickable"
                    onClick={() => navigate(`/librarian/reports/${item.id}`)}
                  >
                    <td>
                      <code style={{ fontSize: 11, fontWeight: 700, color: '#39465c' }}>{item.code}</code>
                    </td>
                    <td className="lib-report-name-col">
                      <Link to={`/librarian/reports/${item.id}`} onClick={(e) => e.stopPropagation()}>
                        <strong>{item.name}</strong>
                      </Link>
                      <small>Người gửi: {item.submitter}</small>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: '#687588' }}>
                        {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, color: '#445166' }}>
                        {formatDateTime(item.createdAt)}
                      </span>
                    </td>
                    <td>
                      {item.isApproved ? (
                        <span className="lib-status-badge approved">
                          <CheckCircle2 size={12} /> Đã duyệt
                        </span>
                      ) : item.isRejected || item.status === 'Rejected' ? (
                        <span className="lib-status-badge rejected">
                          <AlertCircle size={12} /> Cần chỉnh sửa
                        </span>
                      ) : item.isViewed ? (
                        <span className="lib-status-badge viewed">
                          <Eye size={12} /> Đã xem
                        </span>
                      ) : (
                        <span className="lib-status-badge pending">
                          <Clock size={12} /> Chờ duyệt
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ padding: '3px 8px', borderRadius: 4, background: '#f1f4f9', fontSize: 10, fontWeight: 700, color: '#57677e' }}>
                        {item.format}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="lib-row-actions">
                        <Link
                          to={`/librarian/reports/${item.id}`}
                          className="lib-icon-btn primary"
                          title="Xem chi tiết &amp; phản hồi từ Admin"
                        >
                          <Eye size={15} />
                        </Link>
                        <button
                          type="button"
                          className="lib-icon-btn"
                          title="Tải snapshot CSV"
                          onClick={() => void handleDownloadCsv(item.id, item.code)}
                        >
                          <ArrowDownToLine size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="lib-table-empty">
                    <FileText size={32} style={{ color: '#c5cdd8', margin: '0 auto' }} />
                    <h3>Chưa có báo cáo nào</h3>
                    <p>Nhấp vào nút "Lập &amp; gửi báo cáo mới" ở phía trên để tạo báo cáo theo mẫu quy định của Admin.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {reports && reports.totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 11, color: '#8893a4' }}>
            <span>Trang {reports.page} / {reports.totalPages} (Tổng {reports.totalCount} báo cáo)</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="lib-btn lib-btn-secondary"
                style={{ padding: '6px 10px' }}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} /> Trước
              </button>
              <button
                type="button"
                className="lib-btn lib-btn-secondary"
                style={{ padding: '6px 10px' }}
                disabled={page >= reports.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Sau <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Trang: Tạo & gửi báo cáo mới cho Admin ── */}
      {createModalOpen && (
        <main className="lib-create-page">
          <div className="lib-create-page-card">
            <header className="lib-modal-header">
              <div>
                <h2>Lập &amp; gửi báo cáo cho Admin</h2>
                <p>Hệ thống tự động kết xuất số liệu thực tế tại thời điểm gửi theo mẫu bạn chọn.</p>
              </div>
              <button
                type="button"
                className="lib-modal-close"
                onClick={() => navigate('/librarian/reports')}
                aria-label="Quay lại danh sách báo cáo"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleCreateReport}>
              <div className="lib-modal-body">
                {/* Select Template */}
                <div className="lib-form-group">
                  <label htmlFor="lib-template-select">
                    Mẫu báo cáo quy định <span>*</span>
                  </label>
                  <select
                    id="lib-template-select"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={Boolean(activeRequest)}
                    required
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.reportType})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Info Card */}
                {activeTemplate && (
                  <div className="lib-template-info-box">
                    <strong>Thông tin mẫu quy định:</strong>
                    <span>{activeTemplate.description || 'Không có mô tả chi tiết.'}</span>
                    <span className="lib-template-columns">
                      Cột bắt buộc: {expectedColumns.join(' · ')}
                    </span>
                    <button type="button" className="lib-sample-csv-button" onClick={downloadSampleCsv}>
                      <ArrowDownToLine size={15}/> Tải file CSV mẫu (có dòng Tổng)
                    </button>
                  </div>
                )}
                {activeRequest && (
                  <div className="lib-request-form-banner" role="status">
                    <ClipboardList size={18}/>
                    <div><strong>Đang thực hiện yêu cầu từ Admin</strong><span>{activeRequest.name || activeRequest.templateName} · kỳ {formatDate(activeRequest.periodStart)} – {formatDate(new Date(new Date(activeRequest.periodEnd).getTime() - 86400000).toISOString())}</span></div>
                  </div>
                )}
                {activeRequest && !activeTemplate && (
                  <div className="lib-data-notice lib-request-invalid" role="alert">
                    <AlertCircle size={17}/><span>Mẫu “{activeRequest.templateName}” hiện không khả dụng. Vui lòng báo Admin bật lại mẫu trước khi nộp báo cáo.</span>
                  </div>
                )}
                {requestId && requestLoading && (
                  <div className="lib-request-form-banner" role="status"><LoaderCircle size={18} className="lib-spin"/><div><strong>Đang xác minh yêu cầu</strong><span>Đang tải yêu cầu được Admin giao cho bạn…</span></div></div>
                )}
                {requestId && requestError && (
                  <div className="lib-data-notice lib-request-invalid" role="alert">
                    <AlertCircle size={17}/><span>Không thể xác minh yêu cầu: {requestError}</span><button type="button" onClick={() => void loadRequests()}>Thử lại</button>
                  </div>
                )}
                {requestId && requestedRequestUnavailable && !requestError && (
                  <div className="lib-data-notice lib-request-invalid" role="alert">
                    <AlertCircle size={17}/><span>Không tìm thấy yêu cầu đang chờ được giao cho tài khoản của bạn. Không thể nộp báo cáo theo yêu cầu này.</span>
                  </div>
                )}

                <div className="lib-create-mode-tabs" role="tablist" aria-label="Cách lập báo cáo">
                  <button
                    type="button"
                    className={createMode === 'auto' ? 'active' : ''}
                    onClick={() => setCreateMode('auto')}
                  >
                    Tự động từ hệ thống
                  </button>
                  <button
                    type="button"
                    className={createMode === 'manual' ? 'active' : ''}
                    onClick={() => setCreateMode('manual')}
                  >
                    <PenLine size={14} /> Nhập tay
                  </button>
                  <button
                    type="button"
                    className={createMode === 'import' ? 'active' : ''}
                    onClick={() => setCreateMode('import')}
                  >
                    <UploadCloud size={14} /> Import CSV
                  </button>
                </div>

                {createMode === 'manual' && (
                  <div className="lib-manual-entry">
                    <div className="lib-manual-toolbar">
                      <strong>Bảng nhập liệu theo mẫu</strong>
                      <button
                        type="button"
                        className="lib-btn lib-btn-secondary"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                        onClick={() => setManualRows((rows) => [...rows, emptyManualRow()])}
                      >
                        <Plus size={13} /> Thêm dòng
                      </button>
                    </div>
                    <div className="lib-table-wrap lib-manual-table-wrap">
                      <table className="lib-table">
                        <thead>
                          <tr>
                            <th>Ngày</th>
                            <th>Nhóm sách</th>
                            {templateMetrics.includes('Borrowed') && <th>Lượt mượn</th>}
                            {templateMetrics.includes('Returned') && <th>Lượt trả</th>}
                            <th>Ghi chú</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {manualRows.map((row, idx) => (
                            <tr key={idx}>
                              <td>
                                <input
                                  type="date"
                                  value={row.date}
                                  onChange={(e) =>
                                    setManualRows((rows) =>
                                      rows.map((r, i) => (i === idx ? { ...r, date: e.target.value } : r)),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={row.category}
                                  placeholder="VD: Khoa học"
                                  onChange={(e) =>
                                    setManualRows((rows) =>
                                      rows.map((r, i) => (i === idx ? { ...r, category: e.target.value } : r)),
                                    )
                                  }
                                />
                              </td>
                              {templateMetrics.includes('Borrowed') && (
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.borrowed}
                                    onChange={(e) =>
                                      setManualRows((rows) =>
                                        rows.map((r, i) =>
                                          i === idx ? { ...r, borrowed: Number(e.target.value) || 0 } : r,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              )}
                              {templateMetrics.includes('Returned') && (
                                <td>
                                  <input
                                    type="number"
                                    min={0}
                                    value={row.returned}
                                    onChange={(e) =>
                                      setManualRows((rows) =>
                                        rows.map((r, i) =>
                                          i === idx ? { ...r, returned: Number(e.target.value) || 0 } : r,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              )}
                              <td>
                                <input
                                  type="text"
                                  value={row.notes}
                                  onChange={(e) =>
                                    setManualRows((rows) =>
                                      rows.map((r, i) => (i === idx ? { ...r, notes: e.target.value } : r)),
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="lib-icon-btn"
                                  aria-label="Xóa dòng"
                                  disabled={manualRows.length <= 1}
                                  onClick={() => setManualRows((rows) => rows.filter((_, i) => i !== idx))}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {manualValidationIssues.length > 0 && (
                      <ul className="lib-validation-list">
                        {manualValidationIssues.map((issue, i) => (
                          <li key={`${issue.row}-${issue.field}-${i}`} className="error">
                            <AlertTriangle size={14} /> {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canSubmitManual && manualRows.length > 0 && (
                      <div className="lib-validation-ready">
                        <FileCheck2 size={16} /> Dữ liệu nhập tay đạt chuẩn mẫu — sẵn sàng gửi Admin.
                      </div>
                    )}
                  </div>
                )}

                {createMode === 'import' && (
                  <div className="lib-import-panel">
                    <div className="lib-import-actions">
                      <button type="button" className="lib-btn lib-btn-secondary" onClick={downloadSampleCsv}>
                        <ArrowDownToLine size={14} /> Tải file mẫu CSV
                      </button>
                      <label className="lib-import-upload">
                        <UploadCloud size={16} />
                        {importFileName ?? 'Chọn file CSV đã điền dữ liệu'}
                        <input
                          type="file"
                          accept=".csv,text/csv"
                          onChange={(e) => {
                            const file = e.currentTarget.files?.[0] ?? null;
                            e.currentTarget.value = '';
                            void handleImportFile(file);
                          }}
                        />
                      </label>
                    </div>
                    {importIssues.length > 0 && (
                      <ul className="lib-validation-list">
                        {importIssues.map((issue, i) => (
                          <li key={`${issue.row}-${i}`} className={issue.severity}>
                            {issue.severity === 'error' ? <FileWarning size={14} /> : <AlertTriangle size={14} />}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    )}
                    {importReady && (
                      <div className="lib-validation-ready">
                        <CheckCircle2 size={16} /> File hợp lệ — {manualRows.length} dòng sẵn sàng nộp cho Admin.
                      </div>
                    )}
                  </div>
                )}

                {/* Report Custom Name */}
                <div className="lib-form-group">
                  <label htmlFor="lib-report-name">
                    Tên báo cáo gửi lên <span>*</span>
                  </label>
                  <input
                    id="lib-report-name"
                    type="text"
                    value={reportName}
                    onChange={(e) => setReportName(e.target.value)}
                    placeholder="VD: Báo cáo mượn trả tháng 10/2026..."
                    required
                  />
                </div>

                {/* Period Date Range */}
                <div className="lib-form-row">
                  <div className="lib-form-group">
                    <label htmlFor="lib-start-date">
                      Từ ngày <span>*</span>
                    </label>
                    <input
                      id="lib-start-date"
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      required
                    />
                  </div>

                  <div className="lib-form-group">
                    <label htmlFor="lib-end-date">
                      Đến ngày <span>*</span>
                    </label>
                    <input
                      id="lib-end-date"
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Format selection */}
                <div className="lib-form-group">
                  <label htmlFor="lib-report-format">Định dạng kết xuất</label>
                  <select
                    id="lib-report-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="CSV">CSV (Bảng tính Excel chuẩn UTF-8)</option>
                  </select>
                </div>

                {createMode === 'auto' && (
                  <div className="lib-data-notice">
                    <Info size={18} style={{ flexShrink: 0, marginTop: 1, color: '#3d72cb' }} />
                    <div>
                      <strong>Tự động từ hệ thống:</strong> Máy chủ truy vấn dữ liệu mượn trả thực tế trong kỳ đã chọn và lưu snapshot gửi Admin.
                    </div>
                  </div>
                )}
              </div>

              <footer className="lib-modal-footer">
                <button
                  type="button"
                  className="lib-btn lib-btn-secondary"
                  onClick={() => navigate('/librarian/reports')}
                  disabled={submitting}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="lib-btn lib-btn-primary"
                  disabled={submitting || !selectedTemplateId || !canSubmitManual || !canSubmitImport || requestLoading || requestedRequestUnavailable}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle size={15} className="lib-spin" /> Đang tổng hợp số liệu…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      {createMode === 'auto' ? 'Tạo & gửi cho Admin' : 'Xác nhận & gửi báo cáo'}
                    </>
                  )}
                </button>
              </footer>
            </form>
          </div>
        </main>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="lib-toast"
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 1300,
            background: '#1b2434',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 10,
            fontSize: 12,
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            style={{
              background: 'transparent',
              border: 0,
              color: '#a3afc2',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default LibrarianReportsPage;
