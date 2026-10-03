import React, { useState, useEffect, useCallback } from 'react';
import { Check, X, Eye, Clock, Search, FileText, Calendar, Mail, Phone, MapPin, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';

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

const DOC_TYPE_LABELS: Record<string, string> = {
  NationalId: 'CCCD/CMND',
  StudentCard: 'Thẻ HSSV',
  DriverLicense: 'Bằng Lái Xe',
  '0': 'CCCD/CMND',
  '1': 'Thẻ HSSV',
  '2': 'Bằng Lái Xe',
};

const normalizeStatus = (status: string | number): 'Submitted' | 'Approved' | 'Rejected' => {
  if (status === 0 || status === 'Submitted') return 'Submitted';
  if (status === 1 || status === 'Approved') return 'Approved';
  if (status === 2 || status === 'Rejected') return 'Rejected';
  return 'Submitted';
};

const normalizeDocType = (docType: string | number): string => {
  if (docType === 0) return 'NationalId';
  if (docType === 1) return 'StudentCard';
  if (docType === 2) return 'DriverLicense';
  return String(docType || 'NationalId');
};

const RegistrationApprovalPage: React.FC = () => {
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'Submitted' | 'Approved' | 'Rejected' | 'All'>('Submitted');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const accessToken = useAuthStore((s) => s.accessToken);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const fetchRegistrations = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      if (filter !== 'All') {
        params.append('status', filter);
      }
      if (searchQuery.trim()) {
        params.append('q', searchQuery.trim());
      }

      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`http://localhost:5278/api/v1/registrations?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Máy chủ trả về mã lỗi: ${response.status}`);
      }

      const json = await response.json();
      if (json.success && json.data) {
        const items: RegistrationItem[] = json.data.items || [];
        setRegistrations(items);
        setSelectedId((current) => {
          if (items.length > 0) {
            if (!current || !items.some((i) => i.id === current)) {
              return items[0].id;
            }
            return current;
          }
          return null;
        });
      } else {
        throw new Error(json.error || 'Không thể lấy dữ liệu đơn đăng ký');
      }
    } catch (err: unknown) {
      const errStr = err instanceof Error ? err.message : 'Không thể kết nối đến Backend API';
      setErrorMessage(errStr);
    } finally {
      setIsLoading(false);
    }
  }, [filter, searchQuery, accessToken]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const handleApprove = async (id: string) => {
    setIsActionLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`http://localhost:5278/api/v1/registrations/${id}/approve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          membershipExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          note: 'Phê duyệt tài khoản độc giả thư viện FPT',
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Phê duyệt thất bại.');
      }

      showToast('Đã phê duyệt tài khoản thành công!');
      await fetchRegistrations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi phê duyệt');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!actionId || !rejectReason.trim()) return;
    setIsActionLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`http://localhost:5278/api/v1/registrations/${actionId}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          reason: rejectReason.trim(),
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || 'Từ chối thất bại.');
      }

      showToast('Đã từ chối đơn đăng ký thành công!');
      setShowRejectModal(false);
      setActionId(null);
      setRejectReason('');
      await fetchRegistrations();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Lỗi khi từ chối');
    } finally {
      setIsActionLoading(false);
    }
  };

  const openRejectModal = (id: string) => {
    setActionId(id);
    setShowRejectModal(true);
  };

  const selected = registrations.find((r) => r.id === selectedId);

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)] relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-2 right-4 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Left Panel - List */}
      <div className="w-[420px] shrink-0 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        {/* Filter Bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchRegistrations()}
                placeholder="Tìm theo tên, email, SĐT..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
              />
            </div>
            <button
              onClick={fetchRegistrations}
              title="Tải lại từ cơ sở dữ liệu"
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="flex gap-1.5">
            {(['Submitted', 'Approved', 'Rejected', 'All'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  filter === f
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {f === 'Submitted'
                  ? 'Chờ duyệt'
                  : f === 'Approved'
                  ? 'Đã duyệt'
                  : f === 'Rejected'
                  ? 'Từ chối'
                  : 'Tất cả'}
              </button>
            ))}
          </div>
        </div>

        {/* Registration List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs">Đang tải dữ liệu từ database...</p>
            </div>
          ) : errorMessage ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center text-rose-500">
              <AlertCircle className="w-10 h-10 mb-2 opacity-80" />
              <p className="text-xs font-semibold">{errorMessage}</p>
              <button
                onClick={fetchRegistrations}
                className="mt-3 px-3 py-1.5 bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold hover:bg-rose-200 transition-colors"
              >
                Thử lại
              </button>
            </div>
          ) : registrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <FileText className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-xs font-medium">Không có hồ sơ nào</p>
              <p className="text-[10px] text-slate-500 mt-1">Dữ liệu thực từ PostgreSQL</p>
            </div>
          ) : (
            registrations.map((reg) => {
              const normStatus = normalizeStatus(reg.status);
              const normDoc = normalizeDocType(reg.documentType);
              const isSelected = selectedId === reg.id;

              return (
                <button
                  key={reg.id}
                  onClick={() => setSelectedId(reg.id)}
                  className={`w-full text-left p-4 border-b border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-500/10 border-l-4 border-l-indigo-600'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                        {reg.fullName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {reg.fullName}
                        </p>
                        <p className="text-[10px] text-slate-500">{reg.email}</p>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        normStatus === 'Submitted'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          : normStatus === 'Approved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {normStatus === 'Submitted'
                        ? 'Chờ duyệt'
                        : normStatus === 'Approved'
                        ? 'Đã duyệt'
                        : 'Từ chối'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(reg.submittedAt).toLocaleDateString('vi-VN')}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      {DOC_TYPE_LABELS[normDoc] || normDoc}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Detail */}
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-y-auto shadow-sm">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Eye className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">Chọn một đơn để xem chi tiết</p>
            <p className="text-xs mt-1">Nhấn vào đơn đăng ký bên trái để xem hồ sơ và giấy tờ</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-xl font-bold text-indigo-600">
                  {selected.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {selected.fullName}
                    </h2>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        normalizeStatus(selected.status) === 'Submitted'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          : normalizeStatus(selected.status) === 'Approved'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                      }`}
                    >
                      {normalizeStatus(selected.status) === 'Submitted'
                        ? 'Chờ duyệt'
                        : normalizeStatus(selected.status) === 'Approved'
                        ? 'Đã duyệt'
                        : 'Từ chối'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Đăng ký lúc: {new Date(selected.submittedAt).toLocaleString('vi-VN')}
                  </p>
                </div>
              </div>

              {normalizeStatus(selected.status) === 'Submitted' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(selected.id)}
                    disabled={isActionLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
                  >
                    {isActionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Phê duyệt
                  </button>
                  <button
                    onClick={() => openRejectModal(selected.id)}
                    disabled={isActionLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 shadow-lg shadow-rose-600/20 transition-all disabled:opacity-50"
                  >
                    <X className="w-4 h-4" /> Từ chối
                  </button>
                </div>
              )}
            </div>

            {/* Personal Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <Mail className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Email</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {selected.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <Phone className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Số điện thoại</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {selected.phone || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Ngày sinh</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {selected.dateOfBirth
                      ? new Date(selected.dateOfBirth).toLocaleDateString('vi-VN')
                      : 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <MapPin className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Địa chỉ</p>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {selected.address || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>
            </div>

            {/* Document Images */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                Giấy Tờ Tùy Thân ({DOC_TYPE_LABELS[normalizeDocType(selected.documentType)] || 'Giấy tờ'})
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Mặt trước
                  </p>
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                    {selected.frontDocUrl ? (
                      <img
                        src={selected.frontDocUrl}
                        alt="Mặt trước"
                        className="w-full h-44 object-cover hover:scale-105 transition-transform cursor-zoom-in"
                      />
                    ) : (
                      <div className="w-full h-44 flex items-center justify-center text-slate-400 text-xs">
                        Không có
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Mặt sau
                  </p>
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                    {selected.backDocUrl ? (
                      <img
                        src={selected.backDocUrl}
                        alt="Mặt sau"
                        className="w-full h-44 object-cover hover:scale-105 transition-transform cursor-zoom-in"
                      />
                    ) : (
                      <div className="w-full h-44 flex items-center justify-center text-slate-400 text-xs">
                        Không có
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Ảnh Chân Dung / Selfie
                  </p>
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                    {selected.selfieUrl ? (
                      <img
                        src={selected.selfieUrl}
                        alt="Selfie"
                        className="w-full h-44 object-cover hover:scale-105 transition-transform cursor-zoom-in"
                      />
                    ) : (
                      <div className="w-full h-44 flex items-center justify-center text-slate-400 text-xs">
                        Không có
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-[440px] p-6 space-y-4 shadow-2xl animate-in zoom-in-95 border border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Từ Chối Đơn Đăng Ký
            </h3>
            <p className="text-xs text-slate-500">
              Vui lòng nhập lý do từ chối. Trạng thái sẽ được cập nhật trực tiếp vào cơ sở dữ liệu.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Ảnh giấy tờ bị mờ, vui lòng tải lên ảnh chụp rõ nét hơn..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-indigo-500 text-slate-900 dark:text-white"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Hủy
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || isActionLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-rose-600/20"
              >
                {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Xác nhận Từ Chối
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegistrationApprovalPage;
