import React, { useState, useEffect } from 'react';
import {
  Users,
  BookOpen,
  FileCheck,
  LoaderCircle,
  BookCopy,
  ArrowUpRight,
  Upload,
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
  borrowedCount: number;
  overdueCount: number;
}

const LibrarianDashboard: React.FC = () => {
  const [statsData, setStatsData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { headers });
        const json = await res.json();
        if (json.success && json.data) {
          setStatsData(json.data);
        }
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [accessToken]);

  const cards = [
    {
      label: 'Đơn chờ duyệt',
      value: statsData ? statsData.pendingRegistrations.toLocaleString() : '...',
      icon: FileCheck,
      tone: 'lib-tone-orange',
      note: 'Hồ sơ độc giả cần xét duyệt',
      link: '/librarian/registrations',
    },
    {
      label: 'Độc giả hệ thống',
      value: statsData ? statsData.totalReaders.toLocaleString() : '...',
      icon: Users,
      tone: 'lib-tone-blue',
      note: 'Tài khoản bạn đọc đang lưu trữ',
      link: '/librarian/readers',
    },
    {
      label: 'Tổng đầu sách',
      value: statsData ? statsData.totalBooks.toLocaleString() : '...',
      icon: BookOpen,
      tone: 'lib-tone-green',
      note: `${statsData ? statsData.availableCopies.toLocaleString() : '0'} bản sách sẵn sàng mượn`,
      link: '/librarian/books',
    },
    {
      label: 'Sách đang được mượn',
      value: statsData ? statsData.borrowedCount.toLocaleString() : '...',
      icon: BookCopy,
      tone: 'lib-tone-purple',
      note: `${statsData ? statsData.overdueCount.toLocaleString() : '0'} lượt quá hạn cần nhắc nhở`,
    },
  ];

  const totalCopiesEstimate = (statsData?.availableCopies ?? 0) + (statsData?.borrowedCount ?? 0);
  const availablePercent = totalCopiesEstimate > 0 
    ? Math.round(((statsData?.availableCopies ?? 0) / totalCopiesEstimate) * 100)
    : 100;
  const borrowedPercent = 100 - availablePercent;

  return (
    <div className="lib-overview">
      {/* Header */}
      <header className="lib-page-heading">
        <div>
          <p className="lib-eyebrow">THỦ THƯ / BẢNG ĐIỀU KHIỂN</p>
          <h1>Tổng Quan Nghiệp Vụ Thư Viện</h1>
          <p className="lib-page-description">
            Theo dõi hoạt động mượn trả, phê duyệt hồ sơ bạn đọc và quản lý kho sách theo thời gian thực.
          </p>
        </div>
        {loading && (
          <div className="lib-refresh-state">
            <LoaderCircle className="lib-spin" size={16} />
            <span>Đang cập nhật số liệu...</span>
          </div>
        )}
      </header>

      {/* Top 4 Metrics Cards */}
      <div className="lib-metric-grid">
        {cards.map((card) => {
          const CardContent = (
            <>
              <div className="lib-metric-card-top">
                <span className={`lib-metric-icon ${card.tone}`}>
                  <card.icon size={19} />
                </span>
                {card.link && <ArrowUpRight className="lib-metric-arrow" size={18} />}
              </div>
              <div className="lib-metric-value">{card.value}</div>
              <div className="lib-metric-label">{card.label}</div>
              <div className="lib-metric-note">{card.note}</div>
            </>
          );

          return card.link ? (
            <Link key={card.label} to={card.link} className="lib-metric-card">
              {CardContent}
            </Link>
          ) : (
            <div key={card.label} className="lib-metric-card">
              {CardContent}
            </div>
          );
        })}
      </div>

      {/* Lower Section: Quick Actions & Status Breakdown */}
      <div className="lib-grid-two">
        {/* Quick Actions Panel */}
        <section className="lib-panel">
          <header className="lib-panel-header">
            <p className="lib-panel-kicker">TIỆN ÍCH QUẢN LÝ</p>
            <h2>Thao Tác Nghiệp Vụ Nhanh</h2>
            <p>Truy cập trực tiếp các quy trình làm việc thường nhật của Thủ thư</p>
          </header>
          <div className="lib-actions-grid">
            <Link to="/librarian/registrations" className="lib-action-card">
              <span className="lib-action-icon lib-tone-orange">
                <FileCheck size={19} />
              </span>
              <div className="lib-action-info">
                <strong>Duyệt Đăng Ký Tài Khoản</strong>
                <p>Xem xét và kích hoạt hồ sơ bạn đọc đăng ký từ bên ngoài</p>
              </div>
            </Link>

            <Link to="/librarian/registrations" className="lib-action-card">
              <span className="lib-action-icon lib-tone-blue">
                <Upload size={19} />
              </span>
              <div className="lib-action-info">
                <strong>Nhập Danh Sách Sinh Viên</strong>
                <p>Tải lên tệp CSV cấp hàng loạt tài khoản bạn đọc trường FPT</p>
              </div>
            </Link>

            <Link to="/librarian/readers" className="lib-action-card">
              <span className="lib-action-icon lib-tone-purple">
                <Users size={19} />
              </span>
              <div className="lib-action-info">
                <strong>Danh Sách Độc Giả</strong>
                <p>Tra cứu hồ sơ bạn đọc, gia hạn thẻ và lịch sử mượn trả</p>
              </div>
            </Link>

            <Link to="/librarian/books" className="lib-action-card">
              <span className="lib-action-icon lib-tone-green">
                <BookOpen size={19} />
              </span>
              <div className="lib-action-info">
                <strong>Quản Lý Kho Sách</strong>
                <p>Cập nhật số lượng ấn bản, đầu sách và tình trạng vật lý</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Operational Status Panel */}
        <section className="lib-panel">
          <header className="lib-panel-header">
            <p className="lib-panel-kicker">TRẠNG THÁI HOẠT ĐỘNG</p>
            <h2>Chỉ Số Tài Nguyên Thư Viện</h2>
            <p>Tình trạng lưu thông và phân bổ ấn phẩm trong kho</p>
          </header>
          <div className="lib-breakdown-list">
            <div className="lib-breakdown-item">
              <div className="lib-breakdown-row">
                <span className="lib-breakdown-name">
                  <span className="lib-breakdown-dot" style={{ background: '#10b981' }} />
                  Bản sách sẵn sàng phục vụ
                </span>
                <span className="lib-breakdown-val">
                  {statsData?.availableCopies ?? 0} ({availablePercent}%)
                </span>
              </div>
              <div className="lib-progress-bar">
                <div
                  className="lib-progress-fill"
                  style={{ width: `${availablePercent}%`, background: '#10b981' }}
                />
              </div>
            </div>

            <div className="lib-breakdown-item">
              <div className="lib-breakdown-row">
                <span className="lib-breakdown-name">
                  <span className="lib-breakdown-dot" style={{ background: '#8b5cf6' }} />
                  Sách đang lưu hành (được mượn)
                </span>
                <span className="lib-breakdown-val">
                  {statsData?.borrowedCount ?? 0} ({borrowedPercent}%)
                </span>
              </div>
              <div className="lib-progress-bar">
                <div
                  className="lib-progress-fill"
                  style={{ width: `${borrowedPercent}%`, background: '#8b5cf6' }}
                />
              </div>
            </div>

            <div className="lib-breakdown-item">
              <div className="lib-breakdown-row">
                <span className="lib-breakdown-name">
                  <span className="lib-breakdown-dot" style={{ background: '#ef4444' }} />
                  Lượt mượn quá hạn cần thu hồi
                </span>
                <span className="lib-breakdown-val" style={{ color: '#ef4444' }}>
                  {statsData?.overdueCount ?? 0} lượt
                </span>
              </div>
              <div className="lib-progress-bar">
                <div
                  className="lib-progress-fill"
                  style={{
                    width: statsData?.borrowedCount ? `${Math.min(100, Math.round(((statsData?.overdueCount ?? 0) / statsData.borrowedCount) * 100))}%` : '0%',
                    background: '#ef4444',
                  }}
                />
              </div>
            </div>

            <div className="lib-breakdown-item">
              <div className="lib-breakdown-row">
                <span className="lib-breakdown-name">
                  <span className="lib-breakdown-dot" style={{ background: '#e8783e' }} />
                  Đơn đăng ký đang đợi duyệt
                </span>
                <span className="lib-breakdown-val" style={{ color: '#e8783e' }}>
                  {statsData?.pendingRegistrations ?? 0} đơn
                </span>
              </div>
              <div className="lib-progress-bar">
                <div
                  className="lib-progress-fill"
                  style={{
                    width: statsData?.pendingRegistrations ? '100%' : '0%',
                    background: '#e8783e',
                  }}
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LibrarianDashboard;
