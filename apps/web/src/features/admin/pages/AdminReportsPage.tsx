import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownToLine, BookOpen, CalendarDays, ChartNoAxesCombined, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, Eye, FileSpreadsheet, Filter, LoaderCircle, Search, Trash2, UsersRound } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminReportsPage.css';

interface ApiEnvelope<T> { success?: boolean; data?: T; error?: string }
interface Summary { from: string; to: string; borrowed: number; returned: number; returnedOnTimeRate: number; borrowedChangePercent: number; returnedChangePercent: number; fineRevenue: number; fineTransactions: number; fineChangePercent: number; libraryVisits: number | null; libraryVisitsAvailable: boolean }
interface CategoryStat { category: string; count: number; percent: number }
interface ReportItem { id: string; code: string; name: string; submitter: string; createdAt: string; format: string; status: string; isViewed: boolean; isApproved: boolean }
interface ReportList { items: ReportItem[]; totalCount: number; page: number; pageSize: number; totalPages: number }

const number = (value: number) => value.toLocaleString('vi-VN');
const money = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const date = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));

const AdminReportsPage: React.FC = () => {
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

  const query = useMemo(() => new URLSearchParams(params), [params]);
  const activeTab = query.get('tab') ?? 'activity';
  const page = Math.max(1, Number(query.get('page') ?? 1));

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token) { setError('Vui lòng đăng nhập Admin để xem báo cáo.'); setLoading(false); return; }
    setLoading(true); setError(null);
    const headers = { Authorization: `Bearer ${token}` };
    const qs = new URLSearchParams({ page: String(page), pageSize: '8' });
    for (const key of ['search', 'month', 'status', 'format']) { const value = query.get(key); if (value) qs.set(key, value); }
    try {
      const [summaryResponse, categoryResponse, reportsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/admin/reports/summary`, { headers, signal }),
        fetch(`${API_BASE_URL}/api/admin/reports/summary/borrow-by-category`, { headers, signal }),
        fetch(`${API_BASE_URL}/api/admin/reports?${qs}`, { headers, signal }),
      ]);
      if ([summaryResponse, categoryResponse, reportsResponse].some((response) => response.status === 404)) {
        throw new Error('API đang chạy phiên bản chưa có module báo cáo. Hãy khởi động lại SmartLibrary API mới và áp dụng migration supabase/migrations/00007_reports.sql.');
      }
      const [s, c, r] = await Promise.all([
        parseApiResponse<ApiEnvelope<Summary>>(summaryResponse),
        parseApiResponse<ApiEnvelope<CategoryStat[]>>(categoryResponse),
        parseApiResponse<ApiEnvelope<ReportList>>(reportsResponse),
      ]);
      if (!summaryResponse.ok || !s?.success || !s.data) throw new Error(s?.error || `Không tải được thống kê (HTTP ${summaryResponse.status}).`);
      if (!categoryResponse.ok || !c?.success) throw new Error(c?.error || 'Không tải được thống kê nhóm sách.');
      if (!reportsResponse.ok || !r?.success || !r.data) throw new Error(r?.error || 'Không tải được danh sách báo cáo.');
      setSummary(s.data); setCategories(c.data ?? []); setReports(r.data);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : 'Đã xảy ra lỗi khi tải báo cáo.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [page, query, token]);

  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void load(controller.signal); }, 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  useEffect(() => { const timer = window.setTimeout(() => { setParams((current) => { const next = new URLSearchParams(current); if (searchInput.trim()) next.set('search', searchInput.trim()); else next.delete('search'); next.delete('page'); return next; }); }, 350); return () => window.clearTimeout(timer); }, [searchInput, setParams]);

  const updateQuery = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); return next; });

  const exportCsv = async (reportId?: string) => {
    try {
      const url = reportId ? `${API_BASE_URL}/api/admin/reports/${reportId}/export?format=csv` : `${API_BASE_URL}/api/admin/reports/export?format=csv`;
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
  ] : [];

  return <div className="reports-page">
    <div className="reports-heading"><div><p className="reports-eyebrow">QUẢN TRỊ HỆ THỐNG</p><h1>Thống kê &amp; báo cáo</h1><p>Xem báo cáo tổng hợp theo thời gian, bộ phận và đối tượng phục vụ.</p></div><div className="reports-actions"><button type="button" className="reports-button secondary" onClick={() => void exportCsv()}><FileSpreadsheet size={16}/> Xuất CSV</button><span className="reports-button secondary" title="PDF export is unavailable because no real PDF API exists">PDF · Chưa có dữ liệu</span></div></div>
    {error && <div className="reports-error" role="alert"><AlertCircle size={18}/><span>{error}</span><button onClick={() => void load()} type="button">Thử lại</button></div>}
    <section className="reports-kpis" aria-label="Chỉ số tổng hợp">{loading && !summary ? Array.from({ length: 4 }, (_, i) => <div className="reports-card skeleton" key={i}/>) : cards.map(({ label, value, note, icon: Icon, tone }) => <article className="reports-card" key={label}><span className={`reports-icon ${tone}`}><Icon size={19}/></span><div className="reports-card-value">{value}</div><h2>{label}</h2><p>{note}</p></article>)}</section>
    <nav className="reports-tabs" aria-label="Nhóm báo cáo">{[['activity', 'Báo cáo hoạt động'], ['finance', 'Tài chính'], ['collection', 'Kho sách'], ['periodic', 'Báo cáo định kỳ']].map(([id, label]) => <button type="button" className={activeTab === id ? 'active' : ''} key={id} onClick={() => updateQuery('tab', id)}>{label}</button>)}</nav>
    {activeTab === 'activity' ? <section className="reports-panel category-panel"><div className="reports-panel-title"><div><span>HOẠT ĐỘNG THƯ VIỆN</span><h2>Mượn theo nhóm sách</h2></div><span className="live-badge"><i/> Dữ liệu trực tiếp</span></div>{loading && !summary ? <p className="reports-muted">Đang tải thống kê…</p> : categories.length ? <div className="category-list">{categories.map((item) => <div className="category-row" key={item.category}><div className="category-copy"><strong>{item.category}</strong><span>{number(item.count)} lượt mượn · {item.percent}%</span></div><div className="category-track"><div style={{ width: `${item.percent}%` }}/></div></div>)}</div> : <div className="reports-empty"><ChartNoAxesCombined size={20}/><span>Chưa có dữ liệu mượn theo nhóm sách trong kỳ.</span></div>}</section> : <section className="reports-panel reports-tab-empty"><ChartNoAxesCombined size={22}/><h2>{activeTab === 'finance' ? 'Tài chính' : activeTab === 'collection' ? 'Kho sách' : 'Báo cáo định kỳ'}</h2><p>Chưa có dữ liệu cho mục này.</p></section>}
    <section className="reports-panel report-list-panel"><div className="reports-panel-title"><div><span>GỬI TỪ THỦ THƯ</span><h2>Thư viện báo cáo</h2></div><Link to="/admin/reports/templates">Quản lý mẫu báo cáo <ChevronRight size={15}/></Link></div><div className="reports-filters"><label className="reports-search"><Search size={17}/><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Tìm tên hoặc mã báo cáo" aria-label="Tìm báo cáo"/></label><label className="reports-select"><CalendarDays size={15}/><input type="month" value={query.get('month') ?? ''} onChange={(event) => updateQuery('month', event.target.value)} aria-label="Lọc theo tháng"/></label><label className="reports-select"><Filter size={15}/><select value={query.get('status') ?? ''} onChange={(event) => updateQuery('status', event.target.value)} aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option><option value="Ready">Sẵn sàng</option><option value="Processing">Đang xử lý</option><option value="Error">Lỗi</option></select></label><label className="reports-select"><FileSpreadsheet size={15}/><select value={query.get('format') ?? ''} onChange={(event) => updateQuery('format', event.target.value)} aria-label="Lọc định dạng"><option value="">Mọi định dạng</option><option value="CSV">CSV</option><option value="PDF">PDF</option></select></label></div>
      {selected.length > 0 && <div className="reports-bulk"><span>Đã chọn {selected.length} báo cáo</span><div><button type="button" onClick={() => void exportSelected()}><ArrowDownToLine size={15}/> Tải CSV</button><button type="button" onClick={() => setConfirmDelete(selected)}><Trash2 size={15}/> Xóa đã chọn</button></div></div>}
      <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th><input type="checkbox" aria-label="Chọn tất cả báo cáo" checked={!!reports?.items.length && selected.length === reports.items.length} onChange={(event) => setSelected(event.target.checked ? reports?.items.map((x) => x.id) ?? [] : [])}/></th><th>Báo cáo</th><th>Ngày gửi</th><th>Định dạng</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>{loading && !reports ? <tr><td colSpan={6} className="reports-table-empty"><LoaderCircle className="reports-spin" size={20}/> Đang tải báo cáo…</td></tr> : reports?.items.length ? reports.items.map((item) => <tr key={item.id} className="report-row-clickable" onClick={() => navigate(`/admin/reports/${item.id}`)}><td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Chọn báo cáo ${item.code}`} checked={selected.includes(item.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/></td><td><Link to={`/admin/reports/${item.id}`} className="report-title-link"><strong>{item.name}</strong></Link><small>{item.code} · {item.submitter}</small></td><td>{date(item.createdAt)}</td><td><span className="format-pill">{item.format}</span></td><td><span className={`status-pill ${item.status.toLowerCase()}`}>{item.status === 'Ready' ? 'Sẵn sàng' : item.status === 'Processing' ? 'Đang xử lý' : item.status}</span></td><td className="report-row-actions" onClick={(e) => e.stopPropagation()}><Link to={`/admin/reports/${item.id}`} aria-label={`Xem ${item.code}`} title="Xem chi tiết &amp; mẫu báo cáo"><Eye size={16}/></Link><button type="button" aria-label={`Tải ${item.code} dưới dạng CSV`} onClick={() => void exportCsv(item.id)}><ArrowDownToLine size={16}/></button><button type="button" aria-label={`Xóa ${item.code}`} onClick={() => setConfirmDelete([item.id])}><Trash2 size={16}/></button></td></tr>) : <tr><td colSpan={6} className="reports-table-empty">Chưa có báo cáo nào phù hợp với bộ lọc.</td></tr>}</tbody></table></div>
      <div className="reports-pagination"><span>Hiển thị {reports?.totalCount ? (page - 1) * (reports?.pageSize ?? 8) + 1 : 0}-{Math.min(page * (reports?.pageSize ?? 8), reports?.totalCount ?? 0)} trong {number(reports?.totalCount ?? 0)} báo cáo</span><div><button type="button" aria-label="Trang trước" disabled={page <= 1} onClick={() => updateQuery('page', String(page - 1))}><ChevronLeft size={16}/></button><span>Trang {page} / {reports?.totalPages ?? 1}</span><button type="button" aria-label="Trang sau" disabled={page >= (reports?.totalPages ?? 1)} onClick={() => updateQuery('page', String(page + 1))}><ChevronRight size={16}/></button></div></div>
    </section>
    <footer className="reports-footer"><span>SmartLibrary · Dữ liệu trực tiếp</span><span>Múi giờ UTC+07:00 · Cập nhật {summary ? date(new Date().toISOString()) : '—'}</span></footer>
    {confirmDelete && <div className="reports-modal-backdrop" role="presentation"><section className="reports-confirm" role="alertdialog" aria-modal="true" aria-labelledby="reports-confirm-title"><span><Trash2 size={20}/></span><h2 id="reports-confirm-title">Xóa báo cáo?</h2><p>Thao tác này sẽ xóa {confirmDelete.length} báo cáo đã chọn. Bạn có thể xác nhận để tiếp tục.</p><div><button type="button" onClick={() => setConfirmDelete(null)} disabled={busy}>Hủy</button><button type="button" className="danger" onClick={() => void deleteReports()} disabled={busy}>{busy ? 'Đang xóa…' : 'Xóa báo cáo'}</button></div></section></div>}
    {toast && <div className="reports-toast" role="status"><span>{toast}</span><button type="button" onClick={() => setToast(null)} aria-label="Đóng thông báo">×</button></div>}
  </div>;
};

export default AdminReportsPage;
