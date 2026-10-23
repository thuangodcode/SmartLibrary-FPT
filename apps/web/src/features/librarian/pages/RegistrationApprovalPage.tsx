import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Upload,
  User,
  Users,
  UserRoundCheck,
  X,
  ZoomIn,
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { parseApiResponse } from '../../../lib/api';
import { API_BASE_URL } from '../../../config';
import './RegistrationApprovalPage.css';

/* ─── types ─── */

interface RegistrationItem {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  documentType: string | number;
  status: string | number;
  submittedAt: string;
  frontDocUrl?: string | null;
  backDocUrl?: string | null;
  selfieUrl?: string | null;
}

interface ImportResult {
  id: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  results: Array<{
    row: number;
    identifier: string;
    success: boolean;
    message?: string | null;
  }>;
}

interface ApiResult<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  NationalId: 'CCCD/CMND',
  StudentCard: 'Thẻ HSSV',
  DriverLicense: 'Bằng Lái Xe',
  '0': 'CCCD/CMND',
  '1': 'Thẻ HSSV',
  '2': 'Bằng Lái Xe',
};

const normalizeDocType = (dt: string | number): string => {
  if (dt === 0 || dt === '0' || dt === 'NationalId') return 'NationalId';
  if (dt === 1 || dt === '1' || dt === 'StudentCard') return 'StudentCard';
  if (dt === 2 || dt === '2' || dt === 'DriverLicense') return 'DriverLicense';
  return String(dt);
};

const normalizeStatus = (status: string | number): string => {
  if (status === 0 || status === '0' || status === 'Submitted') return 'Submitted';
  if (status === 1 || status === '1' || status === 'Approved') return 'Approved';
  if (status === 2 || status === '2' || status === 'Rejected') return 'Rejected';
  return String(status);
};

const statusLabels: Record<string, string> = {
  Submitted: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Đã từ chối',
};

const statusTones: Record<string, string> = {
  Submitted: 'yellow',
  Approved: 'green',
  Rejected: 'red',
};

let registrationsCache: RegistrationItem[] | null = null;

export const RegistrationApprovalPage: React.FC = () => {
  const [registrations, setRegistrations] = useState<RegistrationItem[]>(() => registrationsCache || []);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [loading, setLoading] = useState(() => !registrationsCache || registrationsCache.length === 0);
  const [error, setError] = useState<string | null>(null);

  // View state: 'list' | 'detail'
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Filters & Search
  const [filter, setFilter] = useState<'All' | 'Submitted' | 'Approved' | 'Rejected'>('All');
  const [search, setSearch] = useState('');

  // Modals & Action states
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Lightbox for document inspection
  const [lightboxImg, setLightboxImg] = useState<{ src: string; caption: string } | null>(null);
  const [failedImageUrls, setFailedImageUrls] = useState<Set<string>>(() => new Set());

  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchRegistrations = useCallback(async () => {
    if (!registrationsCache || registrationsCache.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/registrations`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: { items?: RegistrationItem[] } | RegistrationItem[]; error?: string }>(res);
      let list: RegistrationItem[] = [];
      const d = json?.data;
      if (Array.isArray(d)) {
        list = d;
      } else if (d && 'items' in d && Array.isArray(d.items)) {
        list = d.items;
      }
      registrationsCache = list;
      setRegistrations(list);
    } catch {
      if (!registrationsCache) {
        setError('Không thể tải danh sách đơn đăng ký. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchRegistrations());
  }, [fetchRegistrations]);

  // Actions
  const handleApprove = async (id: string) => {
    setIsActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/registrations/${id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể phê duyệt đơn này');
      }

      showToast('Đã phê duyệt tài khoản độc giả thành công!');
      await fetchRegistrations();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi phê duyệt', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedId || !rejectReason.trim()) return;
    setIsActionLoading(true);
    try {
      const token = useAuthStore.getState().accessToken;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE_URL}/api/v1/registrations/${selectedId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: rejectReason }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Không thể từ chối đơn này');
      }

      showToast('Đã từ chối đơn đăng ký thành công!');
      setShowRejectModal(false);
      setRejectReason('');
      await fetchRegistrations();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi từ chối đơn', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!importFile) return;

    setImportBusy(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const token = useAuthStore.getState().accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${API_BASE_URL}/api/v1/librarian/users/import`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await parseApiResponse<ApiResult<ImportResult>>(response);
      if (!response.ok || !result?.data) {
        throw new Error(result?.error || 'Không thể nhập tệp CSV.');
      }

      setImportResult(result.data);
      setImportFile(null);
      showToast(`Đã tạo ${result.data.successRows}/${result.data.totalRows} tài khoản độc giả!`);
      await fetchRegistrations();
    } catch (importError) {
      showToast(importError instanceof Error ? importError.message : 'Không thể nhập tệp CSV.', 'error');
    } finally {
      setImportBusy(false);
    }
  };

  const downloadTemplate = () => {
    const csvContent =
      'fullName,studentId,dateOfBirth,phone,address\n' +
      'Nguyen Van A,SE180001,2002-01-15,0901234567,TP HCM\n' +
      'Tran Thi B,SE180002,2002-06-20,0912345678,TP HCM\n';

    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_import_readers.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered registrations
  const filtered = useMemo(() => {
    return registrations.filter((reg) => {
      const normStatus = normalizeStatus(reg.status);
      if (filter !== 'All' && normStatus !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          reg.fullName?.toLowerCase().includes(q) ||
          reg.email?.toLowerCase().includes(q) ||
          reg.phone?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [registrations, filter, search]);

  const selected = registrations.find((r) => r.id === selectedId);
  const markImageFailed = (url: string) => {
    setFailedImageUrls((previous) => new Set(previous).add(url));
  };

  // Metrics
  const stats = useMemo(() => {
    const total = registrations.length;
    const submitted = registrations.filter((r) => normalizeStatus(r.status) === 'Submitted').length;
    const approved = registrations.filter((r) => normalizeStatus(r.status) === 'Approved').length;
    const rejected = registrations.filter((r) => normalizeStatus(r.status) === 'Rejected').length;
    return { total, submitted, approved, rejected };
  }, [registrations]);

  const openDetail = async (id: string) => {
    setSelectedId(id);
    setViewMode('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${API_BASE_URL}/api/v1/registrations/${id}`, { headers });
      const json = await parseApiResponse<{ success?: boolean; data?: Partial<RegistrationItem> }>(res);
      if (json?.data) {
        setRegistrations((prev) =>
          prev.map((item) => (item.id === id ? { ...item, ...json.data } : item))
        );
      }
    } catch {
      // ignore
    }
  };

  const backToList = () => {
    setViewMode('list');
  };

  return (
    <section className="reg-page">
      {/* ─── Mode: LIST VIEW (Table) ─── */}
      {viewMode === 'list' && (
        <>
          {/* Header */}
          <header className="reg-heading">
            <div>
              <p className="reg-eyebrow">THỦ THƯ / DUYỆT TÀI KHOẢN</p>
              <h1>Duyệt Đăng Ký Độc Giả</h1>
              <p className="reg-description">
                Xét duyệt tài khoản bạn đọc đăng ký từ bên ngoài và nhập danh sách sinh viên/giảng viên hàng loạt.
              </p>
            </div>
            <div className="reg-actions">
              <button className="reg-button reg-button--secondary" onClick={fetchRegistrations} type="button">
                <RefreshCw size={15} className={loading ? 'reg-spin' : ''} /> Làm mới
              </button>
              <button
                className="reg-button reg-button--primary"
                onClick={() => {
                  setImportResult(null);
                  setShowImportDialog(true);
                }}
                type="button"
              >
                <Upload size={15} /> Nhập danh sách
              </button>
            </div>
          </header>

          {/* Top 4 Metrics Cards */}
          <div className="reg-metrics">
            <article className="reg-metric">
              <div>
                <div className="reg-metric-num">{stats.total}</div>
                <div className="reg-metric-label">Tổng số hồ sơ</div>
              </div>
              <span className="reg-metric-icon reg-tone-orange">
                <Users size={18} />
              </span>
            </article>

            <article className="reg-metric">
              <div>
                <div className="reg-metric-num">{stats.submitted}</div>
                <div className="reg-metric-label">Chờ xét duyệt</div>
              </div>
              <span className="reg-metric-icon reg-tone-yellow">
                <Clock size={18} />
              </span>
            </article>

            <article className="reg-metric">
              <div>
                <div className="reg-metric-num">{stats.approved}</div>
                <div className="reg-metric-label">Đã phê duyệt</div>
              </div>
              <span className="reg-metric-icon reg-tone-green">
                <UserRoundCheck size={18} />
              </span>
            </article>

            <article className="reg-metric">
              <div>
                <div className="reg-metric-num">{stats.rejected}</div>
                <div className="reg-metric-label">Đã từ chối</div>
              </div>
              <span className="reg-metric-icon reg-tone-red">
                <X size={18} />
              </span>
            </article>
          </div>

          {/* Table Panel */}
          <section className="reg-table-panel">
            {/* Toolbar */}
            <div className="reg-table-toolbar">
              <nav className="reg-filter-tabs" aria-label="Lọc trạng thái hồ sơ">
                <button
                  type="button"
                  className={filter === 'All' ? 'is-active' : ''}
                  onClick={() => setFilter('All')}
                >
                  Tất cả <span className="reg-tab-badge">{stats.total}</span>
                </button>
                <button
                  type="button"
                  className={filter === 'Submitted' ? 'is-active' : ''}
                  onClick={() => setFilter('Submitted')}
                >
                  Chờ duyệt <span className="reg-tab-badge">{stats.submitted}</span>
                </button>
                <button
                  type="button"
                  className={filter === 'Approved' ? 'is-active' : ''}
                  onClick={() => setFilter('Approved')}
                >
                  Đã duyệt <span className="reg-tab-badge">{stats.approved}</span>
                </button>
                <button
                  type="button"
                  className={filter === 'Rejected' ? 'is-active' : ''}
                  onClick={() => setFilter('Rejected')}
                >
                  Đã từ chối <span className="reg-tab-badge">{stats.rejected}</span>
                </button>
              </nav>

              <label className="reg-search">
                <Search size={15} />
                <input
                  type="text"
                  placeholder="Tìm theo họ tên, email, SĐT..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            {/* Table */}
            <div className="reg-table-scroll">
              {loading ? (
                <div className="reg-state-box">
                  <LoaderCircle className="reg-spin" size={26} />
                  <span>Đang tải danh sách hồ sơ...</span>
                </div>
              ) : error ? (
                <div className="reg-state-box" style={{ color: '#dc2626' }}>
                  <AlertCircle size={26} />
                  <span>{error}</span>
                  <button className="reg-button reg-button--secondary" onClick={fetchRegistrations} type="button">
                    Thử lại
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="reg-state-box">
                  <FileText size={26} />
                  <span>Không tìm thấy hồ sơ đăng ký nào phù hợp.</span>
                </div>
              ) : (
                <table className="reg-table">
                  <thead>
                    <tr>
                      <th>Người Đăng Ký</th>
                      <th>Số Điện Thoại</th>
                      <th>Loại Giấy Tờ</th>
                      <th>Ngày Nộp Đơn</th>
                      <th>Trạng Thái</th>
                      <th style={{ textAlign: 'right' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((reg) => {
                      const normStatus = normalizeStatus(reg.status);
                      const initials = reg.fullName
                        ? reg.fullName
                            .split(' ')
                            .map((n) => n[0])
                            .slice(-2)
                            .join('')
                            .toUpperCase()
                        : 'ĐG';

                      return (
                        <tr key={reg.id} onClick={() => openDetail(reg.id)}>
                          <td>
                            <div className="reg-user-cell">
                              <div className="reg-table-avatar">{initials}</div>
                              <div className="reg-user-names">
                                <strong>{reg.fullName}</strong>
                                <span>{reg.email}</span>
                              </div>
                            </div>
                          </td>
                          <td>{reg.phone || '—'}</td>
                          <td>
                            <strong>{DOC_TYPE_LABELS[normalizeDocType(reg.documentType)] || 'Giấy tờ'}</strong>
                          </td>
                          <td>{new Date(reg.submittedAt).toLocaleString('vi-VN')}</td>
                          <td>
                            <span className={`reg-status reg-status--${statusTones[normStatus]}`}>
                              {statusLabels[normStatus]}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="reg-table-action-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetail(reg.id);
                              }}
                            >
                              <Eye size={13} /> Xem & Duyệt
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {/* ─── Mode: DETAIL VIEW (Inspect full candidate details) ─── */}
      {viewMode === 'detail' && selected && (
        <div className="reg-detail-view">
          {/* Top navigation */}
          <div className="reg-back-bar">
            <button type="button" className="reg-back-button" onClick={backToList}>
              <ArrowLeft size={16} /> Quay lại danh sách đơn
            </button>
          </div>

          <article className="reg-detail-card">
            {/* Candidate Header Banner */}
            <div className="reg-detail-banner">
              <div className="reg-detail-candidate">
                <div className="reg-detail-avatar-lg">
                  {selected.fullName
                    ? selected.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(-2)
                        .join('')
                        .toUpperCase()
                    : 'ĐG'}
                </div>
                <div>
                  <h2>
                    {selected.fullName}
                    <span className={`reg-status reg-status--${statusTones[normalizeStatus(selected.status)]}`}>
                      {statusLabels[normalizeStatus(selected.status)]}
                    </span>
                  </h2>
                  <p>Mã đơn: #{selected.id.slice(0, 8).toUpperCase()} · Nộp ngày {new Date(selected.submittedAt).toLocaleString('vi-VN')}</p>
                </div>
              </div>

              {/* Action Buttons if Pending, or Status Confirmation Banner */}
              <div className="reg-detail-controls">
                {normalizeStatus(selected.status) === 'Submitted' ? (
                  <>
                    <button
                      className="reg-button reg-button--approve"
                      disabled={isActionLoading}
                      onClick={() => handleApprove(selected.id)}
                      type="button"
                    >
                      {isActionLoading ? <LoaderCircle className="reg-spin" size={15} /> : <Check size={15} />}
                      Phê duyệt hồ sơ
                    </button>
                    <button
                      className="reg-button reg-button--reject"
                      disabled={isActionLoading}
                      onClick={() => setShowRejectModal(true)}
                      type="button"
                    >
                      <X size={15} /> Từ chối đơn
                    </button>
                  </>
                ) : normalizeStatus(selected.status) === 'Approved' ? (
                  <div className="reg-detail-badge reg-detail-badge--approved">
                    <Check size={16} /> Hồ sơ này đã được phê duyệt thành công
                  </div>
                ) : (
                  <div className="reg-detail-badge reg-detail-badge--rejected">
                    <X size={16} /> Hồ sơ này đã bị từ chối
                  </div>
                )}
              </div>
            </div>

            {/* Layout 2 Cột: Thông tin + Giấy tờ */}
            <div className="reg-detail-layout">
              {/* Cột trái: Thông tin cá nhân */}
              <div className="reg-detail-info-block">
                <h3 className="reg-detail-section-title">
                  <User size={15} /> Thông Tin Đăng Ký
                </h3>
                <div className="reg-info-list">
                  <div className="reg-info-item">
                    <User size={15} />
                    <div>
                      <p>Họ và tên</p>
                      <strong>{selected.fullName}</strong>
                    </div>
                  </div>
                  <div className="reg-info-item">
                    <Mail size={15} />
                    <div>
                      <p>Địa chỉ Email</p>
                      <strong>{selected.email}</strong>
                    </div>
                  </div>
                  <div className="reg-info-item">
                    <Phone size={15} />
                    <div>
                      <p>Số điện thoại</p>
                      <strong>{selected.phone || 'Chưa cập nhật'}</strong>
                    </div>
                  </div>
                  <div className="reg-info-item">
                    <Calendar size={15} />
                    <div>
                      <p>Ngày sinh</p>
                      <strong>
                        {selected.dateOfBirth ? new Date(selected.dateOfBirth).toLocaleDateString('vi-VN') : 'Chưa cập nhật'}
                      </strong>
                    </div>
                  </div>
                  <div className="reg-info-item">
                    <MapPin size={15} />
                    <div>
                      <p>Địa chỉ liên hệ</p>
                      <strong>{selected.address || 'Chưa cập nhật'}</strong>
                    </div>
                  </div>
                  <div className="reg-info-item">
                    <FileText size={15} />
                    <div>
                      <p>Loại giấy tờ tùy thân</p>
                      <strong>{DOC_TYPE_LABELS[normalizeDocType(selected.documentType)] || 'Giấy tờ tùy thân'}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cột phải: Hình ảnh giấy tờ đối chiếu */}
              <div className="reg-docs-review">
                <h3 className="reg-detail-section-title">
                  <FileText size={15} /> Giấy Tờ Xác Minh Danh Tính (Bấm vào ảnh để phóng to)
                </h3>
                <div className="reg-docs-triple">
                  {/* Slot 1: Mặt trước */}
                  <div className="reg-doc-frame-box">
                    <p className="reg-doc-frame-label">MẶT TRƯỚC GIẤY TỜ</p>
                    <div className="reg-doc-preview">
                      {selected.frontDocUrl && !failedImageUrls.has(selected.frontDocUrl) ? (
                        <>
                          <img
                            src={selected.frontDocUrl}
                            alt="Mặt trước"
                            onError={() => markImageFailed(selected.frontDocUrl!)}
                            onClick={() =>
                              setLightboxImg({ src: selected.frontDocUrl!, caption: 'Mặt trước giấy tờ tùy thân' })
                            }
                          />
                          <div className="reg-doc-preview-overlay">
                            <ZoomIn size={22} />
                            <span>Phóng to</span>
                          </div>
                        </>
                      ) : selected.frontDocUrl ? (
                        <span className="reg-doc-empty-note">Ảnh không tải được. Kiểm tra lại cấu hình Cloudinary hoặc đường dẫn ảnh.</span>
                      ) : (
                        <span className="reg-doc-empty-note">Không có ảnh</span>
                      )}
                    </div>
                  </div>

                  {/* Slot 2: Mặt sau */}
                  <div className="reg-doc-frame-box">
                    <p className="reg-doc-frame-label">MẶT SAU GIẤY TỜ</p>
                    <div className="reg-doc-preview">
                      {selected.backDocUrl && !failedImageUrls.has(selected.backDocUrl) ? (
                        <>
                          <img
                            src={selected.backDocUrl}
                            alt="Mặt sau"
                            onError={() => markImageFailed(selected.backDocUrl!)}
                            onClick={() =>
                              setLightboxImg({ src: selected.backDocUrl!, caption: 'Mặt sau giấy tờ tùy thân' })
                            }
                          />
                          <div className="reg-doc-preview-overlay">
                            <ZoomIn size={22} />
                            <span>Phóng to</span>
                          </div>
                        </>
                      ) : selected.backDocUrl ? (
                        <span className="reg-doc-empty-note">Ảnh không tải được. Kiểm tra lại cấu hình Cloudinary hoặc đường dẫn ảnh.</span>
                      ) : (
                        <span className="reg-doc-empty-note">Không có ảnh</span>
                      )}
                    </div>
                  </div>

                  {/* Slot 3: Selfie */}
                  <div className="reg-doc-frame-box">
                    <p className="reg-doc-frame-label">ẢNH CHÂN DUNG / SELFIE</p>
                    <div className="reg-doc-preview">
                      {selected.selfieUrl && !failedImageUrls.has(selected.selfieUrl) ? (
                        <>
                          <img
                            src={selected.selfieUrl}
                            alt="Chân dung selfie"
                            onError={() => markImageFailed(selected.selfieUrl!)}
                            onClick={() =>
                              setLightboxImg({ src: selected.selfieUrl!, caption: 'Ảnh chụp chân dung đối chiếu' })
                            }
                          />
                          <div className="reg-doc-preview-overlay">
                            <ZoomIn size={22} />
                            <span>Phóng to</span>
                          </div>
                        </>
                      ) : selected.selfieUrl ? (
                        <span className="reg-doc-empty-note">Ảnh không tải được. Kiểm tra lại cấu hình Cloudinary hoặc đường dẫn ảnh.</span>
                      ) : (
                        <span className="reg-doc-empty-note">Không có ảnh</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      )}

      {/* ─── Lightbox Modal ─── */}
      {lightboxImg && (
        <div className="reg-lightbox" onClick={() => setLightboxImg(null)}>
          <div className="reg-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="reg-lightbox-close"
              aria-label="Đóng xem ảnh"
              onClick={() => setLightboxImg(null)}
              type="button"
            >
              <X size={20} />
            </button>
            <img src={lightboxImg.src} alt={lightboxImg.caption} />
            <div className="reg-lightbox-caption">{lightboxImg.caption}</div>
          </div>
        </div>
      )}

      {/* ─── Import Dialog ─── */}
      {showImportDialog && (
        <div
          className="reg-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !importBusy) setShowImportDialog(false);
          }}
        >
          <section aria-labelledby="reg-import-title" aria-modal="true" className="reg-dialog reg-dialog--import" role="dialog">
            <header>
              <div>
                <span className="reg-dialog-icon">
                  <FileSpreadsheet size={19} />
                </span>
                <div>
                  <h2 id="reg-import-title">Nhập danh sách độc giả</h2>
                  <p>Tải lên CSV hoặc Excel (.xlsx), tối đa 2 MB và 1.000 sinh viên.</p>
                </div>
              </div>
              <button aria-label="Đóng" disabled={importBusy} onClick={() => setShowImportDialog(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <button className="reg-template-link" onClick={downloadTemplate} type="button">
              <Download size={15} /> Tải tệp mẫu CSV (mở được bằng Excel)
            </button>
            <form onSubmit={handleImport}>
              <label className="reg-file-picker">
                <Upload size={22} />
                <strong>{importFile?.name ?? 'Chọn tệp CSV hoặc Excel để tải lên'}</strong>
                <span>CSV, Excel (.xlsx) · Tối đa 2 MB</span>
                <input
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={importBusy}
                  onChange={(event) => {
                      const selectedFile = event.target.files?.[0] ?? null;
                      const extension = selectedFile?.name.split('.').pop()?.toLowerCase();
                      if (selectedFile && selectedFile.size > 2 * 1024 * 1024) {
                        setImportFile(null);
                        event.target.value = '';
                        showToast('Kích thước tệp không được vượt quá 2 MB.', 'error');
                        return;
                      }
                      if (selectedFile && extension !== 'csv' && extension !== 'xlsx') {
                        setImportFile(null);
                        event.target.value = '';
                        showToast('Chỉ hỗ trợ tệp CSV hoặc Excel (.xlsx).', 'error');
                        return;
                      }
                      setImportFile(selectedFile);
                      setImportResult(null);
                    }}
                  type="file"
                />
              </label>
              <p className="reg-field-hint">
                  Cột bắt buộc: MSSV (studentId), họ tên (fullName), số điện thoại (phone). Ngày sinh và địa chỉ là tùy chọn.
                  Tài khoản đăng nhập bằng MSSV; mật khẩu ban đầu là đúng số điện thoại trong tệp. Không gửi email khi nhập.
                  Sinh viên có thể thêm và xác minh email cá nhân sau trong Hồ sơ. Đặt số điện thoại ở dạng văn bản để giữ số 0 ở đầu.
                </p>
              {importResult && (
                <div className="reg-import-summary" role="status">
                  <strong>
                    Đã xử lý {importResult.totalRows} dòng: {importResult.successRows} tạo thành công, {importResult.failedRows} thất bại.
                  </strong>
                  {importResult.results
                    .filter((item) => !item.success)
                    .map((item) => (
                      <span className="reg-import-issue" key={`${item.row}-${item.identifier}`}>
                        Dòng {item.row} · {item.identifier || 'Không có MSSV'}: {item.message || 'Không thể tạo tài khoản.'}
                      </span>
                    ))}
                </div>
              )}
              <footer>
                <button
                  className="reg-button reg-button--secondary"
                  disabled={importBusy}
                  onClick={() => setShowImportDialog(false)}
                  type="button"
                >
                  Đóng
                </button>
                <button className="reg-button reg-button--primary" disabled={!importFile || importBusy} type="submit">
                  {importBusy ? <LoaderCircle className="reg-spin" size={16} /> : <Upload size={15} />} Nhập danh sách
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* ─── Reject Dialog ─── */}
      {showRejectModal && (
        <div
          className="reg-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowRejectModal(false);
          }}
        >
          <section aria-labelledby="reg-reject-title" aria-modal="true" className="reg-dialog" role="dialog">
            <header>
              <div>
                <span className="reg-dialog-icon reg-dialog-icon--red">
                  <X size={19} />
                </span>
                <div>
                  <h2 id="reg-reject-title">Từ chối đơn đăng ký</h2>
                  <p>Trạng thái và lý do từ chối sẽ được lưu vào cơ sở dữ liệu.</p>
                </div>
              </div>
              <button aria-label="Đóng" onClick={() => setShowRejectModal(false)} type="button">
                <X size={18} />
              </button>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReject();
              }}
            >
              <label>
                Lý do từ chối
                <textarea
                  name="reason"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Ví dụ: Ảnh giấy tờ bị mờ, vui lòng chụp lại rõ nét cả 2 mặt..."
                  rows={3}
                  required
                />
              </label>
              <footer>
                <button className="reg-button reg-button--secondary" onClick={() => setShowRejectModal(false)} type="button">
                  Hủy
                </button>
                <button className="reg-button reg-button--reject" disabled={!rejectReason.trim() || isActionLoading} type="submit">
                  {isActionLoading && <LoaderCircle className="reg-spin" size={16} />} Xác nhận từ chối
                </button>
              </footer>
            </form>
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
    </section>
  );
};

export default RegistrationApprovalPage;
