import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookCopy,
  BookOpen,
  Bookmark,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileCheck,
  LayoutDashboard,
  LoaderCircle,
  RotateCcw,
  Users,
  Warehouse,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { API_BASE_URL } from '../../../config';
import './LibrarianDashboard.css';

interface DashboardStats {
  pendingRegistrations: number;
  totalReaders: number;
  totalBooks: number;
  availableCopies: number;
}

interface CirculationStats {
  pending: number;
  approved: number;
  borrowed: number;
  returned: number;
  overdue: number;
  dueSoon: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
}

const LibrarianDashboard = () => {
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [circulationStats, setCirculationStats] = useState<CirculationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(false);
  const accessToken = useAuthStore((state) => state.accessToken);

  useEffect(() => {
    let active = true;
    const loadDashboard = async () => {
      setLoading(true);
      setStatsError(false);
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        const [dashboardResponse, circulationResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers }),
          fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        ]);
        const [dashboardResult, circulationResult] = await Promise.all([
          dashboardResponse.json() as Promise<ApiEnvelope<DashboardStats>>,
          circulationResponse.json() as Promise<ApiEnvelope<CirculationStats>>,
        ]);
        if (!active) return;
        if (dashboardResponse.ok && dashboardResult.success && dashboardResult.data) {
          setDashboardStats(dashboardResult.data);
        } else {
          setStatsError(true);
        }
        if (circulationResponse.ok && circulationResult.success && circulationResult.data) {
          setCirculationStats(circulationResult.data);
        } else {
          setStatsError(true);
        }
      } catch {
        if (active) setStatsError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDashboard();
    return () => { active = false; };
  }, [accessToken]);

  const count = (value?: number) => loading ? '—' : (value ?? 0).toLocaleString('vi-VN');
  const metrics = [
    {
      label: 'Yêu cầu mượn chờ duyệt',
      value: circulationStats?.pending,
      note: 'Mở hàng chờ xác nhận',
      icon: FileCheck,
      tone: 'lib-tone-orange',
      link: '/librarian/circulation/loans',
    },
    {
      label: 'Chờ nhận sách tại quầy',
      value: circulationStats?.approved,
      note: 'Các yêu cầu đã tiếp nhận',
      icon: CheckCircle2,
      tone: 'lib-tone-blue',
      link: '/librarian/circulation/loans?view=accepted',
    },
    {
      label: 'Đang lưu hành',
      value: circulationStats?.borrowed,
      note: 'Lượt mượn chưa hoàn trả',
      icon: BookCopy,
      tone: 'lib-tone-green',
      link: '/librarian/circulation/loans?view=list',
    },
    {
      label: 'Quá hạn cần theo dõi',
      value: circulationStats?.overdue,
      note: 'Mở danh sách quá hạn',
      icon: Clock3,
      tone: 'lib-tone-red',
      link: '/librarian/circulation/overdue',
    },
  ];

  return (
    <div className="lib-overview lib-overview--circulation">
      <header className="lib-page-heading">
        <div>
          <div className="lib-eyebrow"><LayoutDashboard size={15} /><span>BÀN NGHIỆP VỤ THỦ THƯ</span></div>
          <h1>Điều phối mượn và trả sách</h1>
          <p className="lib-page-description">Mở nhanh quy trình tại quầy và theo dõi các yêu cầu cần xử lý trong ngày.</p>
        </div>
        {loading && <div className="lib-refresh-state"><LoaderCircle className="lib-spin" size={17} /><span>Đang cập nhật...</span></div>}
      </header>

      <section className="lib-desk-actions" aria-label="Thao tác mượn trả tại quầy">
        <Link to="/librarian/circulation/direct-borrow" className="lib-desk-action lib-desk-action--borrow">
          <span className="lib-desk-action-icon"><BookOpen size={25} /></span>
          <span className="lib-desk-action-copy"><strong>Lập phiếu mượn tại quầy</strong><small>Tra cứu độc giả và sách, ghi nhận giao sách trực tiếp.</small></span>
          <span className="lib-desk-action-cta">Bắt đầu mượn <ArrowRight size={17} /></span>
        </Link>
        <Link to="/librarian/circulation/return?mode=barcode" className="lib-desk-action lib-desk-action--return">
          <span className="lib-desk-action-icon"><RotateCcw size={25} /></span>
          <span className="lib-desk-action-copy"><strong>Ghi nhận trả sách</strong><small>Quét hoặc nhập mã vạch để nhận sách và cập nhật tình trạng.</small></span>
          <span className="lib-desk-action-cta">Bắt đầu trả <ArrowRight size={17} /></span>
        </Link>
      </section>

      <section className="lib-metric-grid" aria-label="Tình hình mượn trả">
        {metrics.map((metric) => (
          <Link key={metric.label} to={metric.link} className="lib-metric-card">
            <div className="lib-metric-card-top"><span className={`lib-metric-icon ${metric.tone}`}><metric.icon size={21} /></span><ArrowRight className="lib-metric-arrow" size={17} /></div>
            <div className="lib-metric-value">{count(metric.value)}</div>
            <div className="lib-metric-label">{metric.label}</div>
            <div className="lib-metric-note">{metric.note}</div>
          </Link>
        ))}
      </section>

      <section className="lib-desk-followup">
        <div className="lib-desk-followup-heading">
          <div><p className="lib-panel-kicker">THEO DÕI CA LÀM</p><h2>Các mốc cần chú ý</h2></div>
          <span>{loading ? 'Đang tải số liệu' : 'Số liệu hiện tại'}</span>
        </div>
        <div className="lib-desk-followup-grid">
          <Link to="/librarian/circulation/loans" className="lib-followup-item">
            <span className="lib-followup-icon is-orange"><FileCheck size={18} /></span><span><strong>{count(circulationStats?.pending)} yêu cầu mượn chờ duyệt</strong><small>Xem thông tin và xác nhận yêu cầu của độc giả</small></span><ArrowRight size={16} />
          </Link>
          <Link to="/librarian/circulation/loans?view=accepted" className="lib-followup-item">
            <span className="lib-followup-icon is-blue"><CheckCircle2 size={18} /></span><span><strong>{count(circulationStats?.approved)} độc giả chờ nhận sách</strong><small>Đối chiếu lịch nhận và bàn giao bản sao</small></span><ArrowRight size={16} />
          </Link>
          <Link to="/librarian/circulation/loans?view=due" className="lib-followup-item">
            <span className="lib-followup-icon is-purple"><CalendarClock size={18} /></span><span><strong>{count(circulationStats?.dueSoon)} sách sắp đến hạn</strong><small>Kiểm tra các lượt mượn cần nhắc trả</small></span><ArrowRight size={16} />
          </Link>
          <Link to="/librarian/circulation/overdue" className="lib-followup-item">
            <span className="lib-followup-icon is-red"><Clock3 size={18} /></span><span><strong>{count(circulationStats?.overdue)} lượt đang quá hạn</strong><small>Theo dõi trả sách và xử lý sự cố nếu có</small></span><ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {statsError && <p className="lib-dashboard-data-note" role="status">Một số số liệu chưa tải được. Hãy tải lại trang để đồng bộ.</p>}

      <section className="lib-secondary-tools" aria-label="Các chức năng quản lý khác">
        <div><p className="lib-panel-kicker">CHỨC NĂNG LIÊN QUAN</p><h2>Quản lý thư viện</h2></div>
        <div className="lib-secondary-links">
          <Link to="/librarian/circulation/reservations"><Bookmark size={16} />Đặt chỗ</Link>
          <Link to="/librarian/circulation/fines"><CircleDollarSign size={16} />Phí phạt</Link>
          <Link to="/librarian/books/copies"><Warehouse size={16} />Kho sách</Link>
          <Link to="/librarian/readers"><Users size={16} />Độc giả</Link>
          <Link to="/librarian/registrations"><FileCheck size={16} />Duyệt đăng ký{dashboardStats?.pendingRegistrations ? ` (${dashboardStats.pendingRegistrations})` : ''}</Link>
          <Link to="/librarian/books"><BookCopy size={16} />Đầu sách{dashboardStats ? ` (${dashboardStats.totalBooks.toLocaleString('vi-VN')})` : ''}</Link>
        </div>
        {dashboardStats && <p className="lib-secondary-summary">{dashboardStats.availableCopies.toLocaleString('vi-VN')} bản sao sẵn sàng · {dashboardStats.totalReaders.toLocaleString('vi-VN')} độc giả</p>}
      </section>
    </div>
  );
};

export default LibrarianDashboard;
