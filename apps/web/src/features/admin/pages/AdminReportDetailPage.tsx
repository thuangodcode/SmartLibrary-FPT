import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCheck, CheckCircle2, Clock3, FileSpreadsheet, LoaderCircle, MessageSquareText, Send } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './AdminReportDetailPage.css';

interface Envelope<T> { success?: boolean; data?: T; error?: string }
interface Review { action: string; comment: string | null; reviewer: string; createdAt: string }
interface ReportRow { date: string; category: string; borrowed: number; returned: number; overdue: number; returnedCount: number; notes: string | null }
interface Report { id: string; code: string; name: string; submitter: string; templateName: string; createdAt: string; periodStart: string; periodEnd: string; format: string; status: string; isViewed: boolean; isApproved: boolean; rows: ReportRow[]; reviews: Review[] }
const fmtDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));

const AdminReportDetailPage: React.FC = () => {
  const { id } = useParams(); const token = useAuthStore((state) => state.accessToken);
  const [report, setReport] = useState<Report | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [comment, setComment] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<string | null>(null);
  const total = useMemo(() => report?.rows.reduce((sum, row) => ({ borrowed: sum.borrowed + row.borrowed, returned: sum.returned + row.returned, overdue: sum.overdue + row.overdue, returnedCount: sum.returnedCount + row.returnedCount }), { borrowed: 0, returned: 0, overdue: 0, returnedCount: 0 }) ?? { borrowed: 0, returned: 0, overdue: 0, returnedCount: 0 }, [report]);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (!token || !id) { setError('Thiếu phiên đăng nhập hoặc mã báo cáo.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try { const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal }); const result = await parseApiResponse<Envelope<Report>>(response); if (!response.ok || !result?.success || !result.data) throw new Error(result?.error || 'Không tải được báo cáo.'); setReport(result.data); }
    catch (caught) { if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Không tải được báo cáo.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [id, token]);
  useEffect(() => { const controller = new AbortController(); const timer = window.setTimeout(() => { void load(controller.signal); }, 0); return () => { window.clearTimeout(timer); controller.abort(); }; }, [load]);
  const update = async (payload: { isViewed?: boolean; isApproved?: boolean; comment?: string }) => {
    if (!token || !id) return; setBusy(true);
    try { const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); if (!response.ok) { const result = await parseApiResponse<Envelope<never>>(response); throw new Error(result?.error || 'Không lưu được phản hồi.'); } setNotice('Đã cập nhật báo cáo.'); setComment(''); await load(); }
    catch (caught) { setNotice(caught instanceof Error ? caught.message : 'Không lưu được phản hồi.'); } finally { setBusy(false); }
  };
  const download = async () => {
    if (!token || !id) return; const response = await fetch(`${API_BASE_URL}/api/admin/reports/${id}/export?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) { const result = await parseApiResponse<Envelope<never>>(response); setNotice(result?.error || 'Không thể xuất CSV.'); return; }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(await response.blob()); anchor.download = `${report?.code ?? 'bao-cao'}.csv`; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  return <div className="report-detail-page"><div className="report-detail-breadcrumb"><Link to="/admin/reports"><ArrowLeft size={15}/> Quay lại</Link><span>/</span><span>Thống kê &amp; báo cáo</span><span>/</span><strong>Chi tiết</strong></div><header className="report-detail-heading"><div><p>THƯ VIỆN BÁO CÁO</p><h1>Chi tiết báo cáo</h1><span>Xem snapshot được lưu tại thời điểm gửi báo cáo.</span></div><div><button type="button" onClick={() => void download()}><FileSpreadsheet size={16}/> Xuất CSV</button><span className="report-pdf-unavailable">PDF · Chưa có dữ liệu</span></div></header>
    {error && <div className="report-detail-error"><AlertCircle size={17}/>{error}<button type="button" onClick={() => void load()}>Thử lại</button></div>}
    {loading && !report ? <div className="report-detail-loading"><LoaderCircle size={20}/> Đang tải báo cáo…</div> : report && <>
      <section className="report-meta-card"><div><span>MÃ BÁO CÁO</span><strong>{report.code}</strong></div><div><span>TÊN BÁO CÁO</span><strong>{report.name}</strong></div><div><span>NGƯỜI GỬI</span><strong>{report.submitter}</strong></div><div><span>NGÀY GỬI</span><strong>{fmtDate(report.createdAt)}</strong></div><div><span>KỲ BÁO CÁO</span><strong>{fmtDate(report.periodStart)} – {fmtDate(report.periodEnd)}</strong></div><div><span>MẪU ĐÃ DÙNG</span><strong>{report.templateName}</strong></div><div><span>TRẠNG THÁI</span><strong><i className={`detail-status ${report.isApproved ? 'approved' : report.isViewed ? 'viewed' : ''}`}/>{report.isApproved ? 'Đã duyệt' : report.isViewed ? 'Đã xem' : report.status === 'Ready' ? 'Sẵn sàng' : report.status}</strong></div><div><span>ĐỊNH DẠNG</span><strong>{report.format}</strong></div></section>
      <section className="report-detail-table-card"><div className="report-detail-section-title"><div><span>DỮ LIỆU SNAPSHOT</span><h2>Báo cáo theo ngày</h2></div><span>{report.rows.length} dòng</span></div>{report.rows.length ? <div className="report-detail-table-wrap"><table><thead><tr><th>Ngày</th><th>Nhóm sách</th><th>Mượn</th><th>Trả</th><th>Quá hạn</th><th>Đã trả</th><th>Ghi chú</th></tr></thead><tbody>{report.rows.map((row, index) => <tr key={`${row.date}-${row.category}-${index}`}><td>{fmtDate(row.date)}</td><td>{row.category}</td><td>{row.borrowed.toLocaleString('vi-VN')}</td><td>{row.returned.toLocaleString('vi-VN')}</td><td>{row.overdue.toLocaleString('vi-VN')}</td><td>{row.returnedCount.toLocaleString('vi-VN')}</td><td>{row.notes || '—'}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>Tổng cộng</th><th>{total.borrowed.toLocaleString('vi-VN')}</th><th>{total.returned.toLocaleString('vi-VN')}</th><th>{total.overdue.toLocaleString('vi-VN')}</th><th>{total.returnedCount.toLocaleString('vi-VN')}</th><th>—</th></tr></tfoot></table></div> : <div className="report-detail-empty"><Clock3 size={18}/> Snapshot này chưa có dữ liệu theo ngày.</div>}</section>
      <section className="report-feedback-card"><div className="report-detail-section-title"><div><span>PHẢN HỒI</span><h2>Ghi nhận xét cho thủ thư</h2></div><MessageSquareText size={19}/></div><div className="report-feedback-actions"><button type="button" disabled={busy || report.isViewed} onClick={() => void update({ isViewed: true })}><CheckCheck size={15}/>{report.isViewed ? 'Đã xem' : 'Đánh dấu đã xem'}</button><button type="button" className="approve" disabled={busy || report.isApproved} onClick={() => void update({ isApproved: true })}><CheckCircle2 size={15}/>{report.isApproved ? 'Đã duyệt' : 'Duyệt báo cáo'}</button></div><form onSubmit={(event) => { event.preventDefault(); if (comment.trim()) void update({ comment: comment.trim() }); }}><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Nhập nhận xét gửi thủ thư…" aria-label="Nhận xét cho thủ thư"/><button type="submit" disabled={busy || !comment.trim()}><Send size={15}/> Gửi nhận xét</button></form>{report.reviews.length > 0 && <div className="report-review-list">{report.reviews.map((review, index) => <article key={`${review.createdAt}-${index}`}><div><strong>{review.reviewer}</strong><span>{fmtDate(review.createdAt)} · {review.action === 'Approved' ? 'Đã duyệt' : review.action === 'Viewed' ? 'Đã xem' : 'Nhận xét'}</span></div><p>{review.comment || (review.action === 'Approved' ? 'Đã duyệt báo cáo.' : 'Đã xem báo cáo.')}</p></article>)}</div>}</section>
      <footer className="report-detail-footer"><span>Múi giờ UTC+07:00</span><span>Cập nhật lần cuối: {fmtDate(report.createdAt)}</span><Link to="/admin/reports/templates">Quản lý mẫu báo cáo</Link></footer>
    </>}{notice && <div className="report-detail-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice(null)}>×</button></div>}</div>;
};
export default AdminReportDetailPage;
