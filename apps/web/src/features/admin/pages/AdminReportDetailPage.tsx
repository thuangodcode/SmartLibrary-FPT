import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCheck,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  FileText,
  Layers,
  LoaderCircle,
  MessageSquareText,
  Pencil,
  RotateCcw,
  Save,
  Send,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminReportDetailPage.css';
import './AdminReportsExperience.css';

interface Envelope<T> { success?: boolean; data?: T; error?: string }
interface Review { action: string; comment: string | null; reviewer: string; createdAt: string }
interface ReportRow { date: string; category: string; borrowed: number; returned: number; notes: string | null }
interface Report {
  id: string;
  code: string;
  name: string;
  submitter: string;
  templateName: string;
  createdAt: string;
  periodStart: string;
  periodEnd: string;
  format: string;
  status: string;
  isViewed: boolean;
  isApproved: boolean;
  isRejected?: boolean;
  rows: ReportRow[];
  reviews: Review[];
  templateId?: string;
  templateReportType?: string;
  templateDescription?: string;
  templateConfiguration?: string;
}

const fmtDate = (value: string) => {
  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
  } catch {
    return value;
  }
};

const metricLabels: Record<string, string> = {
  Borrowed: 'Lượt mượn',
  Returned: 'Lượt trả',
};

const periodLabels: Record<string, string> = {
  Day: 'Theo ngày',
  Week: 'Theo tuần',
  Month: 'Định kỳ tháng',
  Quarter: 'Định kỳ quý',
  Custom: 'Tùy chỉnh',
};

const AdminReportDetailPage: React.FC = () => {
  const { id } = useParams();
  const token = useAuthStore((state) => state.accessToken);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit Report Modal
  const [editReportModal, setEditReportModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('Ready');

    // Edit Template Modal state removed since template editing is handled in AdminReportTemplateDetailPage

  const total = useMemo(
    () =>
      report?.rows.reduce(
        (sum, row) => ({
          borrowed: sum.borrowed + row.borrowed,
          returned: sum.returned + row.returned,
        }),
        { borrowed: 0, returned: 0 }
      ) ?? { borrowed: 0, returned: 0 },
    [report]
  );

  const parsedTemplateConfig = useMemo(() => {
    if (!report?.templateConfiguration) return null;
    try {
      let raw: unknown = report.templateConfiguration;
      while (typeof raw === 'string') raw = JSON.parse(raw);
      return raw as { period?: string; groupBy?: string; metrics?: string[]; formats?: string[] };
    } catch {
      return null;
    }
  }, [report]);
  const templateMetrics = useMemo(() => {
    const configured = (parsedTemplateConfig?.metrics ?? []).filter(
      (metric) => metric === 'Borrowed' || metric === 'Returned',
    );
    return configured.length ? configured : ['Borrowed', 'Returned'];
  }, [parsedTemplateConfig]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!token || !id) {
        setError('Thiếu phiên đăng nhập hoặc mã báo cáo.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const result = await parseApiResponse<Envelope<Report>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không tải được báo cáo.');
        }
        setReport(result.data);
        setEditName(result.data.name);
        setEditStatus(result.data.status);
      } catch (caught) {
        if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Không tải được báo cáo.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, token]
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

  const update = async (payload: { isViewed?: boolean; isApproved?: boolean; isRejected?: boolean; comment?: string; name?: string; status?: string }) => {
    if (!token || !id) return;
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await parseApiResponse<Envelope<never>>(response);
        throw new Error(result?.error || 'Không lưu được phản hồi.');
      }
      setNotice('Đã cập nhật báo cáo thành công.');
      setComment('');
      setEditReportModal(false);
      await load();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Không lưu được phản hồi.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!token || !id) return;
    const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}/export?format=csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const result = await parseApiResponse<Envelope<never>>(response);
      setNotice(result?.error || 'Không thể xuất CSV.');
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(await response.blob());
    anchor.download = `${report?.code ?? 'bao-cao'}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <div className="report-detail-page">
      <div className="report-detail-breadcrumb">
        <Link to="/admin/reports">
          <ArrowLeft size={15} /> Quay lại
        </Link>
        <span>/</span>
        <span>Thống kê &amp; báo cáo</span>
        <span>/</span>
        <strong>Chi tiết báo cáo</strong>
      </div>

      <header className="report-detail-heading">
        <div>
          <p>QUẢN TRỊ VIÊN XÉT DUYỆT</p>
          <h1>{report?.name || 'Chi tiết báo cáo'}</h1>
          <span>Mã báo cáo: <code style={{ color: '#eb753c', fontWeight: 700 }}>{report?.code}</code> · Xem thông tin chi tiết và mẫu áp dụng.</span>
        </div>
        <div className="report-detail-head-actions">
          <button type="button" className="btn-secondary" onClick={() => setEditReportModal(true)}>
            <Pencil size={15} /> Sửa báo cáo
          </button>
          <button type="button" onClick={() => void download()}>
            <FileSpreadsheet size={16} /> Xuất CSV
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

      {loading && !report ? (
        <div className="report-detail-loading">
          <LoaderCircle size={20} className="report-spin" /> Đang tải dữ liệu chi tiết…
        </div>
      ) : (
        report && (
          <>
            {/* Meta Information Card */}
            <section className="report-meta-card">
              <div>
                <span>MÃ BÁO CÁO</span>
                <strong>{report.code}</strong>
              </div>
              <div>
                <span>TÊN BÁO CÁO</span>
                <strong>{report.name}</strong>
              </div>
              <div>
                <span>THỦ THƯ GỬI LÊN</span>
                <strong>{report.submitter}</strong>
              </div>
              <div>
                <span>NGÀY GỬI</span>
                <strong>{fmtDate(report.createdAt)}</strong>
              </div>
              <div>
                <span>KỲ BÁO CÁO</span>
                <strong>
                  {fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}
                </strong>
              </div>
              <div>
                <span>MẪU ÁP DỤNG</span>
                <strong>{report.templateName}</strong>
              </div>
              <div>
                <span>TRẠNG THÁI DUYỆT</span>
                <strong>
                  <i className={`detail-status ${report.isApproved ? 'approved' : report.isRejected || report.status === 'Rejected' ? 'rejected' : report.isViewed ? 'viewed' : ''}`} />
                  {report.isApproved ? 'Đã duyệt' : report.isRejected || report.status === 'Rejected' ? 'Yêu cầu chỉnh sửa' : report.isViewed ? 'Đã xem' : report.status === 'Ready' ? 'Sẵn sàng' : report.status}
                </strong>
              </div>
              <div>
                <span>ĐỊNH DẠNG</span>
                <strong>{report.format}</strong>
              </div>
            </section>

            {/* Template Specification Box */}
            <section className="report-template-spec-card">
              <div className="template-spec-header">
                <div>
                  <span className="template-spec-tag">CHI TIẾT MẪU BÁO CÁO QUY ĐỊNH</span>
                  <h2>{report.templateName}</h2>
                  <p>{report.templateDescription || 'Mẫu cấu hình chuẩn dành cho thủ thư nộp báo cáo định kỳ cho Quản trị viên.'}</p>
                </div>
                <div className="template-spec-actions">
                  {report.templateId && (
                    <Link to={`/admin/reports/templates/${report.templateId}`} className="btn-view-all-templates">
                      <FileText size={15} /> Xem chi tiết mẫu
                    </Link>
                  )}
                  <Link to="/admin/reports/templates" className="btn-view-all-templates">
                    <SlidersHorizontal size={15} /> Tất cả mẫu
                  </Link>
                </div>
              </div>

              <div className="template-spec-grid">
                <div className="spec-item">
                  <div className="spec-icon"><Layers size={16} /></div>
                  <div>
                    <span>Loại nghiệp vụ</span>
                    <strong>{report.templateReportType || 'Activity'}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon"><Calendar size={16} /></div>
                  <div>
                    <span>Chu kỳ tổng hợp</span>
                    <strong>{periodLabels[parsedTemplateConfig?.period || 'Month'] || parsedTemplateConfig?.period || 'Tháng'}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon"><Clock3 size={16} /></div>
                  <div>
                    <span>Gom nhóm số liệu</span>
                    <strong>{parsedTemplateConfig?.groupBy === 'Day' ? 'Theo ngày' : 'Theo nhóm sách'}</strong>
                  </div>
                </div>
                <div className="spec-item">
                  <div className="spec-icon"><FileText size={16} /></div>
                  <div>
                    <span>Định dạng hỗ trợ</span>
                    <strong>{parsedTemplateConfig?.formats?.join(', ') || 'CSV'}</strong>
                  </div>
                </div>
              </div>

              <div className="template-metrics-row">
                <span className="metrics-title">Chỉ số bắt buộc theo mẫu:</span>
                <div className="metrics-tags">
                  {templateMetrics.map((m) => (
                    <span key={m} className="metric-tag">
                      {metricLabels[m] || m}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            {/* Snapshot Rows Data Table */}
            <section className="report-detail-table-card">
              <div className="report-detail-section-title">
                <div>
                  <span>DỮ LIỆU SNAPSHOT THỰC TẾ</span>
                  <h2>Bảng số liệu chi tiết từng dòng ({report.rows.length} dòng)</h2>
                </div>
                <span>Kỳ: {fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}</span>
              </div>
              {report.rows.length ? (
                <div className="report-detail-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Ngày</th>
                        <th>Nhóm sách / Danh mục</th>
                        <th>Lượt mượn</th>
                        <th>Lượt trả</th>
                        <th>Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.map((row, index) => (
                        <tr key={`${row.date}-${row.category}-${index}`}>
                          <td>{fmtDate(row.date)}</td>
                          <td><strong>{row.category}</strong></td>
                          <td>{row.borrowed.toLocaleString('vi-VN')}</td>
                          <td>{row.returned.toLocaleString('vi-VN')}</td>
                          <td>{row.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={2}>Tổng cộng toàn kỳ</th>
                        <th>{total.borrowed.toLocaleString('vi-VN')}</th>
                        <th>{total.returned.toLocaleString('vi-VN')}</th>
                        <th>—</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="report-detail-empty">
                  <Clock3 size={18} /> Snapshot này chưa có dữ liệu theo ngày.
                </div>
              )}
            </section>

            {/* Admin Review & Feedback Card */}
            <section className="report-feedback-card">
              <div className="report-detail-section-title">
                <div>
                  <span>TRAO ĐỔI &amp; DUYỆT BÁO CÁO</span>
                  <h2>Ý kiến phản hồi gửi Thủ thư</h2>
                </div>
                <MessageSquareText size={19} />
              </div>
              <div className="report-feedback-actions">
                <button
                  type="button"
                  disabled={busy || report.isViewed}
                  onClick={() => void update({ isViewed: true })}
                >
                  <CheckCheck size={15} />
                  {report.isViewed ? 'Đã xem' : 'Đánh dấu đã xem'}
                </button>
                <button
                  type="button"
                  className="approve"
                  disabled={busy || report.isApproved}
                  onClick={() => void update({ isApproved: true })}
                >
                  <CheckCircle2 size={15} />
                  {report.isApproved ? 'Đã duyệt báo cáo' : 'Duyệt báo cáo này'}
                </button>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (comment.trim()) void update({ comment: comment.trim() });
                }}
              >
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Nhập nhận xét hoặc yêu cầu thủ thư bổ sung/chỉnh sửa số liệu…"
                  aria-label="Nhận xét cho thủ thư"
                />
                <button type="submit" disabled={busy || !comment.trim()}>
                  <Send size={15} /> Gửi nhận xét
                </button>
              </form>
              {!report.isApproved && (
                <div className="report-reject-action">
                  <p>Để yêu cầu Thủ thư chỉnh sửa, hãy nhập lý do ở trên rồi gửi phản hồi từ chối.</p>
                  <button
                    type="button"
                    disabled={busy || !comment.trim()}
                    onClick={() => void update({ isRejected: true, comment: comment.trim() })}
                  >
                    <RotateCcw size={15} /> Từ chối và yêu cầu chỉnh sửa
                  </button>
                </div>
              )}
              {report.reviews.length > 0 && (
                <div className="report-review-list">
                  {report.reviews.map((review, index) => (
                    <article key={`${review.createdAt}-${index}`}>
                      <div>
                        <strong>{review.reviewer}</strong>
                        <span>
                          {fmtDate(review.createdAt)} ·{' '}
                          {review.action === 'Approved' ? 'Đã duyệt' : review.action === 'Rejected' ? 'Yêu cầu chỉnh sửa' : review.action === 'Viewed' ? 'Đã xem' : 'Nhận xét'}
                        </span>
                      </div>
                      <p>{review.comment || (review.action === 'Approved' ? 'Đã duyệt báo cáo.' : 'Đã xem báo cáo.')}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )
      )}

      {/* ── Modal Chỉnh sửa Báo Cáo ── */}
      {editReportModal && (
        <div className="report-modal-backdrop" role="dialog" aria-modal="true">
          <div className="report-modal-card">
            <div className="report-modal-header">
              <h3>Chỉnh sửa thông tin báo cáo</h3>
              <button type="button" onClick={() => setEditReportModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void update({ name: editName, status: editStatus }); }}>
              <div className="report-modal-body">
                <label>
                  Tên báo cáo
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Trạng thái báo cáo
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="Ready">Sẵn sàng (Ready)</option>
                    <option value="Processing">Đang xử lý (Processing)</option>
                    <option value="NeedRevision">Cần chỉnh sửa (Need Revision)</option>
                    <option value="Approved">Đã duyệt (Approved)</option>
                  </select>
                </label>
              </div>
              <div className="report-modal-actions">
                <button type="button" onClick={() => setEditReportModal(false)}>Hủy</button>
                <button type="submit" className="save" disabled={busy}>
                  <Save size={15} /> Lưu thay đổi
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

export default AdminReportDetailPage;
