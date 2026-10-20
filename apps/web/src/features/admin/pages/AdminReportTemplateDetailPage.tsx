import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Clock3,
  FileText,
  Layers,
  LoaderCircle,
  Pencil,
  Save,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  getExpectedColumnLabels,
  getTemplateMetrics,
  metricLabel,
  parseTemplateConfiguration,
} from '../../reports/reportTemplateUtils';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminReportDetailPage.css';

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

const periodLabels: Record<string, string> = {
  Day: 'Theo ngày',
  Week: 'Theo tuần',
  Month: 'Định kỳ tháng',
  Quarter: 'Định kỳ quý',
  Custom: 'Tùy chỉnh',
};

const AdminReportTemplateDetailPage: React.FC = () => {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.accessToken);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplType, setTmplType] = useState('Activity');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplPeriod, setTmplPeriod] = useState('Month');
  const [tmplGroupBy, setTmplGroupBy] = useState('Day');
  const [tmplMetrics, setTmplMetrics] = useState<string[]>(['Borrowed', 'Returned', 'Overdue', 'ReturnedCount']);
  const [tmplEnabled, setTmplEnabled] = useState(true);

  const parsedConfig = useMemo(
    () => parseTemplateConfiguration(template?.configuration),
    [template?.configuration],
  );

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
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const openEdit = () => {
    if (!template) return;
    setTmplName(template.name);
    setTmplType(template.reportType);
    setTmplDesc(template.description ?? '');
    if (parsedConfig) {
      setTmplPeriod(parsedConfig.period || 'Month');
      setTmplGroupBy(parsedConfig.groupBy || 'Day');
      setTmplMetrics(getTemplateMetrics(parsedConfig));
    }
    setTmplEnabled(template.isEnabled);
    setEditOpen(true);
  };

  const save = async () => {
    if (!token || !template) return;
    if (!tmplName.trim()) {
      setNotice('Vui lòng nhập tên mẫu báo cáo.');
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
      setNotice('Đã lưu mẫu báo cáo.');
      setEditOpen(false);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Lỗi khi lưu mẫu.');
    } finally {
      setBusy(false);
    }
  };

  const expectedColumns = getExpectedColumnLabels(parsedConfig);
  const metrics = getTemplateMetrics(parsedConfig);

  return (
    <div className="report-detail-page">
      <div className="report-detail-breadcrumb">
        <Link to="/admin/reports">
          <ArrowLeft size={15} /> Thống kê &amp; báo cáo
        </Link>
        <span>/</span>
        <Link to="/admin/reports/templates">Quản lý mẫu</Link>
        <span>/</span>
        <strong>Chi tiết mẫu</strong>
      </div>

      <header className="report-detail-heading">
        <div>
          <p>QUẢN TRỊ MẪU BÁO CÁO</p>
          <h1>{template?.name ?? 'Chi tiết mẫu báo cáo'}</h1>
          <span>Mẫu quy định dữ liệu Thủ thư phải nộp — dùng cho báo cáo thủ công và import CSV.</span>
        </div>
        <div className="report-detail-head-actions">
          <button type="button" className="btn-secondary" onClick={openEdit} disabled={!template}>
            <Pencil size={15} /> Chỉnh sửa mẫu
          </button>
          <button type="button" onClick={() => navigate('/admin/reports/templates')}>
            <SlidersHorizontal size={16} /> Danh sách mẫu
          </button>
        </div>
      </header>

      {error && (
        <div className="report-detail-error">
          <AlertCircle size={17} />
          {error}
          <button type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}

      {loading && !template ? (
        <div className="report-detail-loading">
          <LoaderCircle size={20} className="report-spin" /> Đang tải mẫu…
        </div>
      ) : (
        template && (
          <>
            <section className="report-meta-card">
              <div>
                <span>TÊN MẪU</span>
                <strong>{template.name}</strong>
              </div>
              <div>
                <span>LOẠI BÁO CÁO</span>
                <strong>{template.reportType}</strong>
              </div>
              <div>
                <span>TRẠNG THÁI</span>
                <strong>{template.isEnabled ? 'Đang bật — Thủ thư được dùng' : 'Đang tắt'}</strong>
              </div>
              <div>
                <span>NGÀY TẠO</span>
                <strong>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short' }).format(new Date(template.createdAt))}</strong>
              </div>
            </section>

            <section className="report-template-spec-card">
              <div className="template-spec-header">
                <div>
                  <span className="template-spec-tag">CẤU HÌNH CHUẨN</span>
                  <h2>{template.name}</h2>
                  <p>{template.description || 'Chưa có mô tả chi tiết cho mẫu này.'}</p>
                </div>
              </div>
              <div className="template-spec-grid">
                <div className="spec-item">
                  <div className="spec-icon">
                    <Layers size={16} />
                  </div>
                  <div>
                    <span>Loại nghiệp vụ</span>
                    <strong>{template.reportType}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon">
                    <Calendar size={16} />
                  </div>
                  <div>
                    <span>Chu kỳ</span>
                    <strong>{periodLabels[parsedConfig?.period ?? 'Month'] ?? parsedConfig?.period}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <span>Gom nhóm</span>
                    <strong>{parsedConfig?.groupBy === 'Category' ? 'Theo nhóm sách' : 'Theo ngày'}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon">
                    <FileText size={16} />
                  </div>
                  <div>
                    <span>Định dạng</span>
                    <strong>{parsedConfig?.formats?.join(', ') || 'CSV'}</strong>
                  </div>
                </div>
              </div>
              <div className="template-metrics-row">
                <span className="metrics-title">Chỉ số bắt buộc:</span>
                <div className="metrics-tags">
                  {metrics.map((m) => (
                    <span key={m} className="metric-tag">
                      {metricLabel(m)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="template-metrics-row" style={{ marginTop: 12 }}>
                <span className="metrics-title">Cột CSV / nhập tay bắt buộc:</span>
                <div className="metrics-tags">
                  {expectedColumns.map((col) => (
                    <span key={col} className="metric-tag">
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            </section>
          </>
        )
      )}

      {editOpen && template && (
        <div className="report-modal-backdrop" role="dialog" aria-modal="true">
          <div className="report-modal-card modal-lg">
            <div className="report-modal-header">
              <h3>Chỉnh sửa mẫu: {template.name}</h3>
              <button type="button" onClick={() => setEditOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="report-modal-body">
                <div className="form-row-2">
                  <label>
                    Tên mẫu <b>*</b>
                    <input value={tmplName} onChange={(e) => setTmplName(e.target.value)} required />
                  </label>
                  <label>
                    Loại báo cáo
                    <select value={tmplType} onChange={(e) => setTmplType(e.target.value)}>
                      <option value="Activity">Hoạt động mượn trả</option>
                      <option value="Finance">Tài chính</option>
                      <option value="Collection">Kho sách</option>
                      <option value="Periodic">Định kỳ</option>
                    </select>
                  </label>
                </div>
                <label>
                  Mô tả
                  <textarea rows={2} value={tmplDesc} onChange={(e) => setTmplDesc(e.target.value)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                  <input type="checkbox" checked={tmplEnabled} onChange={(e) => setTmplEnabled(e.target.checked)} />
                  Cho phép Thủ thư sử dụng mẫu này
                </label>
              </div>
              <div className="report-modal-actions">
                <button type="button" onClick={() => setEditOpen(false)}>
                  Hủy
                </button>
                <button type="submit" className="save" disabled={busy}>
                  <Save size={15} /> Lưu mẫu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {notice && (
        <div className="report-detail-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default AdminReportTemplateDetailPage;
