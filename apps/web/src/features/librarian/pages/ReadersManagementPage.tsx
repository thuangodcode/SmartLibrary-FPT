import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Check,
  Clock,
  Eye,
  FileText,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { parseApiResponse } from '../../../lib/api';
import { API_BASE_URL } from '../../../config';
import './ReadersManagementPage.css';

interface ReaderItem {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  studentId?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
  roleName: string;
  status: string | number;
  readerType?: string | null;
  membershipExpiresAt?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  borrowingCount?: number;
  overdueCount?: number;
  unpaidFines?: number;
}

interface ReaderStats {
  totalReaders: number;
  activeReaders: number;
  pendingReaders: number;
  suspendedReaders: number;
}

interface ReadersResponse {
  items: ReaderItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: ReaderStats;
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const readerTypeLabels: Record<string, string> = {
  Student: 'Sinh viên',
  Lecturer: 'Giảng viên',
  External: 'Người bên ngoài trường',
};

const normalizeReaderType = (type?: string | null): string => {
  if (!type) return 'External';
  if (type === '0' || type === 'Student') return 'Student';
  if (type === '1' || type === 'Lecturer') return 'Lecturer';
  if (type === '2' || type === 'External') return 'External';
  return type;
};

const normalizeStatus = (status: string | number): string => {
  if (status === 0 || status === '0' || status === 'Active') return 'Active';
  if (status === 1 || status === '1' || status === 'PendingVerification') return 'PendingVerification';
  if (status === 2 || status === '2' || status === 'PendingApproval') return 'PendingApproval';
  if (status === 3 || status === '3' || status === 'Suspended') return 'Suspended';
  if (status === 4 || status === '4' || status === 'Rejected') return 'Rejected';
  return String(status);
};

const statusLabels: Record<string, string> = {
  Active: 'Hoạt động',
  PendingVerification: 'Chờ xác minh',
  PendingApproval: 'Chờ duyệt',
  Suspended: 'Tạm khóa',
  Rejected: 'Từ chối',
};

const statusToneMap: Record<string, string> = {
  Active: 'active',
  PendingVerification: 'pending',
  PendingApproval: 'pending',
  Suspended: 'suspended',
  Rejected: 'suspended',
};

const readerInitials = (name?: string | null) =>
  name
    ? name.split(' ').map((part) => part[0]).filter(Boolean).slice(-2).join('').toUpperCase()
    : 'ĐG';

const ReaderAvatar: React.FC<{ name: string; url?: string | null; className: string }> = ({ name, url, className }) => (
  <div className={className}>
    {url ? <img src={url} alt={`Ảnh đại diện ${name}`} /> : readerInitials(name)}
  </div>
);

const ReadersManagementPage: React.FC = () => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [data, setData] = useState<ReadersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [readerTypeFilter, setReaderTypeFilter] = useState<'All' | 'Student' | 'Lecturer' | 'External'>('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Detail Modal
  const [selectedReader, setSelectedReader] = useState<ReaderItem | null>(null);
  const [toast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const fetchReaders = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: '10',
    });

    if (search.trim()) params.set('q', search.trim());
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (readerTypeFilter !== 'All') params.set('readerType', readerTypeFilter);

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/readers?${params}`, { headers });
      const result = await parseApiResponse<ApiResult<ReadersResponse>>(res);

      if (!res.ok || !result?.data) {
        throw new Error(result?.error || 'Không thể tải danh sách độc giả.');
      }

      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải danh sách độc giả.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, page, readerTypeFilter, search, statusFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchReaders());
  }, [fetchReaders]);

  // Handle Tab change (reset to page 1)
  const handleTypeTabChange = (type: 'All' | 'Student' | 'Lecturer' | 'External') => {
    setReaderTypeFilter(type);
    setPage(1);
  };

  const stats = useMemo(() => {
    return (
      data?.stats ?? {
        totalReaders: 0,
        activeReaders: 0,
        pendingReaders: 0,
        suspendedReaders: 0,
      }
    );
  }, [data]);

  return (
    <div className="lib-readers-page">
      {/* ─── Page Heading ─── */}
      <header className="lib-readers-heading">
        <div>
          <p className="lib-readers-eyebrow">THỦ THƯ / QUẢN LÝ ĐỘC GIẢ</p>
          <h1>Quản Lý Thông Tin Bạn Đọc</h1>
          <p className="lib-readers-description">
            Tra cứu, theo dõi hồ sơ thông tin và trạng thái thẻ của toàn bộ bạn đọc trong hệ thống thư viện.
          </p>
        </div>
        <div className="lib-readers-actions">
          <button className="lib-readers-button lib-readers-button--secondary" onClick={fetchReaders} type="button">
            <RefreshCw size={14} className={loading ? 'lib-readers-spin' : ''} /> Làm mới
          </button>
        </div>
      </header>

      {/* ─── Top 4 Metric Cards (Matching AdminUsersPage) ─── */}
      <div className="lib-readers-metrics">
        <article className="lib-readers-metric">
          <span className="lib-readers-metric-icon lib-readers-tone-orange">
            <Users size={18} />
          </span>
          <div>
            <p>Tổng số độc giả</p>
            <strong>{stats.totalReaders}</strong>
          </div>
        </article>

        <article className="lib-readers-metric">
          <span className="lib-readers-metric-icon lib-readers-tone-green">
            <UserCheck size={18} />
          </span>
          <div>
            <p>Đang hoạt động</p>
            <strong>{stats.activeReaders}</strong>
          </div>
        </article>

        <article className="lib-readers-metric">
          <span className="lib-readers-metric-icon lib-readers-tone-blue">
            <Clock size={18} />
          </span>
          <div>
            <p>Chờ duyệt thẻ</p>
            <strong>{stats.pendingReaders}</strong>
          </div>
        </article>

        <article className="lib-readers-metric">
          <span className="lib-readers-metric-icon lib-readers-tone-purple">
            <UserX size={18} />
          </span>
          <div>
            <p>Bị tạm khóa</p>
            <strong>{stats.suspendedReaders}</strong>
          </div>
        </article>
      </div>

      {/* ─── Main Table Panel (Unified with Admin UI) ─── */}
      <section className="lib-readers-table-panel">
        {/* Category Tabs: Excludes Librarian, displays only Reader types */}
        <div className="lib-readers-tabs">
          <button
            type="button"
            className={readerTypeFilter === 'All' ? 'is-active' : ''}
            onClick={() => handleTypeTabChange('All')}
          >
            Tất cả độc giả <span>{stats.totalReaders}</span>
          </button>
          <button
            type="button"
            className={readerTypeFilter === 'Student' ? 'is-active' : ''}
            onClick={() => handleTypeTabChange('Student')}
          >
            Sinh viên
          </button>
          <button
            type="button"
            className={readerTypeFilter === 'Lecturer' ? 'is-active' : ''}
            onClick={() => handleTypeTabChange('Lecturer')}
          >
            Giảng viên
          </button>
          <button
            type="button"
            className={readerTypeFilter === 'External' ? 'is-active' : ''}
            onClick={() => handleTypeTabChange('External')}
          >
            Độc giả ngoài trường
          </button>
        </div>

        {/* Toolbar Heading */}
        <div className="lib-readers-table-heading">
          <div>
            <h2>Danh sách bạn đọc ({data?.totalCount ?? 0})</h2>
            <p>Hiển thị các tài khoản độc giả đang lưu trữ trong cơ sở dữ liệu thư viện</p>
          </div>

          <div className="lib-readers-filters">
            <label className="lib-readers-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Tìm theo họ tên, email, MSSV, SĐT..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </label>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="All">Tất cả trạng thái</option>
              <option value="Active">Đang hoạt động</option>
              <option value="PendingApproval">Chờ duyệt thẻ</option>
              <option value="PendingVerification">Chờ xác minh</option>
              <option value="Suspended">Tạm khóa</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="lib-readers-table-scroll">
          {loading ? (
            <div className="lib-readers-state">
              <LoaderCircle className="lib-readers-spin" size={26} />
              <span>Đang tải danh sách bạn đọc...</span>
            </div>
          ) : error ? (
            <div className="lib-readers-state" style={{ color: '#dc2626' }}>
              <AlertCircle size={26} />
              <span>{error}</span>
              <button className="lib-readers-button lib-readers-button--secondary" onClick={fetchReaders} type="button">
                Thử lại
              </button>
            </div>
          ) : (data?.items.length ?? 0) === 0 ? (
            <div className="lib-readers-state">
              <FileText size={26} />
              <span>Không tìm thấy tài khoản bạn đọc nào phù hợp.</span>
            </div>
          ) : (
            <table className="lib-readers-table">
              <thead>
                <tr>
                  <th>Mã Độc Giả / MSSV</th>
                  <th>Họ Và Tên</th>
                  <th>Số Điện Thoại</th>
                  <th>Phân Loại</th>
                  <th>Trạng Thái</th>
                  <th>Lưu Thông Sách</th>
                  <th>Ngày Tham Gia</th>
                  <th style={{ textAlign: 'right' }}>Thao Tác</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((reader) => {
                  const normStatus = normalizeStatus(reader.status);
                  const normType = normalizeReaderType(reader.readerType);
                  return (
                    <tr key={reader.id}>
                      <td className="lib-readers-id">
                        {reader.studentId || `#${reader.id.slice(0, 8).toUpperCase()}`}
                      </td>
                      <td>
                        <div className="lib-readers-user-cell">
                          <ReaderAvatar className="lib-readers-avatar" name={reader.fullName} url={reader.avatarUrl} />
                          <div className="lib-readers-names">
                            <strong>{reader.fullName}</strong>
                            <span>{reader.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>{reader.phone || '—'}</td>
                      <td>
                        <span className="lib-readers-type-pill">
                          {readerTypeLabels[normType] || 'Độc giả'}
                        </span>
                      </td>
                      <td>
                        <span className={`lib-readers-status lib-readers-status--${statusToneMap[normStatus] || 'pending'}`}>
                          {statusLabels[normStatus] || normStatus}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '11px', color: (reader.overdueCount ?? 0) > 0 ? '#dc2626' : '#475569' }}>
                          <strong>{reader.borrowingCount ?? 0}</strong> đang mượn
                          {(reader.overdueCount ?? 0) > 0 && ` (${reader.overdueCount} quá hạn)`}
                        </span>
                      </td>
                      <td>
                        {reader.createdAt ? new Date(reader.createdAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="lib-readers-icon-button"
                          title="Xem chi tiết bạn đọc"
                          aria-label="Xem chi tiết bạn đọc"
                          onClick={() => setSelectedReader(reader)}
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="lib-readers-pagination">
            <span>
              Trang {data.page} / {data.totalPages} (Tổng {data.totalCount} bạn đọc)
            </span>
            <div className="lib-readers-pagination-controls">
              <button
                className="lib-readers-button lib-readers-button--secondary"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                type="button"
              >
                <ArrowLeft size={13} /> Trước
              </button>
              <button
                className="lib-readers-button lib-readers-button--secondary"
                disabled={page >= data.totalPages || loading}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                type="button"
              >
                Sau <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Detail Modal (Matching Admin User Detail Dialog) ─── */}
      {selectedReader && (
        <div
          className="lib-readers-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedReader(null);
          }}
        >
          <section
            aria-labelledby="lib-reader-detail-title"
            aria-modal="true"
            className="lib-readers-dialog"
            role="dialog"
          >
            <header>
              <div className="lib-readers-dialog-head">
                <ReaderAvatar
                  className="lib-readers-dialog-avatar"
                  name={selectedReader.fullName}
                  url={selectedReader.avatarUrl}
                />
                <div>
                  <h2 id="lib-reader-detail-title">
                    {selectedReader.fullName}
                    <span
                      className={`lib-readers-status lib-readers-status--${
                        statusToneMap[normalizeStatus(selectedReader.status)] || 'pending'
                      }`}
                    >
                      {statusLabels[normalizeStatus(selectedReader.status)]}
                    </span>
                  </h2>
                  <p>
                    {readerTypeLabels[normalizeReaderType(selectedReader.readerType)]} · Mã thẻ:{' '}
                    {selectedReader.studentId || `#${selectedReader.id.slice(0, 8).toUpperCase()}`}
                  </p>
                </div>
              </div>
              <button
                aria-label="Đóng"
                className="lib-readers-dialog-close"
                onClick={() => setSelectedReader(null)}
                type="button"
              >
                <X size={18} />
              </button>
            </header>

            <div className="lib-readers-dialog-body">
              {/* Info Cards Grid */}
              <div className="lib-readers-info-grid">
                <div className="lib-readers-info-card">
                  <Mail size={16} />
                  <div>
                    <p>Địa chỉ Email</p>
                    <strong>{selectedReader.email}</strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <Phone size={16} />
                  <div>
                    <p>Số điện thoại</p>
                    <strong>{selectedReader.phone || 'Chưa cập nhật'}</strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <Calendar size={16} />
                  <div>
                    <p>Ngày sinh</p>
                    <strong>
                      {selectedReader.dateOfBirth
                        ? new Date(selectedReader.dateOfBirth).toLocaleDateString('vi-VN')
                        : 'Chưa cập nhật'}
                    </strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <MapPin size={16} />
                  <div>
                    <p>Địa chỉ</p>
                    <strong>{selectedReader.address || 'Chưa cập nhật'}</strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <Clock size={16} />
                  <div>
                    <p>Thời hạn thẻ thành viên</p>
                    <strong>
                      {selectedReader.membershipExpiresAt
                        ? new Date(selectedReader.membershipExpiresAt).toLocaleDateString('vi-VN')
                        : 'Vô thời hạn'}
                    </strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <BookOpen size={16} />
                  <div>
                    <p>Tình trạng mượn trả</p>
                    <strong>
                      {selectedReader.borrowingCount ?? 0} cuốn đang mượn (
                      {selectedReader.overdueCount ?? 0} quá hạn)
                    </strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <Calendar size={16} />
                  <div>
                    <p>Ngày tham gia thư viện</p>
                    <strong>
                      {selectedReader.createdAt
                        ? new Date(selectedReader.createdAt).toLocaleDateString('vi-VN')
                        : '—'}
                    </strong>
                  </div>
                </div>

                <div className="lib-readers-info-card">
                  <ShieldAlert size={16} />
                  <div>
                    <p>Tiền phạt chưa thanh toán</p>
                    <strong style={{ color: (selectedReader.unpaidFines ?? 0) > 0 ? '#dc2626' : '#192235' }}>
                      {Number(selectedReader.unpaidFines ?? 0).toLocaleString('vi-VN')} đ
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <footer>
              <button
                className="lib-readers-button lib-readers-button--secondary"
                onClick={() => setSelectedReader(null)}
                type="button"
              >
                Đóng
              </button>
            </footer>
          </section>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div className={`reg-toast reg-toast--${toast.tone}`} role="status">
          {toast.tone === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default ReadersManagementPage;
