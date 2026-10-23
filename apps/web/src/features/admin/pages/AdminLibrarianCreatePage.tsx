import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Check, ImagePlus, LoaderCircle, UserRoundCheck, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminUsersPage.css';
import './AdminLibrarianCreatePage.css';

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const AdminLibrarianCreatePage: React.FC = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewUrl = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : null,
    [avatarFile],
  );

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  const selectAvatar = (file: File | undefined) => {
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarFile(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setError('Ảnh đại diện phải có định dạng JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setError('Ảnh đại diện không được vượt quá 5 MB.');
      return;
    }
    setError(null);
    setAvatarFile(file);
  };

  const createLibrarian = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken) {
      setError('Phiên đăng nhập Admin không hợp lệ. Vui lòng đăng nhập lại.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== String(form.get('confirmPassword') ?? '')) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/librarians/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const result = await parseApiResponse<ApiResult<unknown>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể tạo tài khoản Thủ thư.');
      }

      navigate('/admin/users', {
        replace: true,
        state: { role: 'Librarian', toast: 'Đã tạo tài khoản Thủ thư thành công.' },
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Không thể tạo tài khoản Thủ thư.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin-librarian-create-page">
      <nav className="admin-librarian-create-crumb" aria-label="Breadcrumb">
        <Link to="/admin/users">Quản lý người dùng</Link>
        <span>/</span>
        <strong>Tạo tài khoản Thủ thư</strong>
      </nav>

      <header className="admin-users-heading">
        <div>
          <p className="admin-users-eyebrow">QUẢN TRỊ HỆ THỐNG / QUẢN LÝ NGƯỜI DÙNG</p>
          <h1>Tạo tài khoản Thủ thư</h1>
          <p className="admin-users-description">Nhập thông tin nhân viên và thông tin đăng nhập để tạo tài khoản.</p>
        </div>
      </header>

      {error && (
        <div className="admin-users-error" role="alert">
          <AlertCircle size={17} />
          <span>{error}</span>
        </div>
      )}

      <section className="admin-librarian-create-card" aria-labelledby="librarian-form-title">
        <div className="admin-librarian-create-card-heading">
          <span><UserRoundCheck size={19} /></span>
          <div>
            <h2 id="librarian-form-title">Thông tin nhân viên</h2>
            <p>Tài khoản Thủ thư sẽ được kích hoạt ngay sau khi tạo.</p>
          </div>
        </div>
        <div className="admin-librarian-create-body">
          <form id="create-librarian-form" className="admin-librarian-create-form" onSubmit={(event) => void createLibrarian(event)}>
            <label>
              Họ và tên
              <input autoComplete="name" maxLength={255} name="fullName" placeholder="Nguyễn Văn A" required />
            </label>
            <label>
              Mã nhân viên
              <input autoComplete="off" maxLength={50} minLength={2} name="employeeId" pattern="[A-Za-z0-9._-]{2,50}" placeholder="Ví dụ: NV001" required />
            </label>
            <label>
              Tên đăng nhập
              <input autoComplete="username" maxLength={50} minLength={3} name="username" pattern="[A-Za-z0-9._-]{3,50}" placeholder="thuthu01" required />
            </label>
            <label>
              Số điện thoại <span>(không bắt buộc)</span>
              <input autoComplete="tel" maxLength={30} name="phone" placeholder="090..." type="tel" />
            </label>
            <label>
              Mật khẩu
              <input autoComplete="new-password" minLength={8} name="password" placeholder="Ít nhất 8 ký tự" required type="password" />
            </label>
            <label>
              Xác nhận mật khẩu
              <input autoComplete="new-password" minLength={8} name="confirmPassword" placeholder="Nhập lại mật khẩu" required type="password" />
            </label>
            <p className="admin-librarian-create-hint">Tài khoản sử dụng tên đăng nhập để đăng nhập; hệ thống tự tạo email nội bộ.</p>
            <footer>
              <Link className="admin-users-button admin-users-button--secondary" to="/admin/users">Hủy</Link>
              <button className="admin-users-button admin-users-button--primary" disabled={busy} type="submit">
                {busy ? <LoaderCircle className="admin-users-spin" size={16} /> : <Check size={16} />}
                Tạo tài khoản
              </button>
              <span className="sr-only" aria-live="polite">{busy ? 'Đang tạo tài khoản' : ''}</span>
            </footer>
          </form>
          <aside className="admin-librarian-avatar-card" aria-label="Ảnh đại diện nhân viên">
            <div className="admin-librarian-avatar-preview">
              {avatarPreviewUrl
                ? <img src={avatarPreviewUrl} alt="Ảnh đại diện xem trước" />
                : <UserRoundCheck size={38} />}
            </div>
            <strong>{avatarFile ? 'Ảnh đã chọn' : 'Ảnh đại diện'}</strong>
            <span>{avatarFile?.name ?? 'Xem trước ảnh nhân viên'}</span>
            <label className="admin-librarian-avatar-upload" htmlFor="librarian-avatar">
              <ImagePlus size={15} />
              {avatarFile ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </label>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="admin-librarian-avatar-input"
              form="create-librarian-form"
              id="librarian-avatar"
              name="avatar"
              onChange={(event) => selectAvatar(event.currentTarget.files?.[0])}
              ref={avatarInputRef}
              type="file"
            />
            <small>JPG, PNG hoặc WebP · tối đa 5 MB</small>
            {avatarFile && (
              <button
                aria-label="Xóa ảnh đại diện đã chọn"
                className="admin-librarian-avatar-remove"
                onClick={() => {
                  setAvatarFile(null);
                  if (avatarInputRef.current) avatarInputRef.current.value = '';
                }}
                type="button"
              >
                <X size={14} /> Xóa ảnh
              </button>
            )}
          </aside>
        </div>
      </section>
      <Link className="admin-librarian-create-back" to="/admin/users"><ArrowLeft size={16} /> Quay lại danh sách</Link>
    </section>
  );
};

export default AdminLibrarianCreatePage;
