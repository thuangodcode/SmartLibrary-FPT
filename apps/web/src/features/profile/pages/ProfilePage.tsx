import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Eye, EyeOff, FileText, LoaderCircle, Mail, Pencil, UserRound, X, ZoomIn, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import HomeNavbar from '../../home/components/HomeNavbar';
import HomeFooter from '../../home/components/HomeFooter';
import { useToast } from '../../../components/ui/useToast';
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
  frontDocUrl?: string | null;
  backDocUrl?: string | null;
  selfieDocUrl?: string | null;
  documentType?: string | null;
  isVerified?: boolean;
  accountStatus?: string | null;
  registrationStatus?: string | null;
}

const roleLabels: Record<string, string> = {
  Admin: 'Quản trị viên',
  Librarian: 'Thủ thư',
  Reader: 'Độc giả',
};

const ProfilePage: React.FC = () => {
  const { showToast } = useToast();
  const location = useLocation();
  const accessToken = useAuthStore((state) => state.accessToken);
  const currentUser = useAuthStore((state) => state.user);
  const verifyMode = new URLSearchParams(location.search).get('verify') === '1';
  const embeddedInShell = location.pathname === '/admin/profile' || location.pathname === '/librarian/profile';
  const backTo = currentUser?.role === 'Admin' ? '/admin' : currentUser?.role === 'Librarian' ? '/librarian' : '/';
  const setAuth = useAuthStore((state) => state.setAuth);
  const permissions = useAuthStore((state) => state.permissions);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [clearAvatar, setClearAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [emailVerificationEmail, setEmailVerificationEmail] = useState('');
  const [emailVerificationOtp, setEmailVerificationOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailVerificationBusy, setEmailVerificationBusy] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({ current: false, next: false, confirm: false });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(embeddedInShell);
  const [frontDocFile, setFrontDocFile] = useState<File | null>(null);
  const [backDocFile, setBackDocFile] = useState<File | null>(null);
  const [selfieDocFile, setSelfieDocFile] = useState<File | null>(null);
  const [lightboxDoc, setLightboxDoc] = useState<{ url: string; label: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const frontDocInputRef = useRef<HTMLInputElement>(null);
  const backDocInputRef = useRef<HTMLInputElement>(null);
  const selfieDocInputRef = useRef<HTMLInputElement>(null);

  const avatarPreviewUrl = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : null,
    [avatarFile],
  );
  const frontDocPreview = useMemo(
    () => frontDocFile ? URL.createObjectURL(frontDocFile) : null,
    [frontDocFile],
  );
  const backDocPreview = useMemo(
    () => backDocFile ? URL.createObjectURL(backDocFile) : null,
    [backDocFile],
  );
  const selfieDocPreview = useMemo(
    () => selfieDocFile ? URL.createObjectURL(selfieDocFile) : null,
    [selfieDocFile],
  );

  useEffect(() => () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
  }, [avatarPreviewUrl]);

  useEffect(() => () => {
    if (frontDocPreview) URL.revokeObjectURL(frontDocPreview);
  }, [frontDocPreview]);

  useEffect(() => () => {
    if (backDocPreview) URL.revokeObjectURL(backDocPreview);
  }, [backDocPreview]);

  useEffect(() => () => {
    if (selfieDocPreview) URL.revokeObjectURL(selfieDocPreview);
  }, [selfieDocPreview]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const controller = new AbortController();
    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await useAuthStore.getState().getAccessToken();
        const response = await fetch(`${API_BASE_URL}/api/v1/profile`, {
          credentials: 'include',
          signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await parseApiResponse<ApiResult<UserProfile>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể tải hồ sơ cá nhân.');
        }
        if (!cancelled) {
          setProfile(result.data);
          setFullName(result.data.fullName || '');
          setPhone(result.data.phone || '');
          setDateOfBirth(result.data.dateOfBirth || '');
          setAddress(result.data.address || '');
          updateUser({
            isVerified: result.data.isVerified,
            status: result.data.accountStatus ?? undefined,
            phone: result.data.phone ?? undefined,
            address: result.data.address ?? undefined,
            dateOfBirth: result.data.dateOfBirth ?? undefined,
          });
          if (!result.data.email.toLowerCase().endsWith('@smartlibrary.local')) {
            setEmailVerificationEmail(result.data.email);
          }
        }
      } catch (caught) {
        if (!cancelled && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Không thể tải hồ sơ cá nhân.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchProfile();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accessToken, updateUser]);

  const handleStartEdit = () => {
    setIsEditing(true);
    setShowDocs(true);
    setError(null);
    setNotice(null);
  };

  const handleCancel = () => {
    if (profile) {
      setFullName(profile.fullName || '');
      setPhone(profile.phone || '');
      setDateOfBirth(profile.dateOfBirth || '');
      setAddress(profile.address || '');
    }
    setAvatarFile(null);
    setClearAvatar(false);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    setFrontDocFile(null);
    setBackDocFile(null);
    setSelfieDocFile(null);
    if (frontDocInputRef.current) frontDocInputRef.current.value = '';
    if (backDocInputRef.current) backDocInputRef.current.value = '';
    if (selfieDocInputRef.current) selfieDocInputRef.current.value = '';
    setIsEditing(false);
    setError(null);
  };

  const selectDocumentFile = (file: File | undefined, input: HTMLInputElement, setFile: (f: File | null) => void) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setFile(null);
      input.value = '';
      setError('Giấy tờ tùy thân phải có định dạng JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFile(null);
      input.value = '';
      setError('Ảnh giấy tờ không được vượt quá 5 MB.');
      return;
    }
    setError(null);
    setFile(file);
  };

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
      const form = new FormData();
      form.set('FullName', fullName.trim());
      form.set('Phone', phone.trim());
      form.set('DateOfBirth', dateOfBirth);
      form.set('Address', address.trim());
      form.set('ClearAvatar', String(clearAvatar));
      const submitForReview = currentUser.role === 'Reader' && ['PendingDocuments', 'Rejected'].includes(profile?.accountStatus || currentUser.status)
        && !!(frontDocFile || profile?.frontDocUrl) && !!(backDocFile || profile?.backDocUrl) && !!(selfieDocFile || profile?.selfieDocUrl);
      if (submitForReview) form.set('SubmitForReview', 'true');
      if (avatarFile) form.set('Avatar', avatarFile);
      if (frontDocFile) form.set('FrontDoc', frontDocFile);
      if (backDocFile) form.set('BackDoc', backDocFile);
      if (selfieDocFile) form.set('SelfieDoc', selfieDocFile);

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
      setAuth({ ...currentUser, fullName: result.data.fullName, avatarUrl: result.data.avatarUrl ?? undefined, isVerified: result.data.isVerified, status: result.data.accountStatus ?? currentUser.status, phone: result.data.phone ?? undefined, address: result.data.address ?? undefined, dateOfBirth: result.data.dateOfBirth ?? undefined }, accessToken, permissions);
      setFullName(result.data.fullName || '');
      setPhone(result.data.phone || '');
      setDateOfBirth(result.data.dateOfBirth || '');
      setAddress(result.data.address || '');
      setAvatarFile(null);
      setClearAvatar(false);
      setFrontDocFile(null);
      setBackDocFile(null);
      setSelfieDocFile(null);
      if (frontDocInputRef.current) frontDocInputRef.current.value = '';
      if (backDocInputRef.current) backDocInputRef.current.value = '';
      if (selfieDocInputRef.current) selfieDocInputRef.current.value = '';
      setIsEditing(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      setAuth(
        { ...currentUser, fullName: result.data.fullName, avatarUrl: result.data.avatarUrl ?? undefined },
        accessToken,
        permissions,
      );
      setNotice(submitForReview || frontDocFile || backDocFile || selfieDocFile
        ? 'Giấy tờ đã được gửi. Tài khoản sẽ được duyệt sau khi thủ thư kiểm tra hồ sơ.'
        : 'Hồ sơ cá nhân đã được cập nhật thành công.');
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

  const changePassword = async () => {
    if (!accessToken) return;
    if (newPassword !== confirmPassword) {
      showToast({ type: 'error', title: 'Không thể đổi mật khẩu', message: 'Mật khẩu mới và xác nhận mật khẩu mới chưa khớp.' });
      return;
    }
    setPasswordBusy(true);
    setError(null);
    setNotice(null);
    try {
      const token = await useAuthStore.getState().getAccessToken();
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const result = await parseApiResponse<ApiResult<unknown>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không thể đổi mật khẩu.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setVisiblePasswords({ current: false, next: false, confirm: false });
      setShowPasswordChange(false);
      showToast({ type: 'success', title: 'Đổi mật khẩu thành công', message: 'Mật khẩu của bạn đã được cập nhật.' });
    } catch (caught) {
      showToast({ type: 'error', title: 'Không thể đổi mật khẩu', message: caught instanceof Error ? caught.message : 'Vui lòng thử lại.' });
    } finally {
      setPasswordBusy(false);
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

      {verifyMode && <div className="profile-message profile-message--verification" role="status">
        <FileText size={18} /><div><strong>Hoàn tất xác thực tài khoản</strong><br />Bổ sung số điện thoại, ngày sinh, địa chỉ và tải đủ ảnh CCCD hai mặt cùng ảnh chân dung để dùng dịch vụ mượn sách và hỗ trợ.</div>
      </div>}

      {visibleError && <div className="profile-message profile-message--error" role="alert"><AlertCircle size={17} />{visibleError}</div>}
      {notice && <div className="profile-message profile-message--success" role="status"><Check size={17} />{notice}</div>}
      {profile?.registrationStatus === 'Submitted' && <div className="profile-message profile-message--verification" role="status">
        <ShieldCheck size={18} /><div><strong>Hồ sơ đang chờ thủ thư duyệt</strong><br />Bạn đã gửi thông tin và giấy tờ. Tài khoản chỉ được kích hoạt sau khi thủ thư phê duyệt.</div>
      </div>}

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
        <form className={`profile-card${isEditing ? ' profile-card--editing' : ''}`} onSubmit={(event) => void updateProfile(event)}>
          <section className="profile-card-main">
            <div className="profile-card-header">
              <div>
                <h2>Thông tin cá nhân</h2>
                <p className="profile-card-description">Thông tin này được dùng trong tài khoản SmartLibrary của bạn.</p>
              </div>
              {isEditing ? <span className="profile-editing-badge"><Pencil size={13} /> Chế độ chỉnh sửa đang bật</span> : (
                <button
                  className="profile-btn-edit-header"
                  onClick={handleStartEdit}
                  type="button"
                >
                  <Pencil size={14} /> Chỉnh sửa hồ sơ
                </button>
              )}
            </div>

            <div className="profile-fields">
              <label>
                Họ và tên
                <input
                  autoComplete="name"
                  maxLength={255}
                  name="FullName"
                  onChange={(event) => setFullName(event.target.value)}
                  readOnly={!isEditing}
                  required
                  value={fullName}
                />
              </label>
              <label>
                Email
                <input value={profile.email} readOnly />
              </label>
              <label>
                Số điện thoại
                <input
                  autoComplete="tel"
                  maxLength={30}
                  name="Phone"
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={isEditing ? 'Nhập số điện thoại' : ''}
                  readOnly={!isEditing}
                  type="tel"
                  value={phone}
                />
              </label>
              <label>
                Ngày sinh
                <input
                  disabled={!isEditing}
                  name="DateOfBirth"
                  onChange={(event) => setDateOfBirth(event.target.value)}
                  readOnly={!isEditing}
                  type="date"
                  value={dateOfBirth}
                />
              </label>
              <label className="profile-field-wide">
                Địa chỉ
                <textarea
                  autoComplete="street-address"
                  maxLength={500}
                  name="Address"
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder={isEditing ? 'Nhập địa chỉ' : ''}
                  readOnly={!isEditing}
                  rows={3}
                  value={address}
                />
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
            {isEditing ? (
              <>
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
              </>
            ) : null}
          </aside>

          <section className="profile-account-details">
            <h2>Thông tin tài khoản</h2>
            <dl>
              <div><dt>Vai trò</dt><dd>{roleLabels[profile.role] ?? profile.role}</dd></div>
              {profile.studentId && <div><dt>Mã độc giả</dt><dd>{profile.studentId}</dd></div>}
              {profile.teacherId && <div><dt>Mã giảng viên</dt><dd>{profile.teacherId}</dd></div>}
              {profile.employeeId && <div><dt>Mã nhân viên</dt><dd>{profile.employeeId}</dd></div>}
            </dl>
            <div className="profile-password-section">
              <div className="profile-password-intro">
                <span className="profile-password-icon"><LockKeyhole size={18} /></span>
                <div><strong>Bảo mật tài khoản</strong><span>Cập nhật mật khẩu để bảo vệ tài khoản của bạn.</span></div>
              </div>
              {!showPasswordChange ? (
                <button className="profile-btn-secondary" type="button" onClick={() => { setShowPasswordChange(true); setError(null); setNotice(null); }}>
                  <ShieldCheck size={16} /> Thay đổi mật khẩu
                </button>
              ) : (
                <div className="profile-password-editor">
                  <label>Mật khẩu hiện tại<div className="profile-password-input-wrap"><input autoComplete="current-password" onChange={(event) => setCurrentPassword(event.target.value)} type={visiblePasswords.current ? 'text' : 'password'} value={currentPassword} /><button type="button" className="profile-password-visibility" aria-label={visiblePasswords.current ? 'Ẩn mật khẩu hiện tại' : 'Hiện mật khẩu hiện tại'} onClick={() => setVisiblePasswords((state) => ({ ...state, current: !state.current }))}>{visiblePasswords.current ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                  <label>Mật khẩu mới<div className="profile-password-input-wrap"><input autoComplete="new-password" onChange={(event) => setNewPassword(event.target.value)} type={visiblePasswords.next ? 'text' : 'password'} value={newPassword} /><button type="button" className="profile-password-visibility" aria-label={visiblePasswords.next ? 'Ẩn mật khẩu mới' : 'Hiện mật khẩu mới'} onClick={() => setVisiblePasswords((state) => ({ ...state, next: !state.next }))}>{visiblePasswords.next ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                  <label>Xác nhận mật khẩu mới<div className="profile-password-input-wrap"><input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} type={visiblePasswords.confirm ? 'text' : 'password'} value={confirmPassword} /><button type="button" className="profile-password-visibility" aria-label={visiblePasswords.confirm ? 'Ẩn mật khẩu xác nhận' : 'Hiện mật khẩu xác nhận'} onClick={() => setVisiblePasswords((state) => ({ ...state, confirm: !state.confirm }))}>{visiblePasswords.confirm ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                  <div className="profile-password-actions">
                    <button className="profile-btn-secondary" type="button" disabled={passwordBusy} onClick={() => { setShowPasswordChange(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}><X size={15} /> Hủy</button>
                    <button className="profile-btn-primary" type="button" disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword} onClick={() => void changePassword()}>
                      {passwordBusy ? <LoaderCircle size={15} className="profile-spinner" /> : <Check size={15} />} Lưu mật khẩu
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Identity Documents Section */}
          <section className="profile-documents-section">
            <div className="profile-documents-header">
              <div>
                <h2>Giấy tờ xác minh danh tính</h2>
                <p className="profile-card-description">
                  Ảnh giấy tờ tùy thân (CCCD/CMND) và chân dung để phục vụ công tác mượn trả tài liệu thư viện.
                </p>
              </div>
              <div className="profile-documents-header-actions">
                <button
                  type="button"
                  className="profile-btn-doc-toggle"
                  onClick={() => setShowDocs(!showDocs)}
                >
                  <FileText size={14} />
                  {showDocs ? 'Ẩn giấy tờ' : 'Xem giấy tờ tùy thân'}
                </button>
              </div>
            </div>

            {showDocs && (
              <div className="profile-documents-grid">
                {/* Slot 1: Mặt trước */}
                <article className="profile-doc-card">
                  <div className="profile-doc-title">MẶT TRƯỚC GIẤY TỜ</div>
                  <div className="profile-doc-frame">
                    {frontDocPreview || profile.frontDocUrl ? (
                      <div
                        className="profile-doc-preview-wrapper"
                        onClick={() => {
                          const url = frontDocPreview || profile.frontDocUrl;
                          if (url) setLightboxDoc({ url, label: 'Mặt trước giấy tờ' });
                        }}
                      >
                        <img
                          src={frontDocPreview || profile.frontDocUrl!}
                          alt="Mặt trước giấy tờ"
                        />
                        <div className="profile-doc-overlay">
                          <ZoomIn size={18} /> Phóng to
                        </div>
                      </div>
                    ) : (
                      <span className="profile-doc-empty">Không có ảnh</span>
                    )}
                  </div>
                  {isEditing && (
                    <div className="profile-doc-actions">
                      <label className="profile-doc-upload-btn">
                        <Camera size={13} />
                        {frontDocPreview || profile.frontDocUrl ? 'Thay ảnh' : 'Tải ảnh lên'}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          ref={frontDocInputRef}
                          onChange={(e) => selectDocumentFile(e.currentTarget.files?.[0], e.currentTarget, setFrontDocFile)}
                          type="file"
                        />
                      </label>
                      {frontDocFile && (
                        <button
                          type="button"
                          className="profile-doc-remove-btn"
                          onClick={() => {
                            setFrontDocFile(null);
                            if (frontDocInputRef.current) frontDocInputRef.current.value = '';
                          }}
                        >
                          <X size={13} /> Hủy chọn
                        </button>
                      )}
                    </div>
                  )}
                </article>

                {/* Slot 2: Mặt sau */}
                <article className="profile-doc-card">
                  <div className="profile-doc-title">MẶT SAU GIẤY TỜ</div>
                  <div className="profile-doc-frame">
                    {backDocPreview || profile.backDocUrl ? (
                      <div
                        className="profile-doc-preview-wrapper"
                        onClick={() => {
                          const url = backDocPreview || profile.backDocUrl;
                          if (url) setLightboxDoc({ url, label: 'Mặt sau giấy tờ' });
                        }}
                      >
                        <img
                          src={backDocPreview || profile.backDocUrl!}
                          alt="Mặt sau giấy tờ"
                        />
                        <div className="profile-doc-overlay">
                          <ZoomIn size={18} /> Phóng to
                        </div>
                      </div>
                    ) : (
                      <span className="profile-doc-empty">Không có ảnh</span>
                    )}
                  </div>
                  {isEditing && (
                    <div className="profile-doc-actions">
                      <label className="profile-doc-upload-btn">
                        <Camera size={13} />
                        {backDocPreview || profile.backDocUrl ? 'Thay ảnh' : 'Tải ảnh lên'}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          ref={backDocInputRef}
                          onChange={(e) => selectDocumentFile(e.currentTarget.files?.[0], e.currentTarget, setBackDocFile)}
                          type="file"
                        />
                      </label>
                      {backDocFile && (
                        <button
                          type="button"
                          className="profile-doc-remove-btn"
                          onClick={() => {
                            setBackDocFile(null);
                            if (backDocInputRef.current) backDocInputRef.current.value = '';
                          }}
                        >
                          <X size={13} /> Hủy chọn
                        </button>
                      )}
                    </div>
                  )}
                </article>

                {/* Slot 3: Selfie */}
                <article className="profile-doc-card">
                  <div className="profile-doc-title">ẢNH CHÂN DUNG / SELFIE</div>
                  <div className="profile-doc-frame">
                    {selfieDocPreview || profile.selfieDocUrl ? (
                      <div
                        className="profile-doc-preview-wrapper"
                        onClick={() => {
                          const url = selfieDocPreview || profile.selfieDocUrl;
                          if (url) setLightboxDoc({ url, label: 'Ảnh chân dung / Selfie' });
                        }}
                      >
                        <img
                          src={selfieDocPreview || profile.selfieDocUrl!}
                          alt="Ảnh chân dung / Selfie"
                        />
                        <div className="profile-doc-overlay">
                          <ZoomIn size={18} /> Phóng to
                        </div>
                      </div>
                    ) : (
                      <span className="profile-doc-empty">Không có ảnh</span>
                    )}
                  </div>
                  {isEditing && (
                    <div className="profile-doc-actions">
                      <label className="profile-doc-upload-btn">
                        <Camera size={13} />
                        {selfieDocPreview || profile.selfieDocUrl ? 'Thay ảnh' : 'Tải ảnh lên'}
                        <input
                          accept="image/jpeg,image/png,image/webp"
                          ref={selfieDocInputRef}
                          onChange={(e) => selectDocumentFile(e.currentTarget.files?.[0], e.currentTarget, setSelfieDocFile)}
                          type="file"
                        />
                      </label>
                      {selfieDocFile && (
                        <button
                          type="button"
                          className="profile-doc-remove-btn"
                          onClick={() => {
                            setSelfieDocFile(null);
                            if (selfieDocInputRef.current) selfieDocInputRef.current.value = '';
                          }}
                        >
                          <X size={13} /> Hủy chọn
                        </button>
                      )}
                    </div>
                  )}
                </article>
              </div>
            )}
          </section>

          {isEditing && (
            <footer className="profile-card-actions">
              <button
                className="profile-btn-cancel"
                disabled={busy}
                onClick={handleCancel}
                type="button"
              >
                <X size={15} /> Hủy
              </button>
              <button className="profile-btn-save" disabled={busy} type="submit">
                {busy ? <LoaderCircle size={16} className="profile-spinner" /> : <Check size={16} />}
                Lưu thay đổi
              </button>
            </footer>
          )}
        </form>
      ) : null}

      {lightboxDoc && (
        <div className="profile-doc-lightbox" onClick={() => setLightboxDoc(null)} role="presentation">
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={lightboxDoc.label}>
            <button aria-label="Đóng ảnh" onClick={() => setLightboxDoc(null)} type="button">
              <X size={20} />
            </button>
            <img src={lightboxDoc.url} alt={lightboxDoc.label} />
            <strong>{lightboxDoc.label}</strong>
          </div>
        </div>
      )}
    </div>
  );

  if (embeddedInShell) return profileContent;

  return (
    <div className="annual-home profile-home">
      <HomeNavbar />
      <main className="profile-main">{profileContent}</main>
      <HomeFooter />
    </div>
  );
};

export default ProfilePage;
