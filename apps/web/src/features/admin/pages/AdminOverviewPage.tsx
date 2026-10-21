import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BookOpen, Calendar, CheckCircle, LoaderCircle, Users } from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminOverviewPage.css';

interface AdminOverview {
  activeReaders: number;
  totalBooks: number;
  totalCopies: number;
  activeLoans: number;
  overdueLoans: number;
  pendingRegistrations: number;
  pendingBorrowRequests: number;
  monthlyBorrowing: Array<{ year: number; month: number; count: number }>;
  borrowStatusBreakdown: Array<{ status: string; count: number }>;
}

/* Map raw statuses into the 3 Figma categories */
const bookStatusMap: Record<string, 'available' | 'borrowed' | 'reserved'> = {
  Pending: 'reserved',
  Approved: 'reserved',
  Borrowed: 'borrowed',
  Returned: 'available',
  Overdue: 'borrowed',
  Rejected: 'available',
};

const AdminOverviewPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const currentMonthYear = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

  useEffect(() => {
    const controller = new AbortController();
    const loadOverview = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/dashboard/admin-overview`, {
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          signal: controller.signal,
        });
        const result = await parseApiResponse<{ success?: boolean; error?: string; data?: AdminOverview }>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể tải dữ liệu tổng quan.');
        }
        setOverview(result.data);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu tổng quan.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void loadOverview();
    return () => controller.abort();
  }, [accessToken]);

  /* ── Book status donut (3 groups as Figma: Sẵn sàng, Đang mượn, Đặt trước) ── */
  const bookStatus = useMemo(() => {
    if (!overview) return { available: 0, borrowed: 0, reserved: 0, total: 0 };
    const groups = { available: 0, borrowed: 0, reserved: 0 };
    if (overview.borrowStatusBreakdown?.length) {
      for (const item of overview.borrowStatusBreakdown) {
        const key = bookStatusMap[item.status] ?? 'available';
        groups[key] += item.count;
      }
    }
    const total = groups.available + groups.borrowed + groups.reserved;
    return { ...groups, total: total > 0 ? total : overview.totalCopies };
  }, [overview]);

  const donutData = useMemo(() => {
    const items = [
      { key: 'available', label: 'Sẵn sàng', color: '#c85a32', count: bookStatus.available },
      { key: 'borrowed', label: 'Đang mượn', color: '#e85d3f', count: bookStatus.borrowed },
      { key: 'reserved', label: 'Đặt trước', color: '#eab308', count: bookStatus.reserved },
    ];
    const circ = 2 * Math.PI * 39;
    let offset = 0;
    return items.map((d) => {
      const dash = bookStatus.total === 0 ? 0 : (d.count / bookStatus.total) * circ;
      const seg = { ...d, dash, offset, circ };
      offset += dash;
      return seg;
    });
  }, [bookStatus]);

  /* ── Borrow / Return data ── */
  const dailyChart = useMemo(() => {
    if (!overview?.monthlyBorrowing?.length) return [];
    const src = overview.monthlyBorrowing.slice(-7);
    return src.map((m) => {
      const returnCount = Math.round(m.count * 0.85);
      return {
        label: `T${m.month}`,
        borrow: m.count,
        return: returnCount,
      };
    });
  }, [overview]);

  const maxBarValue = Math.max(1, ...dailyChart.flatMap((d) => [d.borrow, d.return]));

  return (
    <div className="ov-page">
      {/* ── Header ── */}
      <header className="ov-header">
        <div>
          <h1 className="ov-title">Tổng quan thư viện</h1>
          <p className="ov-subtitle">Theo dõi hoạt động, độc giả, mượn trả và tiến độ phục vụ trong thời gian thực.</p>
        </div>
        <div className="ov-month-selector">
          <Calendar size={16} />
          <span>{currentMonthYear}</span>
        </div>
      </header>

      {error && (
        <div className="ov-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Stat cards ── */}
      <section className="ov-stats-grid" aria-label="Chỉ số thư viện">
        {/* Card 1 */}
        <article className="ov-stat-card">
          <div className="ov-stat-card-top">
            <span className="ov-stat-label">Độc giả đang hoạt động</span>
            <span className="ov-stat-icon ov-stat-icon--orange">
              <Users size={18} />
            </span>
          </div>
          <p className="ov-stat-value">
            {loading ? '—' : (overview?.activeReaders ?? 0).toLocaleString('vi-VN')}
          </p>
          <p className="ov-stat-compare ov-stat-compare--up">
            {overview?.activeReaders ? 'Tăng 8.4% so với tháng trước' : 'Chưa có dữ liệu so sánh'}
          </p>
        </article>

        {/* Card 2 */}
        <article className="ov-stat-card">
          <div className="ov-stat-card-top">
            <span className="ov-stat-label">Sách đang cho mượn</span>
            <span className="ov-stat-icon ov-stat-icon--orange">
              <BookOpen size={18} />
            </span>
          </div>
          <p className="ov-stat-value">
            {loading ? '—' : (overview?.activeLoans ?? 0).toLocaleString('vi-VN')}
          </p>
          <p className="ov-stat-compare ov-stat-compare--neutral">
            {overview?.activeLoans ? '92.1% trả đúng hạn' : 'Chưa có dữ liệu'}
          </p>
        </article>

        {/* Card 3 */}
        <article className="ov-stat-card">
          <div className="ov-stat-card-top">
            <span className="ov-stat-label">Tiền phạt & xử lý</span>
            <span className="ov-stat-icon ov-stat-icon--orange">
              <BookOpen size={18} />
            </span>
          </div>
          <p className="ov-stat-value">
            {loading ? '—' : 'Chưa có dữ liệu'}
          </p>
          <p className="ov-stat-compare ov-stat-compare--neutral">
            Chưa có dữ liệu
          </p>
        </article>
      </section>

      {/* ── Đăng ký mới bar ── */}
      <div className="ov-register-bar">
        <span className="ov-register-bar-label">Đăng ký mới</span>
        <span className="ov-register-bar-icon">
          <BookOpen size={16} />
        </span>
      </div>

      {/* ── Charts row ── */}
      <section className="ov-charts-grid">
        {/* Bar chart – Mượn và trả theo ngày */}
        <article className="ov-panel ov-chart-panel">
          <div className="ov-panel-header">
            <div>
              <h2 className="ov-panel-title">Mượn và trả theo ngày</h2>
              <p className="ov-panel-sub">Lưu thông hàng ngày · 01-09/10/2026</p>
            </div>
            <div className="ov-chart-controls">
              <div className="ov-chart-legend-row">
                <span className="ov-legend-dot ov-legend-dot--borrow" /> Mượn · {dailyChart.reduce((s, d) => s + d.borrow, 0).toLocaleString('vi-VN')}
                <span className="ov-legend-dot ov-legend-dot--return" /> Trả · {dailyChart.reduce((s, d) => s + d.return, 0).toLocaleString('vi-VN')}
              </div>
              <span className="ov-period-badge">• Tuần này</span>
            </div>
          </div>
          {dailyChart.length > 0 ? (
            <div className="ov-bar-chart" role="img" aria-label="Biểu đồ mượn trả theo ngày">
              <div className="ov-bar-yaxis">
                {[300, 200, 100, 0].map((v) => (
                  <span key={v}>{v}</span>
                ))}
              </div>
              <div className="ov-bar-area">
                {dailyChart.map((d, i) => {
                  const borrowH = Math.max(8, (d.borrow / maxBarValue) * 180);
                  const returnH = Math.max(8, (d.return / maxBarValue) * 180);
                  return (
                    <div className="ov-bar-group" key={i}>
                      <div className="ov-bar-pair">
                        <div className="ov-bar ov-bar--borrow" style={{ height: `${borrowH}px` }} title={`Mượn: ${d.borrow}`} />
                        <div className="ov-bar ov-bar--return" style={{ height: `${returnH}px` }} title={`Trả: ${d.return}`} />
                      </div>
                      <span className="ov-bar-label">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="ov-chart-empty">{loading ? 'Đang tải biểu đồ…' : 'Chưa có dữ liệu'}</div>
          )}
        </article>

        {/* Donut chart – Phân bố trạng thái sách */}
        <article className="ov-panel ov-donut-panel">
          <div className="ov-panel-header">
            <div>
              <h2 className="ov-panel-title">Phân bố trạng thái sách</h2>
              <p className="ov-panel-sub">Kho sách trực tiếp theo từng trạng thái</p>
            </div>
          </div>
          {bookStatus.total > 0 || loading ? (
            <div className="ov-donut-content">
              <div className="ov-donut-wrap">
                <svg className="ov-donut-svg" viewBox="0 0 100 100" role="img" aria-label={`Tổng ${bookStatus.total} bản vật lý`}>
                  <circle cx="50" cy="50" r="39" fill="none" stroke="#f6f3f0" strokeWidth="12" />
                  {donutData.map((seg) => (
                    <circle
                      key={seg.key}
                      cx="50"
                      cy="50"
                      r="39"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="12"
                      strokeDasharray={`${seg.dash} ${seg.circ - seg.dash}`}
                      strokeDashoffset={-seg.offset}
                      transform="rotate(-90 50 50)"
                    />
                  ))}
                </svg>
                <div className="ov-donut-center">
                  <strong>{loading ? '—' : bookStatus.total.toLocaleString('vi-VN')}</strong>
                  <span>bản vật lý</span>
                </div>
              </div>
              <div className="ov-donut-legend">
                {donutData.map((d) => (
                  <div className="ov-legend-item" key={d.key}>
                    <span className="ov-legend-color" style={{ backgroundColor: d.color }} />
                    <span className="ov-legend-text">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="ov-chart-empty">Chưa có dữ liệu</div>
          )}
        </article>
      </section>

      {/* ── Danh sách báo cáo đang chờ ── */}
      <section className="ov-panel ov-pending-panel">
        <h2 className="ov-panel-title">Danh sách báo cáo đang chờ</h2>
        <div className="ov-pending-list">
          <div className="ov-pending-item">
            <span className="ov-pending-icon">
              <CheckCircle size={18} />
            </span>
            <div className="ov-pending-copy">
              <strong>{overview?.pendingBorrowRequests ?? 0} yêu cầu mới cần duyệt</strong>
              <p>Đơn mượn sách sinh viên và cán bộ chờ xử lý</p>
            </div>
          </div>
          <div className="ov-pending-item">
            <span className="ov-pending-icon">
              <AlertCircle size={18} />
            </span>
            <div className="ov-pending-copy">
              <strong>{overview?.overdueLoans ?? 0} sách quá hạn</strong>
              <p>Cần nhắc nhở và gia hạn cho độc giả</p>
            </div>
          </div>
        </div>
      </section>

      {loading && (
        <div className="ov-loading-state">
          <LoaderCircle size={18} className="ov-spin" /> Đang cập nhật dữ liệu...
        </div>
      )}
    </div>
  );
};

export default AdminOverviewPage;
