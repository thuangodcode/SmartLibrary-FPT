import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  Save,
  UserRound,
  X,
  ZoomIn,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminUserDetailPage.css';

type ReaderType = 'Student' | 'Lecturer' | 'External';

interface ManagedUserDetail {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  employeeId: string | null;
  studentId: string | null;
  teacherId: string | null;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  readerType: ReaderType | null;
  status: string;
  statusReason: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  membershipExpiresAt: string | null;
  roleName: 'Reader' | 'Librarian';
  registration: {
    id: string;
    documentType: string;
    status: string;
    documents: Array<{ id: string; side: 'Front' | 'Back' | 'Selfie'; documentLast4: string | null }>;
  } | null;
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const readerTypeLabels: Record<ReaderType, string> = {
  Student: 'Sinh viên trong trường',
  Lecturer: 'Giảng viên trong trường',
  External: 'Người bên ngoài trường',
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

const formatDate = (value: string | null, includeTime = false) => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa cập nhật'
    : date.toLocaleString('vi-VN', includeTime ? undefined : { dateStyle: 'medium' });
};

const AdminUserDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((state) => state.accessToken);
  const [user, setUser] = useState<ManagedUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showIdentityDocuments, setShowIdentityDocuments] = useState(false);
  const [identityDocumentsBusy, setIdentityDocumentsBusy] = useState(false);
  const [identityDocumentsError, setIdentityDocumentsError] = useState<string | null>(null);
  const [identityDocumentUrls, setIdentityDocumentUrls] = useState<Record<string, string>>({});
  const [lightboxDocument, setLightboxDocument] = useState<{ url: string; label: string } | null>(null);

  const loadUser = useCallback(async (signal?: AbortSignal) => {
    if (!userId || !accessToken) {
      setLoadError('Không thể xác thực phiên Admin hoặc tài khoản không hợp lệ.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      const result = await parseApiResponse<ApiResult<ManagedUserDetail>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể tải thông tin người dùng.');
      }
      setUser(result.data);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(error instanceof Error ? error.message : 'Không thể tải thông tin người dùng.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [accessToken, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadUser(controller.signal));
    return () => controller.abort();
  }, [loadUser]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !accessToken) return;
    setBusy(true);
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${user.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          phone: form.get('phone'),
          address: form.get('address'),
          studentId: form.get('studentId'),
          teacherId: form.get('teacherId'),
          dateOfBirth: form.get('dateOfBirth'),
        }),
      });
      const result = await parseApiResponse<ApiResult<ManagedUserDetail>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể cập nhật thông tin người dùng.');
      }
      setUser(result.data);
      setEditing(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể cập nhật thông tin người dùng.');
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !accessToken) return;
    setBusy(true);
    setFormError(null);
    const reason = new FormData(event.currentTarget).get('reason');
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Suspended', reason }),
      });
      const result = await parseApiResponse<ApiResult<ManagedUserDetail>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể cập nhật trạng thái tài khoản.');
      }
      setUser(result.data);
      setDeactivating(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async () => {
    if (!user || !accessToken) return;
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'Active' }),
      });
      const result = await parseApiResponse<ApiResult<ManagedUserDetail>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể kích hoạt tài khoản.');
      }
      setUser(result.data);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Không thể kích hoạt tài khoản.');
    } finally {
      setBusy(false);
    }
  };

  const toggleIdentityDocuments = async () => {
    if (!user?.registration?.documents.length || !userId || !accessToken) return;
    if (showIdentityDocuments) {
      setShowIdentityDocuments(false);
      return;
    }
    setShowIdentityDocuments(true);
    const missingDocuments = user.registration.documents.filter((document) => !identityDocumentUrls[document.id]);
    if (!missingDocuments.length) return;

    setIdentityDocumentsBusy(true);
    setIdentityDocumentsError(null);
    try {
      const results = await Promise.all(missingDocuments.map(async (document) => {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/admin/users/${user.id}/registrations/${user.registration!.id}/documents/${document.id}/url`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const result = await parseApiResponse<ApiResult<{ url: string }>>(response);
        if (!response.ok || !result?.success || !result.data?.url) {
          throw new Error(result?.error || 'Không thể tải giấy tờ xác minh.');
        }
        return [document.id, result.data.url] as const;
      }));
      setIdentityDocumentUrls((current) => ({ ...current, ...Object.fromEntries(results) }));
    } catch (error) {
      setIdentityDocumentsError(error instanceof Error ? error.message : 'Không thể tải giấy tờ xác minh.');
    } finally {
      setIdentityDocumentsBusy(false);
    }
  };

  if (loading) {
    return <section className="admin-user-detail-page"><div className="admin-user-detail-state"><LoaderCircle className="admin-users-spin" /> Đang tải thông tin...</div></section>;
  }

  if (loadError || !user) {
    return (
      <section className="admin-user-detail-page">
        <Link className="admin-user-back-link" to="/admin/users"><ArrowLeft size={16} /> Quay lại danh sách</Link>
        <div className="admin-user-detail-error" role="alert"><AlertCircle size={18} />{loadError || 'Không tìm thấy người dùng.'}</div>
      </section>
    );
  }

  const isReader = user.roleName === 'Reader';
  const approvedByLibrarian = user.registration?.status === 'Approved';
  const readerType: ReaderType | null = !isReader
    ? null
    : approvedByLibrarian
      ? 'External'
      : user.teacherId
        ? 'Lecturer'
        : user.studentId || user.email.toLowerCase().endsWith('@fpt.edu.vn')
          ? 'Student'
          : 'External';
  const isAccountEnabled = user.isActive && user.status !== 'Suspended';
  const isAccountActive = isAccountEnabled && user.status === 'Active';
  const accountStatusLabel = !user.isActive
    ? 'Không hoạt động'
    : statusLabels[user.status] || user.status;

  return (
    <section className="admin-user-detail-page">
      <header className="admin-user-detail-heading">
        <div>
          <p className="admin-user-detail-eyebrow"><Link to="/admin/users">Quản lý người dùng</Link> / Chi tiết tài khoản</p>
          <h1>Chi tiết {isReader ? 'độc giả' : 'thủ thư'}</h1>
          <p>Xem và cập nhật thông tin cá nhân, trạng thái hoạt động của tài khoản.</p>
        </div>
        <button className="admin-user-detail-button admin-user-detail-button--secondary" onClick={() => navigate('/admin/users')} type="button">
          <ArrowLeft size={15} /> Quay lại
        </button>
      </header>

      <article className="admin-user-detail-card">
        <header className="admin-user-profile-header">
          {user.avatarUrl ? (
            <button
              className="admin-user-avatar admin-user-avatar--photo"
              onClick={() => setLightboxDocument({ url: user.avatarUrl!, label: `Ảnh đại diện ${user.fullName}` })}
              type="button"
              aria-label={`Xem ảnh đại diện ${user.fullName}`}
            >
              <img src={user.avatarUrl} alt={`Ảnh đại diện ${user.fullName}`} />
            </button>
          ) : (
            <div className="admin-user-avatar">
              <UserRound size={24} />
            </div>
          )}
          <div className="admin-user-profile-intro">
            <span className={`admin-user-state-pill ${isAccountActive ? 'is-active' : isAccountEnabled ? 'is-pending' : 'is-inactive'}`}>
              <i />{accountStatusLabel}
            </span>
            <h2>{user.fullName}</h2>
            <p>{isReader ? (user.studentId || 'Chưa có mã độc giả') : user.email.split('@')[0]} <span>·</span> {user.email}</p>
          </div>
          <div className="admin-user-profile-actions">
            {isAccountEnabled ? (
              <button className="admin-user-detail-button admin-user-detail-button--danger" disabled={busy} onClick={() => { setFormError(null); setEditing(false); setDeactivating(true); }} type="button">
                <Ban size={15} /> Ngừng hoạt động
              </button>
            ) : (
              <button className="admin-user-detail-button admin-user-detail-button--success" disabled={busy} onClick={() => void reactivate()} type="button">
                {busy ? <LoaderCircle className="admin-users-spin" size={15} /> : <RotateCcw size={15} />} Kích hoạt tài khoản
              </button>
            )}
            {isReader && (user.registration?.documents.length ?? 0) > 0 && (
              <button className="admin-user-detail-button admin-user-detail-button--secondary" disabled={identityDocumentsBusy} onClick={() => void toggleIdentityDocuments()} type="button">
                {identityDocumentsBusy ? <LoaderCircle className="admin-users-spin" size={15} /> : <FileText size={15} />}
                Giấy tờ xác minh danh tính
              </button>
            )}
            <button className="admin-user-detail-button admin-user-detail-button--primary" disabled={busy} onClick={() => { setEditing((current) => !current); setFormError(null); setDeactivating(false); }} type="button">
              {editing ? <X size={15} /> : <Pencil size={15} />}{editing ? 'Hủy chỉnh sửa' : 'Chỉnh sửa'}
            </button>
          </div>
        </header>

        {!isAccountEnabled && user.statusReason && (
          <div className="admin-user-reason-note"><Ban size={16} /><div><strong>Lý do ngừng hoạt động</strong><p>{user.statusReason}</p></div></div>
        )}

        {(showIdentityDocuments || identityDocumentsError) && (
          <section className="admin-user-documents-section" aria-label="Giấy tờ xác minh danh tính">
            <div className="admin-user-section-heading">
              <div><span>HỒ SƠ XÁC MINH</span><h3>Giấy tờ xác minh danh tính</h3></div>
              <ImageIcon size={18} />
            </div>
            {identityDocumentsError && <div className="admin-user-form-error" role="alert"><AlertCircle size={15} />{identityDocumentsError}</div>}
            <div className="admin-user-documents-grid">
              {user.registration?.documents.map((document) => {
                const label = document.side === 'Front' ? 'Mặt trước giấy tờ' : document.side === 'Back' ? 'Mặt sau giấy tờ' : 'Ảnh chân dung / Selfie';
                const imageUrl = identityDocumentUrls[document.id];
                return (
                  <article className="admin-user-document-card" key={document.id}>
                    <h4>{label}</h4>
                    <button className="admin-user-document-preview" disabled={!imageUrl} onClick={() => imageUrl && setLightboxDocument({ url: imageUrl, label })} type="button">
                      {imageUrl ? <><img src={imageUrl} alt={label} /><span><ZoomIn size={18} /> Phóng to</span></> : identityDocumentsBusy ? <LoaderCircle className="admin-users-spin" size={20} /> : <span>Không có ảnh để hiển thị</span>}
                    </button>
                    {document.documentLast4 && <p>Ký tự cuối giấy tờ: ···· {document.documentLast4}</p>}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {deactivating && (
          <form className="admin-user-deactivation-form" onSubmit={updateStatus}>
            <label htmlFor="admin-user-deactivation-reason">Lý do ngừng hoạt động <span>Bắt buộc · từ 5 đến 500 ký tự</span></label>
            <textarea id="admin-user-deactivation-reason" maxLength={500} minLength={5} name="reason" placeholder="Nhập lý do để lưu vào hồ sơ và thông báo khi xem chi tiết..." required rows={3} />
            {formError && <div className="admin-user-form-error" role="alert"><AlertCircle size={15} />{formError}</div>}
            <div><button className="admin-user-detail-button admin-user-detail-button--secondary" disabled={busy} onClick={() => setDeactivating(false)} type="button">Hủy</button><button className="admin-user-detail-button admin-user-detail-button--danger" disabled={busy} type="submit">{busy ? <LoaderCircle className="admin-users-spin" size={15} /> : <Ban size={15} />} Xác nhận ngừng hoạt động</button></div>
          </form>
        )}

        <section className="admin-user-information" aria-labelledby="admin-user-information-title">
          <div className="admin-user-section-heading"><div><span>HỒ SƠ TÀI KHOẢN</span><h3 id="admin-user-information-title">Thông tin cá nhân</h3></div>{!editing && <Eye size={18} />}</div>
          {editing ? (
            <form className="admin-user-edit-form" onSubmit={saveProfile}>
              <label className="admin-user-field admin-user-field--wide"><span>Họ và tên</span><input autoComplete="name" maxLength={255} minLength={2} name="fullName" required defaultValue={user.fullName} /></label>
              <div className="admin-user-field"><span>Email / Tài khoản</span><div className="admin-user-readonly"><Mail size={15} />{user.email}</div></div>
              <label className="admin-user-field"><span>Số điện thoại</span><div className="admin-user-input-icon"><Phone size={15} /><input autoComplete="tel" maxLength={20} name="phone" defaultValue={user.phone ?? ''} placeholder="Chưa cập nhật" /></div></label>
              {isReader && (
                <>
                  <label className="admin-user-field"><span>MSSV</span><input maxLength={50} name="studentId" defaultValue={user.studentId ?? ''} placeholder="Chưa cập nhật" /></label>
                  <label className="admin-user-field"><span>Teacher ID</span><input maxLength={50} name="teacherId" defaultValue={user.teacherId ?? ''} placeholder="Chưa cập nhật" /></label>
                  <label className="admin-user-field"><span>Ngày sinh</span><div className="admin-user-input-icon"><CalendarDays size={15} /><input name="dateOfBirth" type="date" defaultValue={user.dateOfBirth ?? ''} /></div></label>
                  <div className="admin-user-field"><span>Phân loại độc giả</span><div className="admin-user-readonly">{readerType ? readerTypeLabels[readerType] : 'Chưa phân loại'}</div></div>
                  <label className="admin-user-field admin-user-field--wide"><span>Địa chỉ</span><div className="admin-user-input-icon"><MapPin size={15} /><input maxLength={500} name="address" defaultValue={user.address ?? ''} placeholder="Chưa cập nhật" /></div></label>
                </>
              )}
              {formError && <div className="admin-user-form-error" role="alert"><AlertCircle size={15} />{formError}</div>}
              <footer className="admin-user-edit-actions"><button className="admin-user-detail-button admin-user-detail-button--secondary" disabled={busy} onClick={() => { setEditing(false); setFormError(null); }} type="button">Hủy</button><button className="admin-user-detail-button admin-user-detail-button--primary" disabled={busy} type="submit">{busy ? <LoaderCircle className="admin-users-spin" size={15} /> : <Save size={15} />} Lưu thay đổi</button></footer>
            </form>
          ) : (
            <div className="admin-user-info-grid">
              <InfoItem icon={<UserRound size={15} />} label="Họ và tên" value={user.fullName} />
              <InfoItem icon={<Mail size={15} />} label="Email / Tài khoản" value={user.email} />
              <InfoItem icon={<Phone size={15} />} label="Số điện thoại" value={user.phone} />
              {!isReader && <InfoItem icon={<UserRound size={15} />} label="Mã nhân viên" value={user.employeeId} />}
              <InfoItem icon={<UserRound size={15} />} label={isReader ? user.teacherId ? 'Teacher ID' : user.studentId ? 'MSSV' : 'Tên đăng nhập' : 'Tên đăng nhập'} value={isReader ? user.teacherId || user.studentId || user.email.split('@')[0] : user.email.split('@')[0]} />
              {isReader && <InfoItem icon={<UserRound size={15} />} label="Phân loại độc giả" value={readerType ? readerTypeLabels[readerType] : null} />}
              {isReader && user.teacherId && <InfoItem icon={<UserRound size={15} />} label="MSSV" value={user.studentId} />}
              {isReader && <InfoItem icon={<CalendarDays size={15} />} label="Ngày sinh" value={formatDate(user.dateOfBirth)} />}
              {isReader && <InfoItem icon={<MapPin size={15} />} label="Địa chỉ thường trú" value={user.address} wide />}
              <InfoItem icon={<Clock3 size={15} />} label="Ngày tạo tài khoản" value={formatDate(user.createdAt, true)} />
              <InfoItem icon={<Clock3 size={15} />} label="Đăng nhập gần nhất" value={formatDate(user.lastLoginAt, true)} />
              {isReader && <InfoItem icon={<CalendarDays size={15} />} label="Thẻ thành viên hết hạn" value={formatDate(user.membershipExpiresAt)} />}
            </div>
          )}
        </section>

        {formError && !editing && !deactivating && <div className="admin-user-form-error" role="alert"><AlertCircle size={15} />{formError}</div>}
      </article>
      <div className="admin-user-detail-footnote"><Check size={14} /> Chỉ Admin mới có quyền xem và thay đổi hồ sơ người dùng.</div>
      {lightboxDocument && (
        <div className="admin-user-document-lightbox" onClick={() => setLightboxDocument(null)} role="presentation">
          <div onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={lightboxDocument.label}>
            <button aria-label="Đóng ảnh" onClick={() => setLightboxDocument(null)} type="button"><X size={20} /></button>
            <img src={lightboxDocument.url} alt={lightboxDocument.label} />
            <strong>{lightboxDocument.label}</strong>
          </div>
        </div>
      )}
    </section>
  );
};

const InfoItem: React.FC<{ icon: React.ReactNode; label: string; value: string | null | undefined; wide?: boolean }> = ({ icon, label, value, wide = false }) => (
  <div className={`admin-user-info-item${wide ? ' admin-user-info-item--wide' : ''}`}>
    <span className="admin-user-info-icon">{icon}</span>
    <div><span>{label}</span><strong>{value || 'Chưa cập nhật'}</strong></div>
  </div>
);

export default AdminUserDetailPage;
