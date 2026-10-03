import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Search,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Check,
  X,
  Eye,
  AlertTriangle,
  BookOpen,
  CreditCard,
  Loader2,
  Lock,
  Unlock,
  PlusCircle,
  FileText,
  BadgeCheck,
  GraduationCap
} from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';

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
  status: string;
  readerType?: string | null;
  membershipExpiresAt?: string | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
  borrowingCount?: number;
  overdueCount?: number;
  unpaidFines?: number;
  frontDocUrl?: string | null;
  backDocUrl?: string | null;
  selfieUrl?: string | null;
}

interface ReaderStats {
  totalReaders: number;
  activeReaders: number;
  pendingReaders: number;
  suspendedReaders: number;
}

const normalizeStatus = (status: string | number): string => {
  if (status === 0 || status === 'Submitted' || status === 'PendingApproval' || status === 'PendingVerification') return 'PendingApproval';
  if (status === 1 || status === 'Approved' || status === 'Active') return 'Active';
  if (status === 'Suspended') return 'Suspended';
  if (status === 2 || status === 'Rejected') return 'Rejected';
  return String(status || 'Active');
};

const normalizeReaderType = (type?: string | null): string => {
  if (!type) return 'External';
  if (type === '0' || type === 'Student') return 'Student';
  if (type === '1' || type === 'Lecturer') return 'Lecturer';
  if (type === '2' || type === 'External') return 'External';
  return type;
};

const READER_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  Student: { label: 'Sinh viên', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
  Lecturer: { label: 'Giảng viên', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
  External: { label: 'Độc giả ngoài', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
};

export const ReadersManagementPage: React.FC = () => {
  const [readers, setReaders] = useState<ReaderItem[]>([]);
  const [stats, setStats] = useState<ReaderStats>({
    totalReaders: 0,
    activeReaders: 0,
    pendingReaders: 0,
    suspendedReaders: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'PendingApproval' | 'Suspended'>('All');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  
  // Selected Reader for Detail Modal
  const [selectedReader, setSelectedReader] = useState<ReaderItem | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  
  // Extend Membership Modal
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendMonths, setExtendMonths] = useState(12);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const accessToken = useAuthStore((s) => s.accessToken);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch Readers list from API (with fallback if ReadersController not restarted yet)
  const fetchReaders = useCallback(async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (statusFilter !== 'All') params.append('status', statusFilter);
      if (typeFilter !== 'All') params.append('readerType', typeFilter);

      let res = await fetch(`http://localhost:5278/api/v1/readers?${params.toString()}`, { headers });
      
      // If ReadersController is 404 (e.g. backend process not restarted yet), fallback to registrations/dashboard
      if (res.status === 404) {
        const regRes = await fetch(`http://localhost:5278/api/v1/registrations?status=All`, { headers });
        const regJson = await regRes.json();
        if (regJson.success && regJson.data?.items) {
          const fallbackItems: ReaderItem[] = regJson.data.items.map((r: any) => ({
            id: r.id,
            fullName: r.fullName,
            email: r.email,
            phone: r.phone,
            studentId: r.email.includes('se') ? r.email.split('@')[0].toUpperCase() : null,
            address: r.address,
            dateOfBirth: r.dateOfBirth,
            roleName: 'Reader',
            status: normalizeStatus(r.status),
            readerType: 'External',
            membershipExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            isActive: normalizeStatus(r.status) === 'Active',
            borrowingCount: 0,
            overdueCount: 0,
            unpaidFines: 0,
            frontDocUrl: r.frontDocUrl,
            backDocUrl: r.backDocUrl,
            selfieUrl: r.selfieUrl,
          }));

          setReaders(fallbackItems);
          setStats({
            totalReaders: fallbackItems.length,
            activeReaders: fallbackItems.filter(i => i.status === 'Active').length,
            pendingReaders: fallbackItems.filter(i => i.status === 'PendingApproval').length,
            suspendedReaders: fallbackItems.filter(i => i.status === 'Suspended').length,
          });
          return;
        }
      }

      if (!res.ok) throw new Error(`Mã lỗi máy chủ: ${res.status}`);

      const json = await res.json();
      if (json.success && json.data) {
        setReaders(json.data.items || []);
        if (json.data.stats) {
          setStats(json.data.stats);
        }
      }
    } catch (err: unknown) {
      console.error(err);
      showToast(err instanceof Error ? err.message : 'Không thể tải danh sách độc giả', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, searchQuery, statusFilter, typeFilter]);

  useEffect(() => {
    fetchReaders();
  }, [fetchReaders]);

  // Open detail modal and fetch extra info
  const handleViewDetail = async (reader: ReaderItem) => {
    setSelectedReader(reader);
    setIsDetailLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`http://localhost:5278/api/v1/readers/${reader.id}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setSelectedReader((prev) => ({ ...prev, ...json.data }));
        }
      }
    } catch (err) {
      console.warn('Could not fetch extra reader details', err);
    } finally {
      setIsDetailLoading(false);
    }
  };

  // Toggle user status (Active <-> Suspended)
  const handleToggleStatus = async (reader: ReaderItem) => {
    const newStatus = normalizeStatus(reader.status) === 'Active' ? 'Suspended' : 'Active';
    const actionName = newStatus === 'Active' ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản';
    
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionName.toLowerCase()} của độc giả ${reader.fullName}?`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`http://localhost:5278/api/v1/readers/${reader.id}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Không thể cập nhật trạng thái');

      showToast(`Đã ${actionName.toLowerCase()} thành công!`);
      setSelectedReader((prev) => prev ? { ...prev, status: newStatus, isActive: newStatus === 'Active' } : null);
      await fetchReaders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Extend Membership
  const handleExtendMembership = async () => {
    if (!selectedReader) return;
    setIsActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`http://localhost:5278/api/v1/readers/${selectedReader.id}/extend-membership`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ months: extendMonths }),
      });

      if (!res.ok) throw new Error('Không thể gia hạn thẻ độc giả');

      showToast(`Đã gia hạn thẻ độc giả thêm ${extendMonths} tháng thành công!`);
      setShowExtendModal(false);
      await fetchReaders();
      if (selectedReader) {
        handleViewDetail(selectedReader);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Lỗi khi gia hạn thẻ', 'error');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Filtered readers in case of in-memory query
  const displayReaders = useMemo(() => {
    return readers.filter((r) => {
      const normSt = normalizeStatus(r.status);
      if (statusFilter !== 'All' && normSt !== statusFilter) return false;
      const normTp = normalizeReaderType(r.readerType);
      if (typeFilter !== 'All' && normTp !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          (r.phone && r.phone.includes(q)) ||
          (r.studentId && r.studentId.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [readers, statusFilter, typeFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 text-white ${
          toastMessage.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}>
          {toastMessage.type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
            <Users className="w-7 h-7 text-indigo-600" /> Quản Lý Độc Giả
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Tra cứu, quản lý thẻ thành viên, theo dõi mượn trả và trạng thái hoạt động của sinh viên & độc giả thư viện.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchReaders}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Làm mới
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Tổng Độc Giả</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              {stats.totalReaders || readers.length}
            </h3>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Đang Hoạt Động</p>
            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {stats.activeReaders || readers.filter(r => normalizeStatus(r.status) === 'Active').length}
            </h3>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/20 text-amber-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Chờ Duyệt Thẻ</p>
            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {stats.pendingReaders || readers.filter(r => normalizeStatus(r.status) === 'PendingApproval').length}
            </h3>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/20 text-rose-600 flex items-center justify-center">
            <UserX className="w-6 h-6" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Bị Tạm Khóa</p>
            <h3 className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              {stats.suspendedReaders || readers.filter(r => normalizeStatus(r.status) === 'Suspended').length}
            </h3>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo Tên, Email, SĐT, MSSV..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <label className="text-xs font-semibold text-slate-500 shrink-0">Phân loại:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-600"
            >
              <option value="All">Tất cả phân loại</option>
              <option value="Student">Sinh viên (Student)</option>
              <option value="Lecturer">Giảng viên (Lecturer)</option>
              <option value="External">Độc giả ngoài (External)</option>
            </select>
          </div>
        </div>

        {/* Status Tab buttons */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {[
            { id: 'All', label: 'Tất cả trạng thái' },
            { id: 'Active', label: 'Đang hoạt động' },
            { id: 'PendingApproval', label: 'Chờ duyệt' },
            { id: 'Suspended', label: 'Bị tạm khóa' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Readers Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4">Độc Giả</th>
                <th className="py-3.5 px-4">MSSV / Mã Thẻ</th>
                <th className="py-3.5 px-4">Phân Loại</th>
                <th className="py-3.5 px-4">Mượn & Nợ Phạt</th>
                <th className="py-3.5 px-4">Trạng Thái</th>
                <th className="py-3.5 px-4">Hạn Thẻ</th>
                <th className="py-3.5 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                    Đang tải dữ liệu độc giả từ hệ thống...
                  </td>
                </tr>
              ) : displayReaders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 opacity-40 mx-auto mb-2" />
                    <p className="font-semibold text-sm">Không tìm thấy độc giả nào phù hợp</p>
                    <p className="text-[11px] mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
                  </td>
                </tr>
              ) : (
                displayReaders.map((reader) => {
                  const normSt = normalizeStatus(reader.status);
                  const normTp = normalizeReaderType(reader.readerType);
                  const typeMeta = READER_TYPE_LABELS[normTp] || READER_TYPE_LABELS.External;
                  const isExpired = reader.membershipExpiresAt && new Date(reader.membershipExpiresAt) < new Date();

                  return (
                    <tr
                      key={reader.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* Reader Profile */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                            {reader.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              {reader.fullName}
                              {normSt === 'Active' && (
                                <BadgeCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500">{reader.email}</p>
                            {reader.phone && (
                              <p className="text-[10px] text-slate-400 mt-0.5">{reader.phone}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Student ID / Reader ID */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {reader.studentId || reader.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>

                      {/* Reader Type */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${typeMeta.color}`}
                        >
                          <GraduationCap className="w-3 h-3" />
                          {typeMeta.label}
                        </span>
                      </td>

                      {/* Borrows & Fines */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 text-[11px]">
                            <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                            <span>Đang mượn: <strong>{reader.borrowingCount || 0}</strong> cuốn</span>
                          </div>
                          {(reader.unpaidFines ?? 0) > 0 ? (
                            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Nợ phạt: {Number(reader.unpaidFines).toLocaleString('vi-VN')} đ
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Không nợ phạt</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            normSt === 'Active'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                              : normSt === 'PendingApproval'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                              : normSt === 'Suspended'
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              normSt === 'Active'
                                ? 'bg-emerald-500'
                                : normSt === 'PendingApproval'
                                ? 'bg-amber-500 animate-pulse'
                                : normSt === 'Suspended'
                                ? 'bg-rose-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {normSt === 'Active'
                            ? 'Hoạt động'
                            : normSt === 'PendingApproval'
                            ? 'Chờ duyệt'
                            : normSt === 'Suspended'
                            ? 'Bị khóa'
                            : 'Từ chối'}
                        </span>
                      </td>

                      {/* Membership Expiry */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className={isExpired ? 'text-rose-600 font-bold' : ''}>
                            {reader.membershipExpiresAt
                              ? new Date(reader.membershipExpiresAt).toLocaleDateString('vi-VN')
                              : 'Vô thời hạn'}
                          </span>
                        </div>
                        {isExpired && (
                          <span className="text-[10px] text-rose-500 font-semibold block mt-0.5">
                            Thẻ đã hết hạn
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleViewDetail(reader)}
                            title="Xem chi tiết hồ sơ"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => {
                              setSelectedReader(reader);
                              setShowExtendModal(true);
                            }}
                            title="Gia hạn thẻ thư viện"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            <PlusCircle className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleToggleStatus(reader)}
                            title={normSt === 'Active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
                            className={`p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 transition-colors ${
                              normSt === 'Active'
                                ? 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-slate-800'
                                : 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            {normSt === 'Active' ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer info */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Hiển thị <strong>{displayReaders.length}</strong> độc giả</span>
          <span className="text-[11px] text-slate-400">SmartLibrary Hệ Thống Quản Trị Độc Giả 2026</span>
        </div>
      </div>

      {/* Reader Detail Modal */}
      {selectedReader && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-600/20">
                  {selectedReader.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    {selectedReader.fullName}
                  </h3>
                  <p className="text-xs text-slate-500">{selectedReader.email}</p>
                </div>
              </div>

              <button
                onClick={() => setSelectedReader(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <Phone className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Số điện thoại</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedReader.phone || 'Chưa cập nhật'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">MSSV / Mã độc giả</p>
                  <p className="font-semibold text-slate-900 dark:text-white font-mono">
                    {selectedReader.studentId || selectedReader.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Ngày sinh</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedReader.dateOfBirth
                      ? new Date(selectedReader.dateOfBirth).toLocaleDateString('vi-VN')
                      : 'Chưa cập nhật'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <Clock className="w-4 h-4 text-slate-400" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Hạn sử dụng thẻ</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedReader.membershipExpiresAt
                      ? new Date(selectedReader.membershipExpiresAt).toLocaleDateString('vi-VN')
                      : 'Không thời hạn'}
                  </p>
                </div>
              </div>

              <div className="col-span-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] text-slate-500 font-medium">Địa chỉ thường trú</p>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedReader.address || 'Chưa cập nhật địa chỉ'}
                  </p>
                </div>
              </div>
            </div>

            {/* Document Images (from Cloudinary) if available */}
            {(selectedReader.frontDocUrl || selectedReader.backDocUrl || selectedReader.selfieUrl) && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" /> Giấy Tờ Tùy Thân (Cloudinary)
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  {selectedReader.frontDocUrl && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500">Mặt trước</p>
                      <a href={selectedReader.frontDocUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={selectedReader.frontDocUrl} alt="Mặt trước" className="w-full h-28 object-cover hover:scale-105 transition-transform" />
                      </a>
                    </div>
                  )}
                  {selectedReader.backDocUrl && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500">Mặt sau</p>
                      <a href={selectedReader.backDocUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={selectedReader.backDocUrl} alt="Mặt sau" className="w-full h-28 object-cover hover:scale-105 transition-transform" />
                      </a>
                    </div>
                  )}
                  {selectedReader.selfieUrl && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500">Ảnh chân dung</p>
                      <a href={selectedReader.selfieUrl} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                        <img src={selectedReader.selfieUrl} alt="Selfie" className="w-full h-28 object-cover hover:scale-105 transition-transform" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <button
                onClick={() => setShowExtendModal(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
              >
                <PlusCircle className="w-4 h-4" /> Gia hạn thẻ thành viên
              </button>

              <button
                onClick={() => handleToggleStatus(selectedReader)}
                disabled={isActionLoading}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                  normalizeStatus(selectedReader.status) === 'Active'
                    ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
                    : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                }`}
              >
                {normalizeStatus(selectedReader.status) === 'Active' ? (
                  <>
                    <Lock className="w-4 h-4" /> Tạm khóa tài khoản
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" /> Mở khóa tài khoản
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Membership Modal */}
      {showExtendModal && selectedReader && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Gia Hạn Thẻ Thư Viện
              </h3>
              <button onClick={() => setShowExtendModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Gia hạn quyền sử dụng thư viện và mượn sách cho độc giả: <strong className="text-slate-900 dark:text-white">{selectedReader.fullName}</strong>.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">Chọn thời hạn gia hạn:</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { m: 6, label: '6 tháng' },
                  { m: 12, label: '1 năm' },
                  { m: 24, label: '2 năm' },
                ].map(({ m, label }) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExtendMonths(m)}
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition-all ${
                      extendMonths === m
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 shadow-sm'
                        : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExtendModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExtendMembership}
                disabled={isActionLoading}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-md shadow-indigo-600/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Xác nhận gia hạn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReadersManagementPage;
