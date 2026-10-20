import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  LoaderCircle,
  MessageSquareText,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './LibrarianReportsPage.css';

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface ReportReview {
  action: string;
  comment: string | null;
  reviewer: string;
  createdAt: string;
}

interface ReportRow {
  date: string;
  category: string;
  borrowed: number;
  returned: number;
  overdue: number;
  returnedCount: number;
  notes: string | null;
}

interface ReportDetail {
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
  reviews: ReportReview[];
  rows: ReportRow[];
}

const formatDate = (val: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(val));

const formatDateTime = (val: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(val),
  );

const LibrarianReportDetailPage: React.FC = () => {
  const { id } = useParams();
  const token = useAuthStore((s) => s.accessToken);
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const res = await fetch(`${API_BASE_URL}/api/librarian/reports/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const result = await parseApiResponse<ApiEnvelope<ReportDetail>>(res);
        if (!res.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không tải được chi tiết báo cáo.');
        }
        setReport(result.data);
      } catch (err) {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Lỗi khi tải báo cáo.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [id, token],
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

  const downloadCsv = async () => {
    if (!token || !report) return;
    const res = await fetch(`${API_BASE_URL}/api/librarian/reports/${report.id}/export?format=csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lib-reports-page">
      <div className="lib-panel-header" style={{ marginBottom: 4 }}>
        <Link to="/librarian/reports" className="lib-btn lib-btn-secondary" style={{ textDecoration: 'none' }}>
          <ArrowLeft size={15} /> Quay lại danh sách
        </Link>
      </div>

      <header className="lib-reports-header">
        <div>
          <p className="lib-reports-eyebrow">CHI TIẾT BÁO CÁO ĐÃ GỬI</p>
          <h1>{report?.name ?? 'Chi tiết báo cáo'}</h1>
          <p>
            Mã: <code style={{ color: '#eb753c', fontWeight: 700 }}>{report?.code ?? '—'}</code>
          </p>
        </div>
        {report && (
          <button type="button" className="lib-btn lib-btn-secondary" onClick={() => void downloadCsv()}>
            <ArrowDownToLine size={15} /> Tải CSV
          </button>
        )}
      </header>

      {error && (
        <div className="lib-data-notice" style={{ background: '#fff2f0', borderColor: '#f7ccc7', color: '#b93a32' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && !report ? (
        <div className="lib-table-empty">
          <LoaderCircle size={28} className="lib-spin" style={{ margin: '0 auto', color: '#eb753c' }} />
        </div>
      ) : (
        report && (
          <section className="lib-reports-panel">
            <div className="lib-detail-meta-grid">
              <div className="lib-detail-meta-item">
                <span>Mẫu áp dụng</span>
                <strong>{report.templateName}</strong>
              </div>
              <div className="lib-detail-meta-item">
                <span>Kỳ báo cáo</span>
                <strong>
                  {formatDate(report.periodStart)} – {formatDate(report.periodEnd)}
                </strong>
              </div>
              <div className="lib-detail-meta-item">
                <span>Ngày gửi</span>
                <strong>{formatDateTime(report.createdAt)}</strong>
              </div>
              <div className="lib-detail-meta-item">
                <span>Trạng thái duyệt</span>
                <div>
                  {report.isApproved ? (
                    <span className="lib-status-badge approved">
                      <CheckCircle2 size={12} /> Đã duyệt
                    </span>
                  ) : report.isViewed ? (
                    <span className="lib-status-badge viewed">
                      <Eye size={12} /> Đã xem
                    </span>
                  ) : (
                    <span className="lib-status-badge pending">
                      <Clock size={12} /> Chờ duyệt
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="lib-admin-feedback-section">
              <div className="lib-admin-feedback-title">
                <h3>Phản hồi từ Admin</h3>
                <MessageSquareText size={18} style={{ color: '#eb753c' }} />
              </div>
              {report.reviews.length ? (
                <div className="lib-admin-timeline">
                  {report.reviews.map((rev, idx) => (
                    <div key={idx} className={`lib-admin-review-item ${rev.action === 'Approved' ? 'approved' : ''}`}>
                      <div className="lib-admin-review-header">
                        <strong>{rev.reviewer}</strong>
                        <span>{formatDateTime(rev.createdAt)}</span>
                      </div>
                      <p className="lib-admin-review-content">{rev.comment || rev.action}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lib-no-reviews">
                  <Clock size={16} />
                  <span>Admin chưa gửi phản hồi.</span>
                </div>
              )}
            </div>

            <div className="lib-table-wrap" style={{ marginTop: 16 }}>
              <table className="lib-table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Nhóm sách</th>
                    <th>Mượn</th>
                    <th>Trả</th>
                    <th>Quá hạn</th>
                    <th>Đã trả</th>
                    <th>Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.length ? (
                    report.rows.map((row, idx) => (
                      <tr key={idx}>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <strong>{row.category}</strong>
                        </td>
                        <td>{row.borrowed}</td>
                        <td>{row.returned}</td>
                        <td>{row.overdue}</td>
                        <td>{row.returnedCount}</td>
                        <td>{row.notes || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="lib-table-empty">
                        Không có dòng dữ liệu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}
    </div>
  );
};

export default LibrarianReportDetailPage;
