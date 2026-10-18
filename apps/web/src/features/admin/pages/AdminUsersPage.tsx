import { useCallback, useEffect, useMemo, useState } from 'react';
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
  X,
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
  studentId?: string | null;
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
  Student: 'Sinh viên',
  Lecturer: 'Giảng viên',
  External: 'Người bên ngoài trường',
};

const AdminUsersPage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const [role, setRole] = useState<UserRole>('Reader');
  const [readerType, setReaderType] = useState<'All' | ReaderType>('All');
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UserListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

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

  const showToast = useCallback((message: string, tone: 'success' | 'error') => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

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

  const handleCreateLibrarian = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) return;
    const form = new FormData(event.currentTarget);
    setCreateBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/librarians`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          username: form.get('username'),
          password: form.get('password'),
          phone: form.get('phone'),
        }),
      });
      const result = await parseApiResponse<ApiResult<ManagedUser>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể tạo tài khoản Thủ thư.');
      }

      setShowCreateDialog(false);
      setRole('Librarian');
      setPage(1);
      showToast('Đã tạo tài khoản Thủ thư thành công.', 'success');
      await loadUsers();
    } catch (createError) {
      showToast(createError instanceof Error ? createError.message : 'Không thể tạo tài khoản Thủ thư.', 'error');
    } finally {
      setCreateBusy(false);
    }
  };

  const setRoleTab = (nextRole: UserRole) => {
    setRole(nextRole);
    setPage(1);
    setStatus('All');
    setReaderType('All');
  };

  return (
    <section className="admin-users-page">
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
          <button className="admin-users-button admin-users-button--primary" onClick={() => setShowCreateDialog(true)} type="button">
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
                <th>{role === 'Reader' ? 'Mã số' : 'Tài khoản'}</th>
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
                <tr key={user.id}>
                  <td className="admin-users-check-cell"><input aria-label={`Chọn ${user.fullName}`} type="checkbox" disabled /></td>
                  <td className="admin-users-id">{role === 'Reader' ? user.studentId || '—' : user.email.split('@')[0]}</td>
                  <td className="admin-users-name">{user.fullName}</td>
                  <td className="admin-users-email">{user.email}</td>
                  {role === 'Reader' && <td>{user.readerType ? readerTypeLabels[user.readerType] : 'Chưa phân loại'}</td>}
                  <td>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</td>
                  <td><span className={`admin-users-status admin-users-status--${user.status.toLowerCase()}`}>{statusLabels[user.status] || user.status}</span></td>
                  <td><button className="admin-users-icon-button" aria-label={`Xem ${user.fullName}`} onClick={() => setSelectedUser(user)} type="button"><Eye size={16} /></button></td>
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

      {showCreateDialog && (
        <div className="admin-users-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreateDialog(false); }}>
          <section aria-labelledby="admin-create-title" aria-modal="true" className="admin-users-dialog" role="dialog">
            <header>
              <div><span className="admin-users-dialog-icon"><UserRoundCheck size={19} /></span><div><h2 id="admin-create-title">Tạo tài khoản Thủ thư</h2><p>Tài khoản được kích hoạt ngay sau khi tạo.</p></div></div>
              <button aria-label="Đóng" onClick={() => setShowCreateDialog(false)} type="button"><X size={18} /></button>
            </header>
            <form onSubmit={handleCreateLibrarian}>
              <label>Họ và tên<input autoComplete="name" maxLength={255} name="fullName" placeholder="Nguyễn Văn A" required /></label>
              <label>Tên đăng nhập<input autoComplete="username" maxLength={50} minLength={3} name="username" placeholder="thuthu01" required /></label>
              <p className="admin-users-field-hint">Đăng nhập bằng tên này; không cần email. Hệ thống sẽ tạo tài khoản nội bộ.</p>
              <label>Mật khẩu<input autoComplete="new-password" minLength={8} name="password" placeholder="Ít nhất 8 ký tự" required type="password" /></label>
              <label>Số điện thoại <span>(không bắt buộc)</span><input autoComplete="tel" name="phone" placeholder="090..." /></label>
              <footer>
                <button className="admin-users-button admin-users-button--secondary" onClick={() => setShowCreateDialog(false)} type="button">Hủy</button>
                <button className="admin-users-button admin-users-button--primary" disabled={createBusy} type="submit">
                  {createBusy ? <LoaderCircle className="admin-users-spin" size={16} /> : <Check size={16} />} Tạo tài khoản
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {selectedUser && (
        <div className="admin-users-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedUser(null); }}>
          <section aria-labelledby="admin-user-detail-title" aria-modal="true" className="admin-users-dialog admin-users-detail" role="dialog">
            <header><div><span className="admin-users-dialog-icon"><Eye size={18} /></span><div><h2 id="admin-user-detail-title">Thông tin người dùng</h2><p>{selectedUser.roleName === 'Reader' ? 'Độc giả' : 'Thủ thư'}</p></div></div><button aria-label="Đóng" onClick={() => setSelectedUser(null)} type="button"><X size={18} /></button></header>
            <dl>
              <div><dt>Họ và tên</dt><dd>{selectedUser.fullName}</dd></div>
              <div><dt>{selectedUser.roleName === 'Reader' ? 'Mã số' : 'Tên đăng nhập'}</dt><dd>{selectedUser.studentId || selectedUser.email.split('@')[0]}</dd></div>
              <div><dt>Email / Tài khoản</dt><dd>{selectedUser.email}</dd></div>
              <div><dt>Số điện thoại</dt><dd>{selectedUser.phone || 'Chưa cập nhật'}</dd></div>
              <div><dt>Trạng thái</dt><dd>{statusLabels[selectedUser.status] || selectedUser.status}</dd></div>
              <div><dt>Ngày tạo</dt><dd>{new Date(selectedUser.createdAt).toLocaleString('vi-VN')}</dd></div>
            </dl>
          </section>
        </div>
      )}

      {toast && <div className={`admin-users-toast admin-users-toast--${toast.tone}`} role="status">{toast.tone === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}{toast.message}</div>}
    </section>
  );
};

export default AdminUsersPage;
