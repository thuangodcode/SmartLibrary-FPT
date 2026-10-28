import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownToLine, BadgeCheck, BookOpen, CalendarDays, ChartNoAxesCombined, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, ClipboardList, Clock3, Eye, FileSpreadsheet, Filter, LoaderCircle, Plus, Search, Send, Trash2, UsersRound, WalletCards, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { AnimatedCalendar } from '../../../components/ui/AnimatedCalendar';
import './AdminReportsPage.css';
import './AdminReportsExperience.css';
import './AdminAssignments.css';

interface ApiEnvelope<T> { success?: boolean; data?: T; error?: string }
interface Summary { from: string; to: string; borrowed: number; returned: number; returnedOnTimeRate: number; borrowedChangePercent: number; returnedChangePercent: number; fineRevenue: number; fineTransactions: number; fineChangePercent: number; cashFineRevenue: number; payOSFineRevenue: number; unclassifiedFineRevenue: number; libraryVisits: number | null; libraryVisitsAvailable: boolean }
interface CategoryStat { category: string; count: number; percent: number }
interface ReportItem { id: string; code: string; name: string; submitter: string; createdAt: string; format: string; status: string; isViewed: boolean; isApproved: boolean; isRejected?: boolean }
interface ReportList { items: ReportItem[]; totalCount: number; page: number; pageSize: number; totalPages: number }
interface Librarian { id: string; fullName: string; status: string; isActive: boolean }
interface LibrarianList { items: Librarian[] }
interface ReportTemplate { id: string; name: string; reportType: string; isEnabled: boolean }
interface ReportRequest { id: string; librarianId: string; librarianName: string; templateId: string; templateName: string; reportType: string; periodStart: string; periodEnd: string; name: string; status: string; createdAt: string; reportId?: string | null; lastReportId?: string | null; lastReportStatus?: string | null; lastReviewComment?: string | null; isSelfSubmitted?: boolean }
interface FinanceFine { id: string; code: string; readerName: string; bookTitle: string; barcode: string; amount: number; reason: string; status: string; createdAt: string; paidAt?: string | null; paymentMethod?: string | null; paymentReference?: string | null; reconciliationRequired?: boolean }

const number = (value: number) => value.toLocaleString('vi-VN');
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
const reportTypeLabel = (type: string) => ({ Activity: 'Hoạt động mượn trả', Finance: 'Tài chính', Collection: 'Kho sách', Periodic: 'Định kỳ' }[type] ?? type);
const inputDate = (value: string) => {
  const parsed = new Date(value);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
const dateToInput = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const dateFromInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const requestedEndDate = (value: string) => {
  const parsed = new Date(value);
  parsed.setDate(parsed.getDate() - 1);
  return inputDate(parsed.toISOString());
};

const AdminReportsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.accessToken);
  const [params, setParams] = useSearchParams();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [reports, setReports] = useState<ReportList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(params.get('search') ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [requests, setRequests] = useState<ReportRequest[]>([]);
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'waiting' | 'review' | 'approved'>('all');
  const [librarians, setLibrarians] = useState<Librarian[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestLibrarianId, setRequestLibrarianId] = useState('');
  const [requestTemplateId, setRequestTemplateId] = useState('');
  const [requestName, setRequestName] = useState('');
  const [requestPeriodStart, setRequestPeriodStart] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() - 30);
    return dateToInput(value);
  });
  const [requestPeriodEnd, setRequestPeriodEnd] = useState(() => dateToInput(new Date()));
  const [financeFines, setFinanceFines] = useState<FinanceFine[]>([]);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [reportDates, setReportDates] = useState<Date[]>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    return [start, end];
  });

  const query = useMemo(() => new URLSearchParams(params), [params]);
  const requestedSection = location.pathname.split('/')[3] ?? 'assignments';
  const activeSection = ['assignments', 'activity', 'finance', 'collection', 'periodic', 'library'].includes(requestedSection)
    ? requestedSection
    : 'assignments';
  const page = Math.max(1, Number(query.get('page') ?? 1));

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token) { setError('Vui lòng đăng nhập Admin để xem báo cáo.'); setLoading(false); return; }
    setLoading(true); setError(null);
    const needsSummary = activeSection === 'activity' || activeSection === 'finance';
    const needsReportList = activeSection === 'library';
    if (!needsSummary && !needsReportList) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: '8',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
    for (const key of ['search', 'month', 'status', 'format']) { const value = query.get(key); if (value) qs.set(key, value); }
    const periodQuery = new URLSearchParams();
    if (reportDates[0]) periodQuery.set('from', dateToInput(reportDates[0]));
    if (reportDates[1]) periodQuery.set('to', dateToInput(reportDates[1]));
    try {
      if (needsSummary) {
        const [summaryResponse, categoryResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/admin/reports/summary?${periodQuery}`, { headers, signal }),
          fetch(`${API_BASE_URL}/api/admin/reports/summary/borrow-by-category?${periodQuery}`, { headers, signal }),
        ]);
        if ([summaryResponse, categoryResponse].some((response) => response.status === 404)) {
          throw new Error('API đang chạy phiên bản chưa có module báo cáo. Hãy khởi động lại SmartLibrary API mới và áp dụng migration supabase/migrations/00007_reports.sql.');
        }
        const [s, c] = await Promise.all([
          parseApiResponse<ApiEnvelope<Summary>>(summaryResponse),
          parseApiResponse<ApiEnvelope<CategoryStat[]>>(categoryResponse),
        ]);
        if (!summaryResponse.ok || !s?.success || !s.data) throw new Error(s?.error || `Không tải được thống kê (HTTP ${summaryResponse.status}).`);
        if (!categoryResponse.ok || !c?.success) throw new Error(c?.error || 'Không tải được thống kê nhóm sách.');
        setSummary(s.data);
        setCategories(c.data ?? []);
      }
      if (needsReportList) {
        const reportsResponse = await fetch(`${API_BASE_URL}/api/admin/reports?${qs}`, { headers, signal });
        if (reportsResponse.status === 404) throw new Error('API đang chạy phiên bản chưa có module báo cáo. Hãy khởi động lại SmartLibrary API mới và áp dụng migration supabase/migrations/00007_reports.sql.');
        const r = await parseApiResponse<ApiEnvelope<ReportList>>(reportsResponse);
        if (!reportsResponse.ok || !r?.success || !r.data) throw new Error(r?.error || 'Không tải được danh sách báo cáo.');
        setReports(r.data);
      }
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Đã xảy ra lỗi khi tải báo cáo.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [activeSection, page, query, reportDates, token]);

  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void load(controller.signal); }, 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { setParams((current) => { const next = new URLSearchParams(current); if (searchInput.trim()) next.set('search', searchInput.trim()); else next.delete('search'); next.delete('page'); return next; }); }, 350); return () => window.clearTimeout(timer); }, [searchInput, setParams]);

  const updateQuery = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; });

  const loadFinanceFines = useCallback(async (signal?: AbortSignal) => {
    if (!token || activeSection !== 'finance') return;
    setFinanceLoading(true);
    setFinanceError(null);
    try {
      const periodQuery = new URLSearchParams();
      if (reportDates[0]) periodQuery.set('from', dateToInput(reportDates[0]));
      if (reportDates[1]) periodQuery.set('to', dateToInput(reportDates[1]));
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/finance/fines?${periodQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      const result = await parseApiResponse<ApiEnvelope<FinanceFine[]>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không tải được chi tiết phí phạt.');
      setFinanceFines(result.data ?? []);
    } catch (caught) {
      if (!signal?.aborted) setFinanceError(caught instanceof Error ? caught.message : 'Không tải được chi tiết phí phạt.');
    } finally {
      if (!signal?.aborted) setFinanceLoading(false);
    }
  }, [activeSection, reportDates, token]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadFinanceFines(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadFinanceFines]);

  const loadAssignmentData = useCallback(async () => {
    if (!token) return;
    setRequestError(null);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [requestsResponse, templatesResponse, librariansResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/reports/requests`, { headers }),
        fetch(`${API_BASE_URL}/api/admin/reports/templates`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/admin/users?role=Librarian&page=1&pageSize=100&status=Active`, { headers }),
      ]);
      const [requestResult, templateResult, librarianResult] = await Promise.all([
        parseApiResponse<ApiEnvelope<ReportRequest[]>>(requestsResponse),
        parseApiResponse<ApiEnvelope<ReportTemplate[]>>(templatesResponse),
        parseApiResponse<ApiEnvelope<LibrarianList>>(librariansResponse),
      ]);
      if (!requestsResponse.ok || !requestResult?.success || !requestResult.data) throw new Error(requestResult?.error || 'Không tải được các yêu cầu báo cáo.');
      if (!templatesResponse.ok || !templateResult?.success || !templateResult.data) throw new Error(templateResult?.error || 'Không tải được mẫu báo cáo.');
      if (!librariansResponse.ok || !librarianResult?.success || !librarianResult.data) throw new Error(librarianResult?.error || 'Không tải được danh sách Thủ thư.');
      setRequests(requestResult.data);
      setTemplates(templateResult.data.filter((template) => template.isEnabled));
      setLibrarians(librarianResult.data.items.filter((librarian) => librarian.isActive || librarian.status === 'Active'));
    } catch (caught) {
      setRequestError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu giao báo cáo.');
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAssignmentData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAssignmentData]);

  const createReportRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !requestLibrarianId || !requestTemplateId) return;
    if (!requestPeriodStart || !requestPeriodEnd) {
      setToast('Chọn đầy đủ ngày bắt đầu và ngày kết thúc của kỳ báo cáo.');
      return;
    }
    if (requestPeriodEnd < requestPeriodStart) {
      setToast('Ngày kết thúc không được trước ngày bắt đầu.');
      return;
    }
    setRequestBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          librarianId: requestLibrarianId,
          templateId: requestTemplateId,
          name: requestName.trim() || undefined,
          periodStart: new Date(requestPeriodStart).toISOString(),
          periodEnd: new Date(new Date(requestPeriodEnd).getTime() + 86400000).toISOString(),
        }),
      });
      const result = await parseApiResponse<ApiEnvelope<ReportRequest>>(response);
      if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'Không thể giao yêu cầu báo cáo.');
      setToast(`Đã giao yêu cầu cho ${result.data.librarianName}.`);
      setRequestFormOpen(false);
      setRequestName('');
      setRequestLibrarianId('');
      setRequestTemplateId('');
      await loadAssignmentData();
    } catch (caught) {
      setToast(caught instanceof Error ? caught.message : 'Không thể giao yêu cầu báo cáo.');
    } finally {
      setRequestBusy(false);
    }
  };

  const selectedRequestTemplate = templates.find((template) => template.id === requestTemplateId);
  const assignedRequests = useMemo(() => requests.filter((request) => !request.isSelfSubmitted), [requests]);
  const selfSubmittedReports = useMemo(() => requests.filter((request) => request.isSelfSubmitted), [requests]);
  const assignmentCounts = useMemo(() => ({
    all: assignedRequests.length,
    waiting: assignedRequests.filter((request) => request.status !== 'Submitted' || request.lastReportStatus === 'Rejected').length,
    review: assignedRequests.filter((request) => request.status === 'Submitted' && !['Approved', 'Rejected'].includes(request.lastReportStatus ?? '')).length,
    approved: assignedRequests.filter((request) => request.lastReportStatus === 'Approved').length,
  }), [assignedRequests]);
  const visibleRequests = useMemo(() => assignedRequests.filter((request) => {
    if (assignmentFilter === 'waiting') return request.status !== 'Submitted' || request.lastReportStatus === 'Rejected';
    if (assignmentFilter === 'review') return request.status === 'Submitted' && !['Approved', 'Rejected'].includes(request.lastReportStatus ?? '');
    if (assignmentFilter === 'approved') return request.lastReportStatus === 'Approved';
    return true;
  }), [assignmentFilter, assignedRequests]);

  const exportCsv = async (reportId?: string) => {
    try {
      const exportQuery = new URLSearchParams({ format: 'csv' });
      if (!reportId) {
        if (reportDates[0]) exportQuery.set('from', dateToInput(reportDates[0]));
        if (reportDates[1]) exportQuery.set('to', dateToInput(reportDates[1]));
      }
      const url = reportId
        ? `${API_BASE_URL}/api/admin/reports/${reportId}/export?${exportQuery}`
        : `${API_BASE_URL}/api/admin/reports/export?${exportQuery}`;
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) { const result = await parseApiResponse<ApiEnvelope<never>>(response); throw new Error(result?.error || 'Không thể xuất CSV.'); }
      const blob = await response.blob(); const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(blob); anchor.download = reportId ? 'bao-cao.csv' : 'thong-ke-thu-vien.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Không thể xuất CSV.'); }
  };

  const exportSelected = async () => {
    if (!token || selected.length === 0) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/reports/bulk-export`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(selected) });
      if (!response.ok) { const result = await parseApiResponse<ApiEnvelope<never>>(response); throw new Error(result?.error || 'Không thể tải các báo cáo đã chọn.'); }
      const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(await response.blob()); anchor.download = 'bao-cao-da-chon.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Không thể tải các báo cáo đã chọn.'); }
  };

  const deleteReports = async () => {
    if (!confirmDelete || !token) return;
    setBusy(true);
    try {
      const response = confirmDelete.length === 1
        ? await fetch(`${API_BASE_URL}/api/admin/reports/${confirmDelete[0]}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        : await fetch(`${API_BASE_URL}/api/admin/reports/bulk-delete`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(confirmDelete) });
      if (!response.ok) { const result = await parseApiResponse<ApiEnvelope<never>>(response); throw new Error(result?.error || 'Không thể xóa báo cáo.'); }
      setToast(`Đã xóa ${confirmDelete.length} báo cáo.`); setConfirmDelete(null); setSelected([]); await load();
    } catch (caught) { setToast(caught instanceof Error ? caught.message : 'Không thể xóa báo cáo.'); }
    finally { setBusy(false); }
  };

  const cards = summary ? [
    { label: 'Sách mượn', value: number(summary.borrowed), note: `${summary.borrowedChangePercent > 0 ? '+' : ''}${summary.borrowedChangePercent}% so với kỳ trước`, icon: BookOpen, tone: 'orange' },
    { label: 'Sách trả', value: number(summary.returned), note: `${summary.returnedOnTimeRate}% trả đúng hạn`, icon: CheckCircle2, tone: 'green' },
    { label: 'Lượt vào thư viện', value: summary.libraryVisitsAvailable && summary.libraryVisits !== null ? number(summary.libraryVisits) : 'Chưa có dữ liệu', note: 'Nguồn ghi nhận lượt vào chưa được kết nối', icon: UsersRound, tone: 'blue' },
    { label: 'Phí đã thu', value: money(summary.fineRevenue), note: `${number(summary.fineTransactions)} giao dịch`, icon: CircleDollarSign, tone: 'purple' },
    { label: 'Giao dịch phí', value: number(summary.fineTransactions), note: 'Giao dịch trong kỳ', icon: CircleDollarSign, tone: 'purple' },
    { label: 'Thu tiền mặt', value: money(summary.cashFineRevenue), note: 'Đã xác nhận tại quầy', icon: WalletCards, tone: 'orange' },
    { label: 'Thu qua PayOS', value: money(summary.payOSFineRevenue), note: 'Đã xác nhận qua webhook', icon: CircleDollarSign, tone: 'green' },
  ] : [];
  const sectionDetails: Record<string, { title: string; description: string }> = {
    assignments: { title: 'Theo dõi giao việc', description: 'Theo dõi các yêu cầu báo cáo đã giao cho Thủ thư.' },
    activity: { title: 'Hoạt động thư viện', description: 'Thống kê hoạt động mượn trả và lượt sử dụng thư viện.' },
    finance: { title: 'Tài chính', description: 'Theo dõi phí thư viện và các giao dịch đã thu.' },
    collection: { title: 'Kho sách', description: 'Thống kê tình hình kho sách của thư viện.' },
    periodic: { title: 'Báo cáo định kỳ', description: 'Theo dõi dữ liệu tổng hợp theo các kỳ báo cáo.' },
    library: { title: 'Thư viện báo cáo', description: 'Xem và quản lý các báo cáo được gửi từ Thủ thư.' },
  };
  const sectionCards = activeSection === 'activity'
    ? cards.filter((card) => ['Sách mượn', 'Sách trả', 'Lượt vào thư viện'].includes(card.label))
    : activeSection === 'finance'
      ? cards.filter((card) => ['Phí đã thu', 'Giao dịch phí', 'Thu tiền mặt', 'Thu qua PayOS', 'Chưa phân loại'].includes(card.label))
      : [];
  const pendingFines = financeFines.filter((fine) => fine.status === 'Pending');
  const pendingFineAmount = pendingFines.reduce((total, fine) => total + fine.amount, 0);
  const financeCards = summary ? [
    ...sectionCards,
    { label: 'Đang chờ thu', value: money(pendingFineAmount), note: `${number(pendingFines.length)} khoản chưa thanh toán`, icon: WalletCards, tone: 'orange' },
  ] : [];

  return <div className={`reports-page${activeSection === 'assignments' ? ' reports-page-assignments' : ''}`}>
    {activeSection === 'assignments' ? (
      <header className="admin-assignments-hero">
        <div className="admin-assignments-hero-copy">
          <p className="reports-eyebrow">TRUNG TÂM ĐIỀU HÀNH · QUẢN TRỊ</p>
          <h1>Quản lý báo cáo</h1>
          <p>Theo dõi riêng báo cáo Admin giao và báo cáo Thủ thư chủ động gửi.</p>
        </div>
        <div className="admin-assignments-hero-aside">
          <span><UsersRound size={17}/> Phạm vi quản lý</span>
          <strong>Toàn bộ Thủ thư</strong>
          <button type="button" className="reports-button primary" onClick={() => setRequestFormOpen((open) => !open)}>{requestFormOpen ? <X size={16}/> : <Plus size={16}/>} {requestFormOpen ? 'Đóng biểu mẫu' : 'Giao báo cáo cho Thủ thư'}</button>
        </div>
      </header>
    ) : (
      <div className="reports-heading"><div><p className="reports-eyebrow">QUẢN TRỊ HỆ THỐNG</p><h1>{sectionDetails[activeSection].title}</h1><p>{sectionDetails[activeSection].description}</p></div><div className="reports-actions">{['activity', 'finance'].includes(activeSection) && <button type="button" className="reports-button secondary" onClick={() => void exportCsv()}><FileSpreadsheet size={16}/> Xuất CSV</button>}</div></div>
    )}
    {['activity', 'finance'].includes(activeSection) && <section className="reports-panel reports-period-filter" aria-label="Lọc khoảng thời gian">
      <div><span className="reports-period-filter-kicker">KHOẢNG THỜI GIAN</span><strong>{reportDates.length === 2 ? `${dateToInput(reportDates[0])} – ${dateToInput(reportDates[1])}` : 'Chọn ngày bắt đầu và kết thúc'}</strong></div>
      <AnimatedCalendar
        mode="range"
        value={reportDates}
        onChange={setReportDates}
        placeholder="Chọn khoảng ngày thống kê"
        ariaLabel="Chọn khoảng ngày thống kê"
        className="reports-period-calendar"
      />
      <button type="button" className="reports-period-reset" onClick={() => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 30);
        setReportDates([start, end]);
      }}>30 ngày gần nhất</button>
    </section>}
    {error && <div className="reports-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={() => void load()} type="button">Thử lại</button></div>}
    {activeSection === 'assignments' && <section className="admin-assignment-overview" aria-label="Tổng quan tiến độ báo cáo">
      <article className="admin-assignment-metric">
        <span className="admin-assignment-metric-icon total"><ClipboardList size={18}/></span>
        <div><strong>{assignmentCounts.all}</strong><span>Yêu cầu Admin đã giao</span></div>
        <small>Chỉ tính báo cáo được phân công</small>
      </article>
      <article className="admin-assignment-metric">
        <span className="admin-assignment-metric-icon waiting"><Clock3 size={18}/></span>
        <div><strong>{assignmentCounts.waiting}</strong><span>Chờ Thủ thư gửi</span></div>
        <small>Chưa có báo cáo nộp lên</small>
      </article>
      <article className="admin-assignment-metric">
        <span className="admin-assignment-metric-icon review"><Eye size={18}/></span>
        <div><strong>{assignmentCounts.review}</strong><span>Chờ Admin duyệt</span></div>
        <small>Đã gửi, cần xem xét</small>
      </article>
      <article className="admin-assignment-metric">
        <span className="admin-assignment-metric-icon approved"><BadgeCheck size={18}/></span>
        <div><strong>{assignmentCounts.approved}</strong><span>Đã hoàn tất</span></div>
        <small>Báo cáo đã được duyệt</small>
      </article>
    </section>}
    {activeSection === 'assignments' && requestFormOpen && <section className="reports-panel reports-assignment-form-panel">
      <div className="reports-panel-title"><div><span>GIAO VIỆC CHO THỦ THƯ</span><h2>Tạo yêu cầu nộp báo cáo</h2></div><button className="reports-icon-button" type="button" onClick={() => setRequestFormOpen(false)} aria-label="Đóng biểu mẫu"><X size={18}/></button></div>
      <p className="reports-assignment-help">Chọn một Thủ thư, mẫu/loại báo cáo và kỳ cần tổng hợp. Yêu cầu sẽ xuất hiện trong trang Quản lý báo cáo của Thủ thư được chỉ định.</p>
      <form className="reports-assignment-form" onSubmit={(event) => void createReportRequest(event)}>
        <label>Thủ thư được giao<select required value={requestLibrarianId} onChange={(event) => setRequestLibrarianId(event.target.value)}><option value="">Chọn Thủ thư</option>{librarians.map((librarian) => <option value={librarian.id} key={librarian.id}>{librarian.fullName}</option>)}</select></label>
        <label>Mẫu / loại báo cáo<select required value={requestTemplateId} onChange={(event) => setRequestTemplateId(event.target.value)}><option value="">Chọn mẫu báo cáo</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name} · {reportTypeLabel(template.reportType)}</option>)}</select></label>
        <label>Tên yêu cầu (không bắt buộc)<input value={requestName} onChange={(event) => setRequestName(event.target.value)} placeholder={selectedRequestTemplate?.name ?? 'Ví dụ: Báo cáo hoạt động tháng 10'}/></label>
        <label className="reports-assignment-calendar-field">Kỳ báo cáo<AnimatedCalendar
          mode="range"
          value={requestPeriodStart && requestPeriodEnd ? [dateFromInput(requestPeriodStart), dateFromInput(requestPeriodEnd)] : requestPeriodStart ? [dateFromInput(requestPeriodStart)] : []}
          onChange={(dates) => {
            setRequestPeriodStart(dates[0] ? dateToInput(dates[0]) : '');
            setRequestPeriodEnd(dates[1] ? dateToInput(dates[1]) : '');
          }}
          placeholder="Chọn ngày bắt đầu và kết thúc"
          ariaLabel="Chọn kỳ báo cáo"
        /></label>
        <div className="reports-assignment-form-actions"><button type="button" className="reports-button secondary" onClick={() => setRequestFormOpen(false)} disabled={requestBusy}>Hủy</button><button type="submit" className="reports-button primary" disabled={requestBusy || !requestPeriodStart || !requestPeriodEnd || !librarians.length || !templates.length}>{requestBusy ? <LoaderCircle className="reports-spin" size={16}/> : <Plus size={16}/>} Giao yêu cầu</button></div>
      </form>
      {(!librarians.length || !templates.length) && <p className="reports-assignment-empty-hint">{!librarians.length ? 'Không tìm thấy Thủ thư đang hoạt động để giao việc.' : 'Chưa có mẫu báo cáo đang bật để giao.'}</p>}
    </section>}
    {activeSection === 'assignments' && <section className="reports-panel reports-assignment-panel">
      <div className="reports-panel-title admin-assignment-panel-heading"><div><span className="admin-report-section-kicker">01 · BÁO CÁO ĐƯỢC ADMIN GIAO</span><h2>Theo dõi yêu cầu đã phân công</h2><p>Quản lý hạn nộp, tiến độ và kết quả của từng yêu cầu báo cáo.</p></div><span className="reports-assignment-count"><ClipboardList size={15}/>{assignmentCounts.waiting + assignmentCounts.review} cần xử lý</span></div>
      <div className="admin-assignment-filters" role="group" aria-label="Lọc yêu cầu báo cáo">
        {([
          ['all', 'Tất cả', assignmentCounts.all],
          ['waiting', 'Chờ gửi', assignmentCounts.waiting],
          ['review', 'Chờ duyệt', assignmentCounts.review],
          ['approved', 'Đã duyệt', assignmentCounts.approved],
        ] as const).map(([filter, label, count]) => (
          <button key={filter} type="button" className={assignmentFilter === filter ? 'active' : ''} aria-pressed={assignmentFilter === filter} onClick={() => setAssignmentFilter(filter)}>
            {label}<span>{count}</span>
          </button>
        ))}
      </div>
      {requestError ? <div className="reports-error" role="alert"><AlertCircle size={17}/><span>{requestError}</span><button type="button" onClick={() => void loadAssignmentData()}>Thử lại</button></div>
         : visibleRequests.length ? <div className="reports-table-wrap reports-assignment-table-wrap"><table className="reports-table"><thead><tr><th>Thủ thư phụ trách</th><th>Báo cáo</th><th>Kỳ báo cáo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleRequests.map((request) => {
          const approved = request.lastReportStatus === 'Approved';
          const submitted = request.status === 'Submitted';
          const rejected = request.lastReportStatus === 'Rejected';
          return <tr key={request.id}>
            <td><strong>{request.librarianName}</strong><small>Thủ thư phụ trách</small></td>
            <td><strong>{request.name || request.templateName}</strong><small>{reportTypeLabel(request.reportType)} · {request.templateName}</small>{request.lastReviewComment && rejected && <small className="admin-assignment-feedback"><strong>Phản hồi:</strong> {request.lastReviewComment}</small>}</td>
            <td><strong>{date(request.periodStart)} – {date(requestedEndDate(request.periodEnd))}</strong><small>Kỳ báo cáo</small></td>
            <td>{approved ? <span className="reports-assignment-status is-approved"><BadgeCheck size={13}/>Đã duyệt</span> : submitted ? <span className="reports-assignment-status is-review"><Clock3 size={13}/>{rejected ? 'Cần chỉnh sửa' : 'Chờ duyệt'}</span> : <span className={`reports-assignment-status ${rejected ? 'is-rejected' : 'is-waiting'}`}><Clock3 size={13}/>{rejected ? 'Cần nộp lại' : 'Chờ gửi'}</span>}</td>
            <td>{request.reportId ? <Link className="reports-assignment-link" to={`/admin/reports/${request.reportId}`}><Eye size={15}/> Mở báo cáo</Link> : <span className="reports-assignment-date">Giao {date(request.createdAt)}</span>}</td>
          </tr>;
        })}</tbody></table></div>: <div className="reports-assignment-empty"><ClipboardList size={22}/><strong>{assignedRequests.length ? 'Không có yêu cầu trong trạng thái này' : 'Chưa có yêu cầu báo cáo'}</strong><span>{assignedRequests.length ? 'Chọn một trạng thái khác để xem thêm yêu cầu.' : 'Tạo yêu cầu để giao báo cáo cho Thủ thư và theo dõi tiến độ tại đây.'}</span></div>}
    </section>}
    {sectionCards.length > 0 && <section className={`reports-kpis reports-kpis-section${activeSection === 'finance' ? ' reports-finance-kpis' : ''}`} aria-label="Chỉ số báo cáo">{loading && !summary ? Array.from({ length: 3 }, (_, i) => <div className="reports-card skeleton" key={i}/>) : (activeSection === 'finance' ? financeCards : sectionCards).map(({ label, value, note, icon: Icon, tone }) => <article className="reports-card" key={label}><span className={`reports-icon ${tone}`}><Icon size={19}/></span><div className="reports-card-value">{value}</div><h2>{label}</h2><p>{note}</p></article>)}</section>}
    {activeSection === 'assignments' && <section className="reports-panel reports-self-submissions">
      <div className="reports-panel-title admin-assignment-panel-heading">
        <div><span className="admin-report-section-kicker">02 · THỦ THƯ CHỦ ĐỘNG GỬI</span><h2>Báo cáo gửi không cần phân công</h2><p>Thủ thư tự tạo và gửi báo cáo; các báo cáo này được tổng hợp riêng tại đây.</p></div>
        <span className="reports-assignment-count"><Send size={15}/>{selfSubmittedReports.length} báo cáo</span>
      </div>
      {requestError ? <div className="reports-error" role="alert"><AlertCircle size={17}/><span>{requestError}</span><button type="button" onClick={() => void loadAssignmentData()}>Thử lại</button></div>
         : selfSubmittedReports.length ? <div className="reports-table-wrap reports-assignment-table-wrap"><table className="reports-table"><thead><tr><th>Thủ thư</th><th>Báo cáo</th><th>Kỳ báo cáo</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{selfSubmittedReports.map((report) => {
          const approved = report.lastReportStatus === 'Approved';
          const rejected = report.lastReportStatus === 'Rejected';
          return <tr key={report.id}>
            <td><strong>{report.librarianName}</strong><small>Thủ thư tự gửi</small></td>
            <td><strong>{report.name || report.templateName}</strong><small>{reportTypeLabel(report.reportType)} · {report.templateName}</small></td>
            <td><strong>{date(report.periodStart)} – {date(requestedEndDate(report.periodEnd))}</strong><small>Kỳ báo cáo</small></td>
            <td>{approved ? <span className="reports-assignment-status is-approved"><BadgeCheck size={13}/>Đã duyệt</span> : rejected ? <span className="reports-assignment-status is-rejected"><AlertCircle size={13}/>Cần chỉnh sửa</span> : <span className="reports-assignment-status is-review"><Clock3 size={13}/>Chờ duyệt</span>}</td>
            <td><Link className="reports-assignment-link" to={`/admin/reports/${report.reportId}`}><Eye size={15}/> Mở báo cáo</Link></td>
          </tr>;
        })}</tbody></table></div>: <div className="reports-assignment-empty"><Send size={22}/><strong>Chưa có báo cáo tự gửi</strong><span>Báo cáo Thủ thư gửi chủ động sẽ hiển thị riêng tại đây.</span></div>}
    </section>}
    {activeSection === 'finance' && <section className="reports-panel reports-finance-panel">
      <div className="reports-panel-title"><div><span>CHI TIẾT PHÍ PHẠT</span><h2>Các khoản phạt gần đây</h2></div><div className="reports-finance-heading-meta"><span>{number(financeFines.length)} khoản ghi nhận</span><button type="button" onClick={() => void loadFinanceFines()} disabled={financeLoading}>{financeLoading ? <LoaderCircle className="reports-spin" size={15}/> : 'Làm mới'}</button></div></div>
      {financeError ? <div className="reports-error" role="alert"><AlertCircle size={17}/><span>{financeError}</span><button type="button" onClick={() => void loadFinanceFines()}>Thử lại</button></div>
        : financeLoading && !financeFines.length ? <div className="reports-finance-loading"><LoaderCircle className="reports-spin" size={18}/> Đang tải chi tiết phí phạt…</div>
          : financeFines.length ? <div className="reports-table-wrap"><table className="reports-table reports-finance-table"><thead><tr><th>Khoản phạt</th><th>Độc giả</th><th>Sách</th><th>Lý do</th><th className="num">Số tiền</th><th>Thời điểm</th><th>Phương thức</th><th>Trạng thái</th></tr></thead><tbody>{financeFines.slice(0, 8).map((fine) => <tr key={fine.id}><td><strong>{fine.code}</strong><small>Ghi nhận {date(fine.createdAt)}</small></td><td>{fine.readerName}</td><td><strong>{fine.bookTitle}</strong><small>{fine.barcode}</small></td><td className="reports-finance-reason">{fine.reason}</td><td className="num reports-finance-amount">{money(fine.amount)}</td><td>{fine.paidAt ? <><span>{date(fine.paidAt)}</span><small>Đã thu</small></> : <span className="reports-finance-missing">—</span>}</td><td>{fine.paymentMethod === 'Cash' ? 'Tiền mặt' : fine.paymentMethod === 'PayOS' ? 'PayOS' : fine.status === 'Paid' ? 'Chưa phân loại' : '—'}{fine.paymentReference && <small>{fine.paymentReference}</small>}</td><td><span className={`status-pill ${fine.reconciliationRequired ? 'pending' : fine.status === 'Paid' ? 'approved' : fine.status === 'Waived' ? 'unapproved' : 'pending'}`}>{fine.reconciliationRequired ? 'Cần đối soát' : fine.status === 'Paid' ? 'Đã thanh toán' : fine.status === 'Waived' ? 'Đã miễn' : 'Chưa thanh toán'}</span></td></tr>)}</tbody></table></div>
            : <div className="reports-finance-empty"><CircleDollarSign size={20}/><strong>Chưa có khoản phạt</strong><span>Khi Thủ thư ghi nhận phí phạt, chi tiết sẽ xuất hiện tại đây.</span></div>}
    </section>}
    {activeSection === 'activity' && <section className="reports-panel reports-standard-table-panel"><div className="reports-panel-title"><div><span>HOẠT ĐỘNG THƯ VIỆN</span><h2>Lượt mượn theo nhóm sách</h2><p>Thống kê theo khoảng ngày đã chọn.</p></div><span className="live-badge"><i/> Dữ liệu trực tiếp</span></div>
      {loading && !summary ? <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Danh mục sách</th><th className="num">Lượt mượn</th><th className="num">Tỷ trọng</th></tr></thead><tbody><tr><td colSpan={3} className="reports-table-empty"><LoaderCircle className="reports-spin" size={18}/> Đang tải dữ liệu hoạt động…</td></tr></tbody></table></div>
        : categories.length ? <div className="reports-table-wrap"><table className="reports-table reports-activity-table"><thead><tr><th>Danh mục sách</th><th className="num">Lượt mượn</th><th className="num">Tỷ trọng</th></tr></thead><tbody>{categories.map((item, index) => <tr key={item.category}><td><span className="reports-table-rank">{String(index + 1).padStart(2, '0')}</span><strong>{item.category}</strong></td><td className="num">{number(item.count)}</td><td className="num"><span className="reports-percent-pill">{item.percent}%</span></td></tr>)}</tbody><tfoot><tr><th>Tổng cộng trong danh sách</th><th className="num">{number(categories.reduce((sum, item) => sum + item.count, 0))}</th><th className="num">100%</th></tr></tfoot></table></div>
          : <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Danh mục sách</th><th className="num">Lượt mượn</th><th className="num">Tỷ trọng</th></tr></thead><tbody><tr><td colSpan={3} className="reports-table-empty"><ChartNoAxesCombined size={20}/> Chưa có dữ liệu mượn theo nhóm sách trong kỳ.</td></tr></tbody></table></div>}
    </section>}
    {activeSection === 'collection' && <section className="reports-panel reports-tab-empty"><ChartNoAxesCombined size={22}/><h2>Chưa có thống kê kho sách</h2><p>Hiện chưa có dữ liệu tồn kho được cung cấp cho trang báo cáo này.</p></section>}
    {activeSection === 'periodic' && <section className="reports-panel reports-standard-table-panel"><div className="reports-panel-title"><div><span>TỔNG HỢP THEO KỲ</span><h2>Báo cáo định kỳ</h2><p>Các kỳ báo cáo được chuẩn hóa theo cùng một bảng theo dõi.</p></div></div><div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Kỳ báo cáo</th><th>Loại báo cáo</th><th>Người gửi</th><th>Trạng thái</th><th>Ngày cập nhật</th><th>Thao tác</th></tr></thead><tbody><tr><td colSpan={6} className="reports-table-empty"><ChartNoAxesCombined size={20}/> Chưa có dữ liệu báo cáo định kỳ.</td></tr></tbody></table></div></section>}
    {activeSection === 'library' && <section className="reports-panel report-list-panel"><div className="reports-panel-title"><div><span>GỬI TỪ THỦ THƯ</span><h2>Danh sách báo cáo</h2></div></div><div className="reports-filters"><label className="reports-search"><Search size={17}/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm tên hoặc mã báo cáo" aria-label="Tìm báo cáo"/></label><label className="reports-select"><CalendarDays size={15}/><input type="month" value={query.get('month') ?? ''} onChange={(event) => updateQuery('month', event.target.value)} aria-label="Lọc theo tháng"/></label><label className="reports-select"><Filter size={15}/><select value={query.get('status') ?? ''} onChange={(event) => updateQuery('status', event.target.value)} aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="Ready">Sẵn sàng</option><option value="Processing">Đang xử lý</option><option value="Error">Lỗi</option></select></label><label className="reports-select"><FileSpreadsheet size={15}/><select value={query.get('format') ?? ''} onChange={(event) => updateQuery('format', event.target.value)} aria-label="Lọc định dạng"><option value="">Mọi định dạng</option><option value="CSV">CSV</option><option value="PDF">PDF</option></select></label></div>
      {selected.length > 0 && <div className="reports-bulk"><span>Đã chọn {selected.length} báo cáo</span><div><button type="button" onClick={() => void exportSelected()}><ArrowDownToLine size={15}/> Tải CSV</button><button type="button" onClick={() => setConfirmDelete(selected)}><Trash2 size={15}/> Xóa đã chọn</button></div></div>}
      <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả báo cáo" checked={!!reports?.items.length && selected.length === reports.items.length} onChange={(event) => setSelected(event.target.checked ? reports?.items.map((x) => x.id) ?? [] : [])}/></th><th>Báo cáo</th><th>Ngày gửi</th><th>Định dạng</th><th>Trạng thái duyệt</th><th>Hành động</th></tr></thead><tbody>{loading && !reports ? <tr><td colSpan={6} className="reports-table-empty"><LoaderCircle className="reports-spin" size={20}/> Đang tải báo cáo…</td></tr> : reports?.items.length ? reports.items.map((item) => <tr key={item.id} className="report-row-clickable" onClick={() => navigate(`/admin/reports/${item.id}`)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Chọn báo cáo ${item.code}`} checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/></td><td><Link to={`/admin/reports/${item.id}`} className="report-title-link"><strong>{item.name}</strong></Link><small>{item.code} · {item.submitter}</small></td><td>{date(item.createdAt)}</td><td><span className="format-pill">{item.format}</span></td><td><span className={`status-pill ${item.isApproved ? 'approved' : item.isRejected || item.status === 'Rejected' ? 'rejected' : 'unapproved'}`}>{item.isApproved ? 'Đã duyệt' : item.isRejected || item.status === 'Rejected' ? 'Yêu cầu chỉnh sửa' : 'Chờ duyệt'}</span><small className={!item.isApproved && !item.isRejected && item.status !== 'Rejected' ? 'report-delivery-note' : ''}>{item.isApproved ? 'Admin đã duyệt chính thức' : item.isRejected || item.status === 'Rejected' ? 'Cần Thủ thư cập nhật' : <><span>Đã gửi</span> · {item.isViewed ? 'Đã xem' : 'Chờ xem'}</>}</small></td><td className="report-row-actions" onClick={(e) => e.stopPropagation()}><Link className="report-action-view" to={`/admin/reports/${item.id}`} aria-label={`Xem ${item.code}`} title="Xem chi tiết báo cáo"><Eye size={16}/></Link><button className="report-action-download" type="button" aria-label={`Tải ${item.code} dưới dạng CSV`} title="Tải báo cáo" onClick={() => void exportCsv(item.id)}><ArrowDownToLine size={16}/></button><button className="report-action-delete" type="button" aria-label={`Xóa ${item.code}`} title="Xóa báo cáo" onClick={() => setConfirmDelete([item.id])}><Trash2 size={16}/></button></td></tr>) : <tr><td colSpan={6} className="reports-table-empty">Chưa có báo cáo nào phù hợp với bộ lọc.</td></tr>}</tbody></table></div>
      <div className="reports-pagination"><span>Hiển thị {reports?.totalCount ? (page - 1) * (reports?.pageSize ?? 8) + 1 : 0}-{Math.min(page * (reports?.pageSize ?? 8), reports?.totalCount ?? 0)} trong {number(reports?.totalCount ?? 0)} báo cáo</span><div><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => updateQuery('page', String(page - 1))}><ChevronLeft size={16}/></button><span>Trang {page} / {reports?.totalPages ?? 1}</span><button type="button" aria-label="Trang sau" disabled={page >= (reports?.totalPages ?? 1)} onClick={() => updateQuery('page', String(page + 1))}><ChevronRight size={16}/></button></div></div>
    </section>}
    <footer className="reports-footer"><span>SmartLibrary · Dữ liệu trực tiếp</span><span>Múi giờ UTC+07:00 · Cập nhật {summary ? date(new Date().toISOString()) : '—'}</span></footer>
    {confirmDelete && <div className="reports-modal-backdrop" role="presentation"><section className="reports-confirm" role="alertdialog" aria-modal="true" aria-labelledby="reports-confirm-title"><span><Trash2 size={20}/></span><h2 id="reports-confirm-title">Xóa báo cáo?</h2><p>Thao tác này sẽ xóa {confirmDelete.length} báo cáo đã chọn. Bạn có thể xác nhận để tiếp tục.</p><div><button type="button" onClick={() => setConfirmDelete(null)} disabled={busy}>Hủy</button><button type="button" className="danger" onClick={() => void deleteReports()} disabled={busy}>{busy ? 'Đang xóa…' : 'Xóa báo cáo'}</button></div></section></div>}
    {toast && <div className="reports-toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">×</button></div>}
  </div>;
};

export default AdminReportsPage;
