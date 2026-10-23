import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowUpRight, BookOpen, CheckCircle2, Clock3, FileCheck2, LoaderCircle, Users, WalletCards } from 'lucide-react';
import { Link } from 'react-router-dom';
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

interface ReportList {
  items: Array<{
    id: string;
    code: string;
    name: string;
    submitter: string;
    createdAt: string;
    isViewed: boolean;
    isApproved: boolean;
    status: string;
  }>;
  totalCount: number;
}

const statusLabels: Record<string, string> = {
  Pending: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Borrowed: 'Đang mượn',
  Returned: 'Đã trả',
  Overdue: 'Quá hạn',
  Rejected: 'Từ chối',
};

const statusColors: Record<string, string> = {
  Pending: '#f3a443',
  Approved: '#6e82e8',
  Borrowed: '#5d78da',
  Returned: '#50b991',
  Overdue: '#e46b61',
  Rejected: '#a3aab8',
};

const AdminOverviewPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportList, setReportList] = useState<ReportList | null>(null);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();

    const loadLatestReports = async () => {
      if (!accessToken) {
        setReportError('Vui lòng đăng nhập Admin để xem báo cáo.');
        setReportsLoading(false);
        return;
      }

      setReportsLoading(true);
      setReportError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/admin/reports?page=1&pageSize=5&sortBy=createdAt&sortDirection=desc`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          },
        );
        const result = await parseApiResponse<{ success?: boolean; error?: string; data?: ReportList }>(response);

        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || `Không tải được báo cáo mới nhất (HTTP ${response.status}).`);
        }

        setReportList(result.data);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setReportError(loadError instanceof Error ? loadError.message : 'Không tải được báo cáo mới nhất.');
      } finally {
        if (!controller.signal.aborted) setReportsLoading(false);
      }
    };

    void loadLatestReports();
    return () => controller.abort();
  }, [accessToken]);

  const totalStatuses = useMemo(
    () => overview?.borrowStatusBreakdown.reduce((total, item) => total + item.count, 0) ?? 0,
    [overview],
  );
  const circumference = 2 * Math.PI * 39;
  const donutSegments = useMemo(() => {
    const items = overview?.borrowStatusBreakdown ?? [];
    return items.map((item, index) => ({
      item,
      dash: totalStatuses === 0 ? 0 : (item.count / totalStatuses) * circumference,
      offset: items
        .slice(0, index)
        .reduce((sum, previous) => sum + (totalStatuses === 0 ? 0 : (previous.count / totalStatuses) * circumference), 0),
    }));
  }, [circumference, overview, totalStatuses]);
  const maxMonthlyCount = Math.max(1, ...(overview?.monthlyBorrowing.map((item) => item.count) ?? [0]));

  const cards = [
    { label: 'Độc giả đang hoạt động', value: overview?.activeReaders, icon: Users, tone: 'orange', note: 'Tài khoản đang hoạt động' },
    { label: 'Đầu sách trong thư viện', value: overview?.totalBooks, icon: BookOpen, tone: 'blue', note: `${overview?.totalCopies ?? 0} bản sách` },
    { label: 'Lượt mượn hiện tại', value: overview?.activeLoans, icon: WalletCards, tone: 'green', note: `${overview?.overdueLoans ?? 0} lượt quá hạn` },
    { label: 'Yêu cầu cần xử lý', value: (overview?.pendingRegistrations ?? 0) + (overview?.pendingBorrowRequests ?? 0), icon: Clock3, tone: 'purple', note: `${overview?.pendingRegistrations ?? 0} đăng ký · ${overview?.pendingBorrowRequests ?? 0} yêu cầu mượn` },
  ];

  return (
    <div className="admin-overview">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">SMARTLIBRARY · TRUNG TÂM ĐIỀU HÀNH</p>
          <h1>Tổng quan</h1>
          <p className="admin-page-description">Theo dõi hoạt động thư viện và các công việc cần ưu tiên.</p>
        </div>
        {loading && (
          <span className="admin-refresh-state"><LoaderCircle size={15} className="admin-spin" /> Đang cập nhật</span>
        )}
      </div>

      {error && (
        <div className="admin-error" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="admin-metric-grid" aria-label="Chỉ số thư viện">
        {cards.map(({ label, value, icon: Icon, tone, note }) => (
          <article className="admin-metric-card" key={label}>
            <div className="admin-metric-card-top">
              <span className={`admin-metric-icon admin-tone-${tone}`}><Icon size={19} /></span>
              <span className="admin-metric-spark"><ArrowUpRight size={15} /></span>
            </div>
            <p className="admin-metric-value">{loading && value === undefined ? '—' : (value ?? 0).toLocaleString('vi-VN')}</p>
            <h2>{label}</h2>
            <p className="admin-metric-note">{note}</p>
          </article>
        ))}
      </section>

      <section className="admin-chart-grid">
        <article className="admin-panel admin-trend-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-panel-kicker">HOẠT ĐỘNG</p>
              <h2>Xu hướng mượn sách</h2>
            </div>
            <span className="admin-period-chip">6 tháng gần nhất</span>
          </div>
          {overview ? (
            <div className="admin-bar-chart" role="img" aria-label="Biểu đồ số lượt mượn sách trong sáu tháng gần nhất">
              {overview.monthlyBorrowing.map((item) => {
                const monthLabel = new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(new Date(item.year, item.month - 1));
                const height = item.count === 0 ? 4 : Math.max(9, (item.count / maxMonthlyCount) * 100);
                return (
                  <div className="admin-bar-column" key={`${item.year}-${item.month}`}>
                    <span className="admin-bar-value">{item.count.toLocaleString('vi-VN')}</span>
                    <div className="admin-bar-track">
                      <div className="admin-bar" style={{ height: `${height}%` }} />
                    </div>
                    <span className="admin-bar-label">{monthLabel}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="admin-chart-placeholder">{loading ? 'Đang tải biểu đồ…' : 'Chưa có dữ liệu để hiển thị.'}</div>
          )}
        </article>

        <article className="admin-panel admin-status-panel">
          <div className="admin-panel-heading">
            <div>
              <p className="admin-panel-kicker">PHÂN TÍCH</p>
              <h2>Tình trạng mượn</h2>
            </div>
          </div>
          {overview ? (
            <>
              <div className="admin-donut-wrap">
                <svg className="admin-donut" viewBox="0 0 100 100" role="img" aria-label={`Tổng ${totalStatuses.toLocaleString('vi-VN')} lượt mượn`}>
                  <circle cx="50" cy="50" r="39" fill="none" stroke="#f0f2f6" strokeWidth="12" />
                  {donutSegments.map(({ item, dash, offset }) => (
                      <circle
                        key={item.status}
                        cx="50"
                        cy="50"
                        r="39"
                        fill="none"
                        stroke={statusColors[item.status] ?? '#a3aab8'}
                        strokeWidth="12"
                        strokeDasharray={`${dash} ${circumference - dash}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 50 50)"
                      />
                  ))}
                </svg>
                <div className="admin-donut-total">
                  <strong>{totalStatuses.toLocaleString('vi-VN')}</strong>
                  <span>lượt mượn</span>
                </div>
              </div>
              <div className="admin-status-legend">
                {overview.borrowStatusBreakdown.map((item) => (
                  <div className="admin-legend-item" key={item.status}>
                    <span className="admin-legend-label">
                      <i style={{ backgroundColor: statusColors[item.status] ?? '#a3aab8' }} />
                      {statusLabels[item.status] ?? item.status}
                    </span>
                    <strong>{item.count.toLocaleString('vi-VN')}</strong>
                  </div>
                ))}
                {overview.borrowStatusBreakdown.length === 0 && <p className="admin-empty-note">Chưa có lượt mượn.</p>}
              </div>
            </>
          ) : (
            <div className="admin-chart-placeholder">{loading ? 'Đang tải dữ liệu…' : 'Chưa có dữ liệu để hiển thị.'}</div>
          )}
        </article>
      </section>

      <section className="admin-panel admin-tasks-panel">
        <div className="admin-panel-heading">
          <div>
            <p className="admin-panel-kicker">CẦN QUAN TÂM</p>
            <h2>Công việc cần xử lý</h2>
          </div>
          <span className="admin-task-count">
            {reportsLoading ? 'Đang tải' : reportError ? 'Không tải được' : `${Math.min(reportList?.totalCount ?? 0, 5)} báo cáo mới nhất`}
          </span>
        </div>
        {reportsLoading ? (
          <div className="admin-report-empty"><LoaderCircle size={18} className="admin-spin" /> Đang tải báo cáo mới nhất…</div>
        ) : reportError ? (
          <div className="admin-report-error" role="alert"><AlertCircle size={17} />{reportError}</div>
        ) : reportList?.items.length ? (
          <div className="admin-report-list">
            {reportList.items.map((report) => (
              <Link to={`/admin/reports/${report.id}`} className="admin-report-row" key={report.id}>
                <span className="admin-report-icon"><FileCheck2 size={19} /></span>
                <span className="admin-report-copy">
                  <strong>{report.name}</strong>
                  <small>{report.code} · {report.submitter} · {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(report.createdAt))}</small>
                </span>
                <span className={`admin-report-status ${report.isApproved ? 'is-approved' : 'is-pending'}`}>
                  {report.isApproved ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
                  {report.isApproved ? 'Đã duyệt' : 'Chưa duyệt'}
                </span>
                <ArrowUpRight size={17} className="admin-report-arrow" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="admin-report-empty">Chưa có báo cáo nào được Thủ thư gửi.</div>
        )}
        {reportList && reportList.totalCount > reportList.items.length && (
          <Link to="/admin/reports" className="admin-report-view-all">
            Xem tất cả {reportList.totalCount.toLocaleString('vi-VN')} báo cáo
            <ArrowUpRight size={15} />
          </Link>
        )}
      </section>
    </div>
  );
};

export default AdminOverviewPage;
