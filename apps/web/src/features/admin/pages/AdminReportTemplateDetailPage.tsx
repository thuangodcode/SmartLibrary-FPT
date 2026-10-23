import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FileSpreadsheet,
  FileText,
  Layers,
  LoaderCircle,
  Pencil,
  Save,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  buildSampleCsv,
  getExpectedColumnLabels,
  getSampleCsvRows,
  getTemplateMetrics,
  metricLabel,
  parseTemplateConfiguration,
} from '../../reports/reportTemplateUtils';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminReportDetailPage.css';
import './AdminReportsExperience.css';
import './AdminReportTemplateExperience.css';

interface Envelope<T> {
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

type Notice = {
  message: string;
  tone: 'success' | 'error';
};

type ConfirmAction = 'toggle' | 'delete' | null;

const periodLabels: Record<string, string> = {
  Day: 'Theo ngày',
  Week: 'Theo tuần',
  Month: 'Định kỳ tháng',
  Quarter: 'Định kỳ quý',
  Custom: 'Tùy chỉnh',
};

const reportTypeLabels: Record<string, string> = {
  Activity: 'Hoạt động mượn trả',
  Finance: 'Tài chính',
  Collection: 'Kho sách',
  Periodic: 'Định kỳ',
};

const metricDescriptions: Record<string, string> = {
  Borrowed: 'Số lượt mượn sách trong kỳ · số nguyên không âm',
  Returned: 'Số lượt trả sách trong kỳ · số nguyên không âm',
};

const columnDescriptions: Record<string, string> = {
  Ngày: 'Ngày ghi nhận số liệu · định dạng dd/MM/yyyy',
  'Nhóm sách': 'Tên nhóm sách hoặc danh mục · dạng văn bản',
  'Lượt mượn': 'Số lượt mượn sách trong kỳ · số nguyên không âm',
  'Lượt trả': 'Số lượt trả sách trong kỳ · số nguyên không âm',
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'long',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));

const escapeCsvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

const AnimatedCount: React.FC<{ value: number }> = ({ value }) => {
  const countRef = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(() =>
    typeof window !== 'undefined'
      && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window))
      ? value
      : 0);

  useEffect(() => {
    const element = countRef.current;
    if (!element) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return undefined;

    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const startedAt = performance.now();
      const animate = (now: number) => {
        const progress = Math.min((now - startedAt) / 600, 1);
        setCount(Math.round(value * (1 - (1 - progress) ** 3)));
        if (progress < 1) frame = window.requestAnimationFrame(animate);
      };
      frame = window.requestAnimationFrame(animate);
    }, { threshold: 0.25 });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [value]);

  return <span ref={countRef}>{count}</span>;
};

const AdminReportTemplateDetailPage: React.FC = () => {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const actionsRef = useRef<HTMLDetailsElement>(null);
  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const confirmTriggerRef = useRef<HTMLElement | null>(null);
  const [tmplName, setTmplName] = useState('');
  const [tmplType, setTmplType] = useState('Activity');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplPeriod, setTmplPeriod] = useState('Month');
  const [tmplGroupBy, setTmplGroupBy] = useState('Day');
  const [tmplMetrics, setTmplMetrics] = useState<string[]>(['Borrowed', 'Returned']);
  const [tmplEnabled, setTmplEnabled] = useState(true);

  const parsedConfig = useMemo(
    () => parseTemplateConfiguration(template?.configuration),
    [template?.configuration],
  );
  const metrics = getTemplateMetrics(parsedConfig);
  const expectedColumns = getExpectedColumnLabels(parsedConfig);
  const csvRows = getSampleCsvRows(parsedConfig);
  const csvHeaders = csvRows[0];
  const csvPreviewRows = csvRows.slice(1);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !templateId) {
        setError('Thiếu phiên đăng nhập hoặc mã mẫu.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/reports/templates/${templateId}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const result = await parseApiResponse<Envelope<Template>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không tải được mẫu báo cáo.');
        }
        setTemplate(result.data);
      } catch (caught) {
        if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Không tải được mẫu.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [templateId, token],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (event.target instanceof Node && !actionsRef.current?.contains(event.target)) {
        actionsRef.current?.removeAttribute('open');
      }
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, []);

  useEffect(() => {
    if (!editOpen) editTriggerRef.current?.focus();
  }, [editOpen]);

  useEffect(() => {
    if (confirmAction || !confirmTriggerRef.current) return;
    confirmTriggerRef.current.focus();
    confirmTriggerRef.current = null;
  }, [confirmAction]);

  useEffect(() => {
    const handleOverlayKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditOpen(false);
        setConfirmAction(null);
        actionsRef.current?.removeAttribute('open');
        return;
      }
      if (event.key !== 'Tab' || (!editOpen && !confirmAction)) return;
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
      );
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleOverlayKeys);
    return () => document.removeEventListener('keydown', handleOverlayKeys);
  }, [confirmAction, editOpen]);

  const openEdit = () => {
    if (!template) return;
    setTmplName(template.name);
    setTmplType(template.reportType);
    setTmplDesc(template.description ?? '');
    setTmplPeriod(parsedConfig?.period || 'Month');
    setTmplGroupBy(parsedConfig?.groupBy || 'Day');
    setTmplMetrics(metrics);
    setTmplEnabled(template.isEnabled);
    setEditOpen(true);
  };

  const save = async () => {
    if (!token || !template) return;
    if (!tmplName.trim()) {
      setNotice({ message: 'Vui lòng nhập tên mẫu báo cáo.', tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const configuration = JSON.stringify({
        period: tmplPeriod,
        groupBy: tmplGroupBy,
        metrics: tmplMetrics,
        formats: ['CSV'],
      });
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/templates/${template.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tmplName.trim(),
          reportType: tmplType,
          description: tmplDesc,
          configuration,
          isEnabled: tmplEnabled,
        }),
      });
      const result = await parseApiResponse<Envelope<unknown>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không cập nhật được mẫu.');
      }
      setEditOpen(false);
      setNotice({ message: 'Đã lưu mẫu báo cáo.', tone: 'success' });
      await load();
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'Lỗi khi lưu mẫu.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const downloadCsv = () => {
    if (!template) return;
    const blob = new Blob([buildSampleCsv(parsedConfig)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `mau-bao-cao-${template.name.trim().replaceAll(/\s+/g, '-').toLowerCase()}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ message: 'Đã tải file CSV mẫu.', tone: 'success' });
  };

  const copyCsvHeader = async () => {
    try {
      await navigator.clipboard.writeText(csvHeaders.map(escapeCsvCell).join(','));
      setNotice({ message: 'Đã sao chép dòng tiêu đề CSV.', tone: 'success' });
    } catch {
      setNotice({ message: 'Không thể sao chép. Hãy kiểm tra quyền truy cập clipboard của trình duyệt.', tone: 'error' });
    }
  };

  const runAction = async () => {
    if (!token || !template || !confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction === 'delete') {
        const response = await fetch(`${API_BASE_URL}/api/admin/reports/templates/${template.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const result = await parseApiResponse<Envelope<never>>(response);
          throw new Error(result?.error || 'Không xóa được mẫu báo cáo.');
        }
        navigate('/admin/reports/templates', { replace: true });
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/admin/reports/templates/${template.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          reportType: template.reportType,
          description: template.description,
          configuration: template.configuration,
          isEnabled: !template.isEnabled,
        }),
      });
      const result = await parseApiResponse<Envelope<Template>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không cập nhật được trạng thái mẫu.');
      }
      setTemplate(result.data ?? { ...template, isEnabled: !template.isEnabled });
      setNotice({ message: template.isEnabled ? 'Đã tắt mẫu báo cáo.' : 'Đã bật mẫu báo cáo.', tone: 'success' });
      setConfirmAction(null);
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'Không thể thực hiện thao tác.', tone: 'error' });
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  const duplicateTemplate = async () => {
    if (!token || !template) return;
    actionsRef.current?.removeAttribute('open');
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/templates/${template.id}/duplicate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<Envelope<Template>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không nhân bản được mẫu.');
      }
      setNotice({ message: 'Đã nhân bản mẫu ở trạng thái tắt.', tone: 'success' });
      navigate(`/admin/reports/templates/${result.data.id}`);
    } catch (caught) {
      setNotice({ message: caught instanceof Error ? caught.message : 'Không nhân bản được mẫu.', tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const statCards = [
    { label: 'Loại báo cáo', value: reportTypeLabels[template?.reportType ?? ''] ?? template?.reportType ?? '—', icon: Layers },
    { label: 'Chu kỳ', value: periodLabels[parsedConfig?.period ?? 'Month'] ?? parsedConfig?.period ?? 'Định kỳ tháng', icon: Calendar },
    { label: 'Gom nhóm', value: parsedConfig?.groupBy === 'Category' ? 'Theo nhóm sách' : 'Theo ngày', icon: Clock3 },
    { label: 'Định dạng', value: parsedConfig?.formats?.join(', ') || 'CSV', icon: FileSpreadsheet },
  ];

  return (
    <div className="report-template-detail-page">
      <nav className="template-detail-breadcrumb" aria-label="Đường dẫn">
        <Link to="/admin/reports"><ArrowLeft size={16} />Thống kê &amp; báo cáo</Link>
        <span aria-hidden="true">/</span>
        <Link to="/admin/reports/templates">Quản lý mẫu</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Chi tiết mẫu</span>
      </nav>

      {loading && !template ? (
        <div className="template-detail-loading" aria-label="Đang tải mẫu">
          <div className="template-detail-skeleton template-detail-skeleton-hero" />
          <div className="template-detail-stat-grid">{statCards.map((card) => <div className="template-detail-skeleton" key={card.label} />)}</div>
          <div className="template-detail-skeleton template-detail-skeleton-content" />
        </div>
      ) : error ? (
        <div className="template-detail-error" role="alert">
          <AlertCircle size={20} />
          <div><strong>Không thể tải mẫu báo cáo</strong><p>{error}</p></div>
          <button type="button" onClick={() => void load()}><LoaderCircle size={16} /> Thử lại</button>
        </div>
      ) : template ? (
        <>
          {!template.isEnabled && (
            <div className="template-detail-disabled-banner" role="status">
              <AlertCircle size={19} />
              <span><strong>Mẫu đang tắt.</strong> Thủ thư hiện không thể dùng mẫu này để gửi báo cáo.</span>
              <button type="button" onClick={(event) => {
                confirmTriggerRef.current = event.currentTarget;
                setConfirmAction('toggle');
              }} disabled={busy}>Bật lại mẫu</button>
            </div>
          )}

          <header className="template-detail-hero">
            <div className="template-detail-hero-copy">
              <p className="template-detail-eyebrow">QUẢN TRỊ MẪU BÁO CÁO</p>
              <div className="template-detail-title-row">
                <h1>{template.name}</h1>
                <span className={`template-detail-status ${template.isEnabled ? 'is-active' : 'is-disabled'}`}>
                  <i aria-hidden="true" />{template.isEnabled ? 'Đang hoạt động' : 'Đang tắt'}
                </span>
              </div>
              <p className="template-detail-description">
                {template.description || 'Mẫu chuẩn dùng để lập báo cáo thủ công và nhập dữ liệu CSV.'}
              </p>
            </div>
            <div className="template-detail-actions">
              <button type="button" className="template-action-primary" onClick={(event) => {
                editTriggerRef.current = event.currentTarget;
                openEdit();
              }} disabled={busy}>
                <Pencil size={17} />Chỉnh sửa mẫu
              </button>
              <button type="button" className="template-action-secondary template-action-duplicate" onClick={() => void duplicateTemplate()} disabled={busy}>
                <Copy size={17} /><span>Nhân bản</span>
              </button>
              <button type="button" className="template-action-secondary template-action-download" onClick={downloadCsv}>
                <Download size={17} /><span>Tải CSV mẫu</span>
              </button>
              <details className="template-actions-menu" ref={actionsRef}>
                <summary aria-label="Thao tác khác" title="Thao tác khác"><Ellipsis size={21} /></summary>
                <div className="template-actions-popover">
                  <button type="button" onClick={downloadCsv}>
                    <Download size={16} />Tải CSV mẫu
                  </button>
                  <button type="button" onClick={() => void duplicateTemplate()} disabled={busy}>
                    <Copy size={16} />Nhân bản mẫu
                  </button>
                  <button type="button" onClick={() => {
                    actionsRef.current?.removeAttribute('open');
                    confirmTriggerRef.current = actionsRef.current?.querySelector<HTMLElement>('summary') ?? null;
                    setConfirmAction('toggle');
                  }} disabled={busy}>
                    {template.isEnabled ? <ToggleLeft size={16} /> : <ToggleRight size={16} />}
                    {template.isEnabled ? 'Tắt mẫu' : 'Bật mẫu'}
                  </button>
                  <button type="button" className="is-danger" onClick={() => {
                    actionsRef.current?.removeAttribute('open');
                    confirmTriggerRef.current = actionsRef.current?.querySelector<HTMLElement>('summary') ?? null;
                    setConfirmAction('delete');
                  }} disabled={busy}>
                    <Trash2 size={16} />Xóa mẫu
                  </button>
                </div>
              </details>
            </div>
          </header>

          <section className="template-detail-stat-grid" aria-label="Tóm tắt mẫu báo cáo">
            {statCards.map(({ label, value, icon: Icon }) => (
              <article className="template-detail-stat-card" key={label}>
                <span className="template-detail-stat-icon"><Icon size={20} /></span>
                <div><span>{label}</span><strong>{value}</strong></div>
              </article>
            ))}
          </section>

          <div className="template-detail-main-grid">
            <section className="template-detail-card template-detail-configuration">
              <div className="template-detail-card-heading">
                <div><span className="template-detail-section-kicker">CẤU HÌNH</span><h2>Cấu hình chuẩn</h2></div>
                <SlidersHorizontal size={20} aria-hidden="true" />
              </div>
              <p className="template-detail-card-description">
                Các chỉ số và cột dữ liệu cần có khi Thủ thư nhập hoặc tải lên báo cáo.
              </p>

              <div className="template-chip-section">
                <div className="template-chip-heading"><h3>Chỉ số bắt buộc</h3><span><AnimatedCount value={metrics.length} /></span></div>
                <div className="template-chip-list">
                  {metrics.map((metric) => (
                    <span className="template-detail-chip metric-chip" key={metric} title={`${metricLabel(metric)}: ${metricDescriptions[metric] ?? 'Chỉ số báo cáo'}`} aria-label={`${metricLabel(metric)}: ${metricDescriptions[metric] ?? 'Chỉ số báo cáo'}`} role="note">
                      <Check size={14} />{metricLabel(metric)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="template-chip-section">
                <div className="template-chip-heading"><h3>Cột CSV bắt buộc</h3><span><AnimatedCount value={expectedColumns.length} /></span></div>
                <div className="template-chip-list">
                  {expectedColumns.map((column) => (
                    <span className="template-detail-chip column-chip" key={column} title={columnDescriptions[column] ?? `${column} · dữ liệu theo mẫu`} aria-label={columnDescriptions[column] ?? `${column} · dữ liệu theo mẫu`} role="note">
                      <FileText size={14} />{column}
                    </span>
                  ))}
                </div>
                <p className="template-detail-helper">Ghi chú là cột tùy chọn và không bắt buộc khi nhập CSV.</p>
              </div>
            </section>

            <aside className="template-detail-side-column">
              <section className="template-detail-card template-detail-information">
                <div className="template-detail-card-heading">
                  <div><span className="template-detail-section-kicker">THÔNG TIN</span><h2>Thông tin mẫu</h2></div>
                  <Eye size={20} aria-hidden="true" />
                </div>
                <dl className="template-detail-info-list">
                  <div><dt>Ngày tạo</dt><dd>{formatDate(template.createdAt)}</dd></div>
                  <div><dt>Người tạo</dt><dd className="template-detail-unavailable">API hiện chưa cung cấp</dd></div>
                  <div><dt>Cập nhật lần cuối</dt><dd className="template-detail-unavailable">API hiện chưa cung cấp</dd></div>
                </dl>
                <button
                  type="button"
                  className={`template-detail-toggle ${template.isEnabled ? 'is-on' : ''}`}
                  onClick={(event) => {
                    confirmTriggerRef.current = event.currentTarget;
                    setConfirmAction('toggle');
                  }}
                  disabled={busy}
                  aria-pressed={template.isEnabled}
                >
                  {template.isEnabled ? <ToggleRight size={21} /> : <ToggleLeft size={21} />}
                  {template.isEnabled ? 'Đang bật — Thủ thư được dùng' : 'Đang tắt — Thủ thư không thể dùng'}
                  <ChevronDown size={15} />
                </button>
              </section>

              <section className="template-detail-card template-detail-activity">
                <div className="template-detail-card-heading">
                  <div><span className="template-detail-section-kicker">LỊCH SỬ</span><h2>Hoạt động gần đây</h2></div>
                  <Clock3 size={20} aria-hidden="true" />
                </div>
                <div className="template-detail-activity-empty">
                  <span><FileSpreadsheet size={20} /></span>
                  <p>API hiện chưa cung cấp số lần sử dụng hoặc báo cáo gắn với mẫu này.</p>
                </div>
                <Link className="template-detail-reports-link" to="/admin/reports">
                  Mở danh sách báo cáo<ArrowUpRight size={15} />
                </Link>
              </section>
            </aside>

            <section className="template-detail-card template-detail-csv">
              <div className="template-detail-card-heading">
                <div><span className="template-detail-section-kicker">XEM TRƯỚC</span><h2>Cấu trúc file CSV</h2></div>
                <div className="template-detail-csv-actions">
                  <button type="button" className="template-action-secondary" onClick={() => void copyCsvHeader()}>
                    <Copy size={16} />Sao chép header
                  </button>
                  <button type="button" className="template-action-primary" onClick={downloadCsv}>
                    <Download size={16} />Tải file mẫu
                  </button>
                </div>
              </div>
              <p className="template-detail-card-description">Bố cục mẫu CSV minh họa với hai dòng dữ liệu; cột và header khớp file tải xuống.</p>
              <div className="template-detail-csv-table-wrap">
                <table className="template-detail-csv-table">
                  <thead><tr>{csvHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                  <tbody>
                    {csvPreviewRows.map((row, rowIndex) => (
                      <tr className={row[1] === 'Tổng' ? 'is-total' : undefined} key={rowIndex}>
                        {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell || '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="template-detail-csv-note">Các giá trị trong phần xem trước chỉ mang tính minh họa.</p>
            </section>
          </div>
        </>
      ) : null}

      {editOpen && template && (
        <div className="report-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="template-edit-title">
          <div className="report-modal-card modal-lg">
            <div className="report-modal-header">
              <h3 id="template-edit-title">Chỉnh sửa mẫu: {template.name}</h3>
              <button type="button" onClick={() => setEditOpen(false)} aria-label="Đóng"><X size={18} /></button>
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <div className="report-modal-body">
                <div className="form-row-2">
                  <label>Tên mẫu <b>*</b><input autoFocus value={tmplName} onChange={(event) => setTmplName(event.target.value)} required /></label>
                  <label>Loại báo cáo
                    <select value={tmplType} onChange={(event) => setTmplType(event.target.value)}>
                      <option value="Activity">Hoạt động mượn trả</option>
                      <option value="Finance">Tài chính</option>
                      <option value="Collection">Kho sách</option>
                      <option value="Periodic">Định kỳ</option>
                    </select>
                  </label>
                </div>
                <label>Mô tả<textarea rows={3} value={tmplDesc} onChange={(event) => setTmplDesc(event.target.value)} /></label>
                <div className="form-row-2">
                  <label>Chu kỳ
                    <select value={tmplPeriod} onChange={(event) => setTmplPeriod(event.target.value)}>
                      <option value="Day">Ngày</option><option value="Week">Tuần</option><option value="Month">Tháng</option><option value="Quarter">Quý</option>
                    </select>
                  </label>
                  <label>Gom nhóm
                    <select value={tmplGroupBy} onChange={(event) => setTmplGroupBy(event.target.value)}>
                      <option value="Day">Theo ngày</option><option value="Category">Theo nhóm sách</option>
                    </select>
                  </label>
                </div>
                <fieldset className="template-edit-metrics">
                  <legend>Chỉ số bắt buộc</legend>
                  {(['Borrowed', 'Returned'] as const).map((metric) => (
                    <label key={metric}>
                      <input
                        type="checkbox"
                        checked={tmplMetrics.includes(metric)}
                        onChange={(event) => setTmplMetrics((current) => event.target.checked
                          ? [...current, metric]
                          : current.filter((value) => value !== metric))}
                      />
                      {metricLabel(metric)}
                    </label>
                  ))}
                </fieldset>
                <label className="template-edit-enabled">
                  <input type="checkbox" checked={tmplEnabled} onChange={(event) => setTmplEnabled(event.target.checked)} />
                  Cho phép Thủ thư sử dụng mẫu này
                </label>
              </div>
              <div className="report-modal-actions">
                <button type="button" onClick={() => setEditOpen(false)}>Hủy</button>
                <button type="submit" className="save" disabled={busy}><Save size={15} />Lưu mẫu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmAction && template && (
        <div className="template-detail-confirm-backdrop" role="presentation">
          <section className="template-detail-confirm" role="alertdialog" aria-modal="true" aria-labelledby="template-confirm-title">
            <span className={confirmAction === 'delete' ? 'is-danger' : ''}>
              {confirmAction === 'delete' ? <Trash2 size={21} /> : template.isEnabled ? <ToggleLeft size={21} /> : <ToggleRight size={21} />}
            </span>
            <h2 id="template-confirm-title">{confirmAction === 'delete' ? 'Xóa mẫu báo cáo?' : template.isEnabled ? 'Tắt mẫu báo cáo?' : 'Bật mẫu báo cáo?'}</h2>
            <p>
              {confirmAction === 'delete'
                ? 'Mẫu sẽ bị xóa nếu chưa được dùng trong báo cáo. Thao tác này không thể hoàn tác.'
                : template.isEnabled
                  ? 'Thủ thư sẽ không thể chọn mẫu này cho các báo cáo mới.'
                  : 'Thủ thư sẽ có thể sử dụng mẫu này cho các báo cáo mới.'}
            </p>
            <div>
              <button type="button" autoFocus onClick={() => setConfirmAction(null)} disabled={busy}>Hủy</button>
              <button type="button" className={confirmAction === 'delete' ? 'is-danger' : 'is-primary'} onClick={() => void runAction()} disabled={busy}>
                {busy ? <LoaderCircle size={16} className="template-detail-spin" /> : confirmAction === 'delete' ? <Trash2 size={16} /> : <CheckCircle2 size={16} />}
                {confirmAction === 'delete' ? 'Xóa mẫu' : template.isEnabled ? 'Tắt mẫu' : 'Bật mẫu'}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className={`template-detail-toast ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
          {notice.tone === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo"><X size={16} /></button>
        </div>
      )}
    </div>
  );
};

export default AdminReportTemplateDetailPage;
