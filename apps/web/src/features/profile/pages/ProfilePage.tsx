import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, LoaderCircle, Mail, UserRound, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import HomeNavbar from '../../home/components/HomeNavbar';
import './ProfilePage.css';

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  phone: string | null;
  studentId: string | null;
  teacherId: string | null;
  employeeId: string | null;
  address: string | null;
  dateOfBirth: string | null;
  role: string;
}

const roleLabels: Record<string, string> = {
  Admin: 'Quản trị viên',
  Librarian: 'Thủ thư',
  Reader: 'Độc giả',
};

const ProfilePage: React.FC = () => {
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const embeddedInShell = location.pathname === '/admin/profile' || location.pathname === '/librarian/profile';
  const backTo = currentUser?.role === 'Admin' ? '/admin' : currentUser?.role === 'Librarian' ? '/librarian' : '/';
  const permissions = useAuthStore((state) => state.permissions);
  const setAuth = useAuthStore((state) => state.setAuth);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [clearAvatar, setClearAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailVerificationEmail, setEmailVerificationEmail] = useState('');
  const [emailVerificationOtp, setEmailVerificationOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerificationBusy, setEmailVerificationBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const avatarPreviewUrl = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : null,
    [avatarFile],
  );

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await parseApiResponse<ApiResult<UserProfile>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể tải hồ sơ cá nhân.');
        }
        if (!cancelled) {
          setProfile(result.data);
          if (!result.data.email.toLowerCase().endsWith('@smartlibrary.local')) {
            setEmailVerificationEmail(result.data.email);
          }
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Không thể tải hồ sơ cá nhân.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const updateProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !currentUser) {
      setError('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData(event.currentTarget);
      form.set('ClearAvatar', String(clearAvatar));
      if (avatarFile) form.set('Avatar', avatarFile);
      const response = await fetch(`${API_BASE_URL}/api/v1/profile`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const result = await parseApiResponse<ApiResult<UserProfile>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể cập nhật hồ sơ cá nhân.');
      }

      setProfile(result.data);
      setAvatarFile(null);
      setClearAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setAuth(
        { ...currentUser, fullName: result.data.fullName, avatarUrl: result.data.avatarUrl ?? undefined },
        accessToken,
        permissions,
      );
      setNotice('Hồ sơ của bạn đã được cập nhật.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể cập nhật hồ sơ cá nhân.');
    } finally {
      setBusy(false);
    }
  };

  const sendEmailVerificationOtp = async () => {
    if (!accessToken) return;
    setEmailVerificationBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/profile/email-verification/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailVerificationEmail }),
      });
      const result = await parseApiResponse<ApiResult<{ message?: string }>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể gửi mã xác minh email.');
      }
      setEmailOtpSent(true);
      setNotice(result.data?.message || 'Mã xác minh đã được gửi đến email cá nhân của bạn.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể gửi mã xác minh email.');
    } finally {
      setEmailVerificationBusy(false);
    }
  };

  const verifyAndUpdateEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !currentUser) return;
    setEmailVerificationBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/profile/email-verification/verify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailVerificationEmail, otp: emailVerificationOtp }),
      });
      const result = await parseApiResponse<ApiResult<UserProfile>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể xác minh email.');
      }

      setProfile(result.data);
      setEmailOtpSent(false);
      setEmailVerificationOtp('');
      setAuth({ ...currentUser, email: result.data.email }, accessToken, permissions);
      setNotice('Email cá nhân đã được xác minh và cập nhật thành công.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể xác minh email.');
    } finally {
      setEmailVerificationBusy(false);
    }
  };

  const selectAvatar = (file: File | undefined, input: HTMLInputElement) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarFile(null);
      input.value = '';
      setError('Ảnh đại diện phải có định dạng JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarFile(null);
      input.value = '';
      setError('Ảnh đại diện không được vượt quá 5 MB.');
      return;
    }
    setError(null);
    setAvatarFile(file);
    setClearAvatar(false);
  };

  const visibleAvatar = avatarPreviewUrl || (!clearAvatar ? profile?.avatarUrl : null);
  const visibleError = error || (!accessToken ? 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.' : null);

  const profileContent = (
    <div className={`profile-page${embeddedInShell ? ' profile-page--embedded' : ''}`}>
      <header className="profile-page-heading">
        <div>
          <p>SMARTLIBRARY / TÀI KHOẢN</p>
          <h1>Hồ sơ cá nhân</h1>
          <span>Quản lý thông tin cá nhân và ảnh đại diện của bạn.</span>
        </div>
        {!embeddedInShell && <Link to={backTo}>Quay lại</Link>}
      </header>

      {visibleError && <div className="profile-message profile-message--error" role="alert"><AlertCircle size={17} />{visibleError}</div>}
      {notice && <div className="profile-message profile-message--success" role="status"><Check size={17} />{notice}</div>}

      {profile?.email.toLowerCase().endsWith('@smartlibrary.local') && (
        <section className="profile-email-verification">
          <div>
            <h2>Xác minh email cá nhân (không bắt buộc)</h2>
            <p>
              Tài khoản này được cấp sẵn. Bạn có thể tiếp tục đăng nhập bằng MSSV và số điện thoại đã được cấp,
              hoặc thêm email cá nhân để sử dụng các chức năng email như khôi phục mật khẩu.
            </p>
          </div>
          <form onSubmit={(event) => void verifyAndUpdateEmail(event)}>
            <label>
              Email cá nhân
              <input
                autoComplete="email"
                maxLength={320}
                onChange={(event) => {
                  setEmailVerificationEmail(event.target.value);
                  setEmailOtpSent(false);
                  setEmailVerificationOtp('');
                }}
                required
                type="email"
                value={emailVerificationEmail}
              />
            </label>
            {emailOtpSent && (
              <label>
                Mã OTP
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setEmailVerificationOtp(event.target.value)}
                  pattern="[0-9]{6}"
                  required
                  value={emailVerificationOtp}
                />
              </label>
            )}
            {emailOtpSent ? (
              <div className="profile-email-actions">
                <button disabled={emailVerificationBusy} type="submit">
                  {emailVerificationBusy ? <LoaderCircle size={16} className="profile-spinner" /> : <Check size={16} />}
                  Xác minh và cập nhật
                </button>
                <button
                  className="profile-email-resend"
                  disabled={emailVerificationBusy}
                  onClick={() => void sendEmailVerificationOtp()}
                  type="button"
                >
                  Gửi lại mã
                </button>
              </div>
            ) : (
              <button
                disabled={emailVerificationBusy || !emailVerificationEmail.trim()}
                onClick={() => void sendEmailVerificationOtp()}
                type="button"
              >
                {emailVerificationBusy ? <LoaderCircle size={16} className="profile-spinner" /> : <Mail size={16} />}
                Gửi mã xác minh
              </button>
            )}
          </form>
        </section>
      )}

      {loading && accessToken ? (
        <div className="profile-loading"><LoaderCircle size={20} className="profile-spinner" /> Đang tải hồ sơ...</div>
      ) : profile ? (
        <form className="profile-card" onSubmit={(event) => void updateProfile(event)}>
          <section className="profile-card-main">
            <h2>Thông tin cá nhân</h2>
            <p className="profile-card-description">Thông tin này được dùng trong tài khoản SmartLibrary của bạn.</p>

            <div className="profile-fields">
              <label>
                Họ và tên
                <input autoComplete="name" maxLength={255} name="FullName" defaultValue={profile.fullName} required />
              </label>
              <label>
                Email
                <input value={profile.email} readOnly />
              </label>
              <label>
                Số điện thoại
                <input autoComplete="tel" maxLength={30} name="Phone" defaultValue={profile.phone ?? ''} type="tel" />
              </label>
              <label>
                Ngày sinh
                <input name="DateOfBirth" type="date" defaultValue={profile.dateOfBirth ?? ''} />
              </label>
              <label className="profile-field-wide">
                Địa chỉ
                <textarea autoComplete="street-address" maxLength={500} name="Address" defaultValue={profile.address ?? ''} rows={3} />
              </label>
            </div>
          </section>

          <aside className="profile-avatar-panel">
            <div className="profile-avatar-preview">
              {visibleAvatar
                ? <img src={visibleAvatar} alt="Ảnh đại diện xem trước" />
                : <UserRound size={42} />}
            </div>
            <strong>Ảnh đại diện</strong>
            <span>{avatarFile?.name ?? 'Ảnh hiển thị trên hồ sơ và thanh điều hướng.'}</span>
            <label className="profile-avatar-upload">
              <Camera size={15} /> {visibleAvatar ? 'Đổi ảnh' : 'Tải ảnh lên'}
              <input
                accept="image/jpeg,image/png,image/webp"
                ref={avatarInputRef}
                onChange={(event) => selectAvatar(event.currentTarget.files?.[0], event.currentTarget)}
                type="file"
              />
            </label>
            <small>JPG, PNG hoặc WebP · tối đa 5 MB</small>
            {(avatarFile || profile.avatarUrl) && (
              <button
                className="profile-avatar-remove"
                onClick={() => {
                  if (avatarFile) {
                    setAvatarFile(null);
                    setClearAvatar(false);
                    if (avatarInputRef.current) avatarInputRef.current.value = '';
                  } else {
                    setClearAvatar(!clearAvatar);
                  }
                }}
                type="button"
              >
                <X size={14} /> {clearAvatar ? 'Giữ ảnh hiện tại' : 'Xóa ảnh'}
              </button>
            )}
          </aside>

          <section className="profile-account-details">
            <h2>Thông tin tài khoản</h2>
            <dl>
              <div><dt>Vai trò</dt><dd>{roleLabels[profile.role] ?? profile.role}</dd></div>
              {profile.studentId && <div><dt>Mã độc giả</dt><dd>{profile.studentId}</dd></div>}
              {profile.teacherId && <div><dt>Mã giảng viên</dt><dd>{profile.teacherId}</dd></div>}
              {profile.employeeId && <div><dt>Mã nhân viên</dt><dd>{profile.employeeId}</dd></div>}
            </dl>
          </section>

          <footer className="profile-card-actions">
            <button disabled={busy} type="submit">
              {busy ? <LoaderCircle size={16} className="profile-spinner" /> : <Check size={16} />}
              Lưu thay đổi
            </button>
          </footer>
        </form>
      ) : null}
    </div>
  );

  if (embeddedInShell) return profileContent;

  return (
    <div className="annual-home profile-home">
      <HomeNavbar />
      <main className="profile-main">{profileContent}</main>
    </div>
  );
};

export default ProfilePage;
