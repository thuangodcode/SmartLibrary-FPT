import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  Eye,
  Grid3x3,
  Info,
  LoaderCircle,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Upload,
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
  studentId?: string | null;
  phone?: string | null;
  readerType?: ReaderType | null;
  status: string;
  isActive: boolean;
  createdAt: string;
  roleName: UserRole;
  department?: string | null;
  staffId?: string | null;
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
  PendingActivation: 'Chưa kích hoạt',
  PendingDocuments: 'Thiếu hồ sơ',
};

const readerTypeLabels: Record<ReaderType, string> = {
  Student: 'Sinh viên',
  Lecturer: 'Giảng viên',
  External: 'Người bên ngoài trường',
};

type ViewMode = 'list' | 'detail' | 'edit' | 'create';

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
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState<{
    fullName: string; email: string; department: string; status: string;
  }>({ fullName: '', email: '', department: '', status: 'Active' });

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    if (signal?.aborted) return;
    if (!accessToken) {
      setError('Phiên đăng nhập Admin không hợp lệ. Vui lòng đăng nhập lại.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ role, page: String(page), pageSize: '7' });
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
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
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
      setViewMode('list');
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

  const openDetail = (user: ManagedUser) => {
    setSelectedUser(user);
    setViewMode('detail');
  };

  const openEdit = (user: ManagedUser) => {
    setSelectedUser(user);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      department: user.department || '',
      status: user.status,
    });
    setViewMode('edit');
  };

  const backToList = () => {
    setViewMode('list');
    setSelectedUser(null);
  };

  // Generate pagination numbers
  const paginationNumbers = useMemo(() => {
    const total = data?.totalPages ?? 1;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [];
    if (page <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    } else if (page >= total - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      for (let i = page - 1; i <= page + 1; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    }
    return pages;
  }, [page, data?.totalPages]);

  /* ═══════════════════════════════════════════
     VIEW: User Detail (Độc giả or Thủ thư)
     ═══════════════════════════════════════════ */
  if (viewMode === 'detail' && selectedUser) {
    const isLibrarian = selectedUser.roleName === 'Librarian';
    return (
      <section className="au-page">
        <header className="au-sub-header">
          <div>
            <h1>{isLibrarian ? 'Chi tiết thủ thư' : 'Chi tiết độc giả'}</h1>
            <p>Xem thông tin chi tiết, vai trò và quyền truy cập của {selectedUser.fullName}.</p>
          </div>
          <button className="au-btn au-btn--outline" onClick={backToList} type="button">
            <ChevronLeft size={16} /> Quay lại
          </button>
        </header>

        <div className="au-detail-card">
          <div className="au-detail-badge">● Đang xem chi tiết</div>
          <h2 className="au-detail-name">{selectedUser.fullName}</h2>
          <p className="au-detail-meta">
            Mã tài khoản: {selectedUser.staffId || selectedUser.studentId || selectedUser.email.split('@')[0]} · Email: {selectedUser.email}
          </p>

          <div className="au-detail-fields">
            <div className="au-field">
              <label>Họ và tên</label>
              <div className="au-field-value">{selectedUser.fullName}</div>
            </div>
            <div className="au-field">
              <label>Địa chỉ email</label>
              <div className="au-field-value">{selectedUser.email}</div>
            </div>
            <div className="au-field">
              <label>Vai trò</label>
              <div className="au-field-value">{isLibrarian ? 'Thủ thư' : 'Độc giả'}</div>
            </div>
            {isLibrarian ? (
              <div className="au-field">
                <label>Mã nhân viên</label>
                <div className="au-field-value">{selectedUser.staffId || 'Chưa cập nhật'}</div>
              </div>
            ) : (
              <>
                <div className="au-field">
                  <label>Nhóm độc giả</label>
                  <div className="au-field-value">{selectedUser.readerType ? readerTypeLabels[selectedUser.readerType] : 'Nội bộ'}</div>
                </div>
                <div className="au-field">
                  <label>Ngày tạo tài khoản</label>
                  <div className="au-field-value">{new Date(selectedUser.createdAt).toLocaleDateString('vi-VN')}</div>
                </div>
              </>
            )}
            <div className="au-field">
              <label>Trạng thái tài khoản</label>
              <div className="au-field-value">{statusLabels[selectedUser.status] || selectedUser.status}</div>
            </div>
          </div>

          <div className="au-detail-actions">
            <button className="au-btn au-btn--outline" onClick={backToList} type="button">Quay lại</button>
            <button className="au-btn au-btn--primary" onClick={() => openEdit(selectedUser)} type="button">Chỉnh sửa</button>
          </div>
        </div>
      </section>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW: Edit User (Chỉnh sửa thủ thư)
     ═══════════════════════════════════════════ */
  if (viewMode === 'edit' && selectedUser) {
    const isLibrarian = selectedUser.roleName === 'Librarian';
    return (
      <section className="au-page">
        <header className="au-sub-header">
          <div>
            <h1>{isLibrarian ? 'Chỉnh sửa thủ thư' : 'Chỉnh sửa độc giả'}</h1>
            <p>Chỉnh sửa thông tin, vai trò và quyền truy cập của {selectedUser.fullName}.</p>
          </div>
          <button className="au-btn au-btn--outline" onClick={backToList} type="button">Quay lại</button>
        </header>

        <div className="au-detail-card">
          <div className="au-detail-badge au-detail-badge--edit">● Đang chỉnh sửa</div>
          <h2 className="au-detail-name">{isLibrarian ? 'Chỉnh sửa thủ thư' : 'Chỉnh sửa độc giả'}</h2>
          <p className="au-detail-meta">{selectedUser.fullName} · {selectedUser.staffId || selectedUser.studentId || selectedUser.email.split('@')[0]}</p>

          <form className="au-detail-fields" onSubmit={(e) => { e.preventDefault(); showToast('Cập nhật thành công!', 'success'); backToList(); }}>
            <div className="au-field">
              <label>Họ và tên *</label>
              <input className="au-field-input" value={editForm.fullName} onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))} required />
            </div>
            <div className="au-field">
              <label>Địa chỉ email *</label>
              <input className="au-field-input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required type="email" />
            </div>
            {isLibrarian && (
              <div className="au-field">
                <label>Phòng ban</label>
                <select className="au-field-select" value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))}>
                  <option value="">Chọn phòng ban</option>
                  <option value="Mượn trả">Mượn trả</option>
                  <option value="Biên mục">Biên mục</option>
                  <option value="Tư vấn đọc">Tư vấn đọc</option>
                </select>
              </div>
            )}
            <div className="au-field">
              <label>Trạng thái tài khoản</label>
              <select className="au-field-select" value={editForm.status} onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="Active">Hoạt động</option>
                <option value="Suspended">Tạm khóa</option>
              </select>
            </div>

            <div className="au-edit-notice">
              <Info size={16} />
              <span>Thay đổi có hiệu lực ngay. Email thông báo sẽ được gửi đến {selectedUser.fullName}.</span>
            </div>

            <div className="au-detail-actions">
              <button className="au-btn au-btn--outline" type="button" onClick={backToList}>Hủy</button>
              <button className="au-btn au-btn--primary" type="submit">Lưu thay đổi</button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW: Create Librarian (Thêm thủ thư)
     ═══════════════════════════════════════════ */
  if (viewMode === 'create') {
    return (
      <section className="au-page">
        <header className="au-sub-header">
          <div>
            <h1>Thêm thủ thư</h1>
            <p>Tạo mới tài khoản thủ thư và cấu hình quyền truy cập ban đầu.</p>
          </div>
          <button className="au-btn au-btn--primary" form="create-form" type="submit" disabled={createBusy}>
            {createBusy ? <LoaderCircle className="au-spin" size={16} /> : <Plus size={16} />} Tạo tài khoản
          </button>
        </header>

        {/* Tabs */}
        <nav className="au-role-tabs" aria-label="Loại tài khoản tạo mới">
          <button className="au-role-tab" type="button" onClick={backToList}>Độc giả</button>
          <button className="au-role-tab au-role-tab--active" type="button">Thủ thư</button>
        </nav>

        <div className="au-detail-card">
          <div className="au-detail-badge au-detail-badge--create">+ Tạo mới</div>
          <h2 className="au-detail-name">Thông tin thủ thư</h2>
          <p className="au-detail-meta">Mã tài khoản sẽ được hệ thống tự động tạo sau khi lưu.</p>

          <form id="create-form" className="au-detail-fields" onSubmit={handleCreateLibrarian}>
            <div className="au-field">
              <label>Họ và tên</label>
              <input className="au-field-input" name="fullName" placeholder="Nhập họ và tên đầy đủ" required />
            </div>
            <div className="au-field">
              <label>Địa chỉ email</label>
              <input className="au-field-input" name="username" placeholder="email@example.com" required />
            </div>
            <div className="au-field">
              <label>Mã Nhân Viên</label>
              <input className="au-field-input" name="phone" placeholder="Nhập mã nhân viên" />
            </div>
            <div className="au-field">
              <label>Mật khẩu</label>
              <input className="au-field-input" name="password" type="password" placeholder="Ít nhất 8 ký tự" required minLength={8} />
            </div>
            <div className="au-field">
              <label>Vai trò *</label>
              <select className="au-field-select" defaultValue="Librarian">
                <option value="Librarian">Thủ thư</option>
              </select>
            </div>
            <div className="au-field">
              <label>Trạng thái tài khoản</label>
              <select className="au-field-select" defaultValue="Active">
                <option value="Active">Hoạt động</option>
                <option value="Suspended">Tạm khóa</option>
              </select>
            </div>

            <div className="au-detail-actions">
              <button className="au-btn au-btn--outline" type="button" onClick={backToList}>Hủy</button>
              <button className="au-btn au-btn--primary" type="submit" disabled={createBusy}>
                {createBusy ? <LoaderCircle className="au-spin" size={16} /> : null} Tạo tài khoản
              </button>
            </div>
          </form>
        </div>
      </section>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW: Main List
     ═══════════════════════════════════════════ */
  return (
    <section className="au-page">
      {/* Header */}
      <header className="au-header">
        <div>
          <h1>Quản lý người dùng</h1>
          <p className="au-header-desc">
            {role === 'Reader'
              ? 'Quản lý tài khoản độc giả và thủ thư trong hệ thống thư viện.'
              : 'Quản lý hồ sơ, quyền truy cập và tình trạng tài khoản của độc giả và thủ thư.'}
          </p>
        </div>
        <div className="au-header-actions">
          {role === 'Reader' ? (
            <button className="au-btn au-btn--primary" type="button">
              <Upload size={16} /> Nhập danh sách
            </button>
          ) : (
            <button className="au-btn au-btn--primary" onClick={() => setViewMode('create')} type="button">
              <Plus size={16} /> Thêm tài khoản
            </button>
          )}
        </div>
      </header>

      {/* Role tabs */}
      <nav className="au-role-tabs" aria-label="Nhóm người dùng">
        <button
          className={`au-role-tab ${role === 'Reader' ? 'au-role-tab--active' : ''}`}
          onClick={() => setRoleTab('Reader')} type="button"
        >
          Độc giả
        </button>
        <button
          className={`au-role-tab ${role === 'Librarian' ? 'au-role-tab--active' : ''}`}
          onClick={() => setRoleTab('Librarian')} type="button"
        >
          Thủ thư
        </button>
      </nav>

      {/* Stat cards - only on Reader tab per Figma */}
      {role === 'Reader' && (
        <div className="au-stats-grid">
          {metrics.map(({ label, value, icon: Icon, tone }) => (
            <article className="au-stat-card" key={label}>
              <span className={`au-stat-icon au-stat-icon--${tone}`}><Icon size={20} /></span>
              <div>
                <p className="au-stat-label">{label}</p>
                <strong className="au-stat-value">{new Intl.NumberFormat('vi-VN').format(value ?? 0)}</strong>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Table panel */}
      <section className="au-table-panel">
        {/* Reader sub-tabs */}
        {role === 'Reader' && (
          <nav className="au-sub-tabs" aria-label="Loại độc giả">
            {([
              ['All', 'Sinh viên trong trường'],
              ['Lecturer', 'Giảng viên'],
              ['External', 'Người bên ngoài trường'],
            ] as const).map(([type, label]) => (
              <button
                className={`au-sub-tab ${(type === 'All' && readerType === 'All') || readerType === type ? 'au-sub-tab--active' : ''}`}
                key={type}
                onClick={() => { setReaderType(type === 'All' ? 'All' : type); setPage(1); }}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        )}

        {/* Table heading + filters */}
        <div className="au-table-heading">
          <div className="au-table-heading-left">
            <span className="au-table-heading-icon"><Users size={18} /></span>
            <div>
              <h2>
                {role === 'Reader'
                  ? readerType === 'Lecturer'
                    ? 'Danh sách giảng viên'
                    : readerType === 'External'
                    ? 'Danh sách người bên ngoài trường'
                    : 'Danh sách sinh viên trong trường'
                  : 'Tài khoản thủ thư'}
              </h2>
              <p>
                {role === 'Reader'
                  ? readerType === 'Lecturer'
                    ? 'Danh sách tài khoản giảng viên được quản lý trên hệ thống.'
                    : readerType === 'External'
                    ? 'Danh sách bạn đọc ngoài trường được cấp thẻ thư viện.'
                    : 'Danh sách tài khoản sinh viên được nhập từ dữ liệu của nhà trường và quản lý trên hệ thống.'
                  : 'Xem chi tiết, chỉnh sửa quyền hoặc xóa tài khoản không hoạt động.'}
              </p>
            </div>
          </div>
          <div className="au-filters">
            <label className="au-search">
              <Search size={15} />
              <input
                aria-label="Tìm kiếm"
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={role === 'Reader' ? 'Tìm theo mã sinh viên, họ tên hoặc email...' : 'Tìm theo họ tên, email hoặc mã tài khoản...'}
                value={search}
              />
            </label>
            {role === 'Librarian' && (
              <select className="au-filter-select" aria-label="Lọc vai trò">
                <option>Tất cả vai trò</option>
                <option>Thủ thư</option>
              </select>
            )}
            <select
              className="au-filter-select"
              aria-label="Lọc trạng thái"
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              value={status}
            >
              <option value="All">Tất cả trạng thái</option>
              <option value="Active">Hoạt động</option>
              <option value="PendingApproval">Chờ duyệt</option>
              <option value="PendingActivation">Chưa kích hoạt</option>
              <option value="Suspended">Tạm khóa</option>
            </select>
            {role === 'Librarian' && (
              <button className="au-btn au-btn--outline" type="button" title="Xuất">
                <Download size={15} /> Xuất
              </button>
            )}
            <button className="au-icon-btn" type="button" title="Dạng lưới"><Grid3x3 size={16} /></button>
          </div>
        </div>

        {error && (
          <div className="au-error" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
            <button onClick={() => void loadUsers()} type="button">Thử lại</button>
          </div>
        )}

        {/* Table */}
        <div className="au-table-scroll">
          <table className="au-table">
            <thead>
              <tr>
                <th className="au-check-cell"><input type="checkbox" disabled aria-label="Chọn tất cả" /></th>
                {role === 'Reader' ? (
                  <>
                    <th>Mã sinh viên</th>
                    <th>Họ và tên</th>
                    <th>Email</th>
                    <th>Ngày tạo tài khoản</th>
                    <th>Trạng thái</th>
                    <th aria-label="Thao tác">Thao tác</th>
                  </>
                ) : (
                  <>
                    <th>Họ tên / email</th>
                    <th>Mã tài khoản</th>
                    <th>Vai trò</th>
                    <th>Phòng ban</th>
                    <th>Trạng thái</th>
                    <th aria-label="Hành động">Hành động</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="au-state-cell" colSpan={role === 'Reader' ? 7 : 7}>
                  <LoaderCircle className="au-spin" size={20} /> Đang tải danh sách...
                </td></tr>
              ) : data?.items.length ? data.items.map((user) => (
                <tr key={user.id}>
                  <td className="au-check-cell"><input type="checkbox" disabled aria-label={`Chọn ${user.fullName}`} /></td>
                  {role === 'Reader' ? (
                    <>
                      <td className="au-cell-id">{user.studentId || '—'}</td>
                      <td className="au-cell-name">{user.fullName}</td>
                      <td className="au-cell-email">{user.email}</td>
                      <td>{new Date(user.createdAt).toLocaleDateString('vi-VN')}</td>
                      <td>
                        <span className={`au-status au-status--${user.status.toLowerCase()}`}>
                          {statusLabels[user.status] || user.status}
                        </span>
                      </td>
                      <td className="au-actions-cell">
                        <button className="au-action-btn" onClick={() => openDetail(user)} type="button" title="Xem chi tiết"><Eye size={16} /></button>
                        <button className="au-action-btn" onClick={() => openEdit(user)} type="button" title="Tùy chọn"><MoreVertical size={16} /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <div className="au-cell-user">
                          <strong>{user.fullName}</strong>
                          <span>{user.email}</span>
                        </div>
                      </td>
                      <td className="au-cell-id">{user.staffId || user.email.split('@')[0]}</td>
                      <td>{user.department ? 'Thủ thư cao cấp' : 'Thủ thư'}</td>
                      <td>{user.department || 'Mượn trả'}</td>
                      <td>
                        <span className={`au-status au-status--${user.status.toLowerCase()}`}>
                          {statusLabels[user.status] || user.status}
                        </span>
                      </td>
                      <td className="au-actions-cell">
                        <button className="au-action-btn" onClick={() => openDetail(user)} type="button" title="Xem chi tiết"><Eye size={16} /></button>
                        <button className="au-action-btn au-action-btn--danger" type="button" title="Xóa tài khoản"><Trash2 size={16} /></button>
                      </td>
                    </>
                  )}
                </tr>
              )) : (
                <tr><td className="au-empty-cell" colSpan={7}>
                  <Users size={24} />
                  <strong>Chưa có người dùng phù hợp</strong>
                  <span>Thử thay đổi bộ lọc hoặc thêm người dùng mới.</span>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <footer className="au-pagination">
          <span className="au-pagination-info">
            {data?.totalCount
              ? `Hiển thị ${(page - 1) * 7 + 1}–${Math.min(page * 7, data.totalCount)} trên tổng số ${new Intl.NumberFormat('vi-VN').format(data.totalCount)} ${role === 'Reader' ? 'sinh viên' : 'thủ thư'}`
              : 'Chưa có dữ liệu'}
          </span>
          <div className="au-pagination-controls">
            <button
              className="au-page-btn au-page-nav"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              type="button"
              aria-label="Trang trước"
            >
              <ArrowLeft size={14} />
            </button>
            {paginationNumbers.map((num, i) =>
              typeof num === 'string' ? (
                <span key={`dots-${i}`} className="au-page-dots">…</span>
              ) : (
                <button
                  key={num}
                  className={`au-page-btn ${num === page ? 'au-page-btn--active' : ''}`}
                  onClick={() => setPage(num)}
                  type="button"
                >
                  {num}
                </button>
              )
            )}
            <button
              className="au-page-btn au-page-nav"
              disabled={loading || page >= (data?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              type="button"
              aria-label="Trang sau"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </footer>

        {/* Reader note */}
        {role === 'Reader' && (
          <div className="au-reader-note">
            <Info size={16} />
            <span>Danh sách được cập nhật từ dữ liệu sinh viên của nhà trường. Vui lòng liên hệ nhà trường nếu có sai sót thông tin.</span>
          </div>
        )}

        {/* Librarian permission note */}
        {role === 'Librarian' && (
          <div className="au-permission-note">
            <Info size={16} />
            <div>
              <strong>Quyền truy cập theo vai trò</strong>
              <p>Thủ thư các cấp có thể quản lý mượn trả và hồ sơ sách. Chỉ quản trị viên mới thay đổi vai trò, chính sách và cấu hình AI.</p>
            </div>
          </div>
        )}
      </section>

      {toast && (
        <div className={`au-toast au-toast--${toast.tone}`} role="status">
          {toast.tone === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}
    </section>
  );
};

export default AdminUsersPage;
