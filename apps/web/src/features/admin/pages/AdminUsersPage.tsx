import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  UserRound,
  UserRoundCheck,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminUsersPage.css';

type UserRole = 'Reader' | 'Librarian';
type ReaderType = 'Student' | 'Lecturer' | 'External';

interface ManagedUser {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string | null;
  employeeId?: string | null;
  studentId?: string | null;
  teacherId?: string | null;
  phone?: string | null;
  readerType?: ReaderType | null;
  status: string;
  isActive: boolean;
  createdAt: string;
  roleName: UserRole;
}

interface UserStats {
  totalReaders: number;
  studentReaders: number;
  lecturerReaders: number;
  externalReaders: number;
  totalLibrarians: number;
  activeLibrarians: number;
}

interface UserListData {
  items: ManagedUser[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats: UserStats;
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const EMPTY_STATS: UserStats = {
  totalReaders: 0,
  studentReaders: 0,
  lecturerReaders: 0,
  externalReaders: 0,
  totalLibrarians: 0,
  activeLibrarians: 0,
};

const statusLabels: Record<string, string> = {
  Active: 'Hoạt động',
  PendingVerification: 'Chờ xác minh',
  PendingApproval: 'Chờ duyệt',
  Suspended: 'Tạm khóa',
  Rejected: 'Từ chối',
  PendingActivation: 'Chờ kích hoạt',
  PendingDocuments: 'Thiếu hồ sơ',
};

const readerTypeLabels: Record<ReaderType, string> = {
  Student: 'Sinh viên trong trường',
  Lecturer: 'Giảng viên trong trường',
  External: 'Người bên ngoài trường',
};

const AdminUsersPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const location = useLocation();
  const [role, setRole] = useState<UserRole>(() => (location.state as { role?: UserRole } | null)?.role ?? 'Reader');
  const [readerType, setReaderType] = useState<'All' | ReaderType>('All');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    if (!accessToken) {
      setError('Phiên đăng nhập Admin không hợp lệ. Vui lòng đăng nhập lại.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      role,
      page: String(page),
      pageSize: '10',
    });
    if (search.trim()) params.set('q', search.trim());
    if (status !== 'All') params.set('status', status);
    if (role === 'Reader' && readerType !== 'All') params.set('readerType', readerType);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      const result = await parseApiResponse<ApiResult<UserListData>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể tải danh sách người dùng.');
      }
      setData(result.data);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : 'Không thể tải danh sách người dùng.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accessToken, page, readerType, role, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadUsers(controller.signal));
    return () => controller.abort();
  }, [loadUsers]);

  const routeToast = (location.state as { toast?: string } | null)?.toast;

  const metrics = useMemo(() => {
    const stats = data?.stats ?? EMPTY_STATS;
    if (role === 'Librarian') {
      return [
        { label: 'Tổng số thủ thư', value: stats.totalLibrarians, icon: Users, tone: 'orange' },
        { label: 'Đang hoạt động', value: stats.activeLibrarians, icon: UserRoundCheck, tone: 'green' },
        { label: 'Không hoạt động', value: stats.totalLibrarians - stats.activeLibrarians, icon: UserRound, tone: 'blue' },
      ];
    }
    return [
      { label: 'Tổng số độc giả', value: stats.totalReaders, icon: Users, tone: 'orange' },
      { label: 'Sinh viên trong trường', value: stats.studentReaders, icon: UserRoundCheck, tone: 'green' },
      { label: 'Giảng viên', value: stats.lecturerReaders, icon: UserRound, tone: 'blue' },
      { label: 'Người bên ngoài trường', value: stats.externalReaders, icon: Users, tone: 'purple' },
    ];
  }, [data?.stats, role]);

  const setRoleTab = (nextRole: UserRole) => {
    setRole(nextRole);
    setPage(1);
    setStatus('All');
    setReaderType('All');
  };

  return (
    <section className="admin-users-page">
      {routeToast && (
        <div className="admin-users-toast admin-users-toast--success" role="status">
          <Check size={16} />
          {routeToast}
          <button type="button" aria-label="Đóng thông báo" onClick={() => navigate('.', { replace: true, state: null })}>×</button>
        </div>
      )}
      <header className="admin-users-heading">
        <div>
          <p className="admin-users-eyebrow">QUẢN TRỊ HỆ THỐNG / QUẢN LÝ NGƯỜI DÙNG</p>
          <h1>Quản lý người dùng</h1>
          <p className="admin-users-description">Xem thông tin tài khoản và tạo tài khoản Thủ thư trong hệ thống thư viện.</p>
        </div>
        <div className="admin-users-actions">
          <button className="admin-users-button admin-users-button--secondary" onClick={() => void loadUsers()} type="button">
            <RefreshCw size={15} /> Làm mới
          </button>
          <button className="admin-users-button admin-users-button--primary" onClick={() => navigate('/admin/users/create-librarian')} type="button">
            <Plus size={16} /> Tạo tài khoản Thủ thư
          </button>
        </div>
      </header>

      <nav className="admin-users-role-tabs" aria-label="Nhóm người dùng">
        <button className={role === 'Librarian' ? 'is-active' : ''} onClick={() => setRoleTab('Librarian')} type="button">
          Thủ thư
          <span>{data?.stats.totalLibrarians ?? '—'}</span>
        </button>
        <button className={role === 'Reader' ? 'is-active' : ''} onClick={() => setRoleTab('Reader')} type="button">
          Độc giả
          <span>{data?.stats.totalReaders ?? '—'}</span>
        </button>
      </nav>

      <div className={`admin-users-metrics ${metrics.length === 3 ? 'admin-users-metrics--three' : ''}`}>
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <article className="admin-users-metric" key={label}>
            <span className={`admin-users-metric-icon admin-users-tone-${tone}`}><Icon size={17} /></span>
            <div>
              <p>{label}</p>
              <strong>{new Intl.NumberFormat('vi-VN').format(value ?? 0)}</strong>
            </div>
          </article>
        ))}
      </div>

      <section className="admin-users-table-panel">
        {role === 'Reader' && (
          <nav className="admin-users-reader-tabs" aria-label="Loại độc giả">
            {([
              ['All', 'Tất cả độc giả'],
              ['Student', 'Sinh viên trong trường'],
              ['Lecturer', 'Giảng viên'],
              ['External', 'Người bên ngoài trường'],
            ] as const).map(([type, label]) => (
              <button
                className={readerType === type ? 'is-active' : ''}
                key={type}
                onClick={() => { setReaderType(type); setPage(1); }}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        <div className="admin-users-table-heading">
          <div>
            <h2>Danh sách {role === 'Reader' ? 'độc giả' : 'thủ thư'}</h2>
            <p>{role === 'Reader' ? 'Thông tin tài khoản người dùng trong hệ thống thư viện.' : 'Tài khoản nhân sự có quyền quản lý hoạt động thư viện.'}</p>
          </div>
          <div className="admin-users-filters">
            <label className="admin-users-search">
              <Search size={15} />
              <input
                aria-label="Tìm kiếm người dùng"
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder={role === 'Reader' ? 'Tìm theo mã, họ tên hoặc email...' : 'Tìm theo họ tên hoặc tài khoản...'}
                value={search}
              />
            </label>
            <select aria-label="Lọc theo trạng thái" onChange={(event) => { setStatus(event.target.value); setPage(1); }} value={status}>
              <option value="All">Tất cả trạng thái</option>
              <option value="Active">Hoạt động</option>
              <option value="Inactive">Không hoạt động</option>
              <option value="PendingApproval">Chờ duyệt</option>
              <option value="PendingVerification">Chờ xác minh</option>
              <option value="PendingActivation">Chờ kích hoạt</option>
              <option value="Suspended">Tạm khóa</option>
              <option value="Rejected">Từ chối</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="admin-users-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button onClick={() => void loadUsers()} type="button">Thử lại</button>
          </div>
        )}

        <div className="admin-users-table-scroll">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th className="admin-users-check-cell"><input aria-label="Chọn tất cả người dùng" type="checkbox" disabled /></th>
                <th>{role === 'Reader' ? 'MSSV / Teacher ID' : 'Mã nhân viên'}</th>
                <th>Họ và tên</th>
                <th>Email</th>
                {role === 'Reader' && <th>Loại độc giả</th>}
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
                <th aria-label="Thao tác" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="admin-users-state" colSpan={role === 'Reader' ? 8 : 7}><LoaderCircle className="admin-users-spin" size={20} /> Đang tải danh sách...</td></tr>
              ) : data?.items.length ? data.items.map((user) => (
                <tr
                  className="admin-users-row"
                  key={user.id}
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/admin/users/${user.id}`);
                    }
                  }}
                  tabIndex={0}
                >
                  <td className="admin-users-check-cell"><input aria-label={`Chọn ${user.fullName}`} type="checkbox" disabled /></td>
                  <td className="admin-users-id">{role === 'Reader' ? user.teacherId || user.studentId || '—' : user.employeeId || '—'}</td>
                  <td className="admin-users-name">
                    <span className="admin-users-name-content">
                      {user.avatarUrl
                        ? <img className="admin-users-avatar" src={user.avatarUrl} alt="" />
                        : <span className="admin-users-avatar admin-users-avatar-fallback">{user.fullName.trim().charAt(0).toUpperCase()}</span>}
                      {user.fullName}
                    </span>
                  </td>
                  <td className="admin-users-email">{user.email}</td>
                  {role === 'Reader' && <td>{user.readerType ? readerTypeLabels[user.readerType] : user.teacherId ? readerTypeLabels.Lecturer : user.studentId || user.email.toLowerCase().endsWith('@fpt.edu.vn') ? readerTypeLabels.Student : readerTypeLabels.External}</td>}
                  <td>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td><span className={`admin-users-status admin-users-status--${user.isActive ? user.status.toLowerCase() : 'inactive'}`}>{user.isActive ? statusLabels[user.status] || user.status : 'Không hoạt động'}</span></td>
                  <td><button className="admin-users-icon-button" aria-label={`Xem ${user.fullName}`} onClick={(event) => { event.stopPropagation(); navigate(`/admin/users/${user.id}`); }} type="button"><Eye size={16} /></button></td>
                </tr>
              )) : (
                <tr><td className="admin-users-empty" colSpan={role === 'Reader' ? 8 : 7}>
                  <Users size={23} />
                  <strong>Chưa có người dùng phù hợp</strong>
                  <span>Thử thay đổi bộ lọc hoặc thêm người dùng mới.</span>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="admin-users-pagination">
          <span>
            {data?.totalCount ? `Hiển thị ${(page - 1) * 10 + 1}–${Math.min(page * 10, data.totalCount)} trong ${new Intl.NumberFormat('vi-VN').format(data.totalCount)} người dùng` : 'Không có dữ liệu'}
          </span>
          <div>
            <button aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} type="button"><ArrowLeft size={15} /></button>
            <span>Trang {page} / {Math.max(1, data?.totalPages ?? 1)}</span>
            <button aria-label="Trang sau" disabled={loading || page >= (data?.totalPages ?? 1)} onClick={() => setPage((current) => current + 1)} type="button"><ArrowRight size={15} /></button>
          </div>
        </footer>
      </section>

    </section>
  );
};

export default AdminUsersPage;
