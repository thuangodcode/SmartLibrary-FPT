import { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, Clock3, LoaderCircle, Wallet } from 'lucide-react';
import HomeNavbar from '../../home/components/HomeNavbar';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import './HistoryPage.css';

interface LoanHistoryItem {
  id: string;
  bookTitle: string;
  barcode: string;
  status: string;
  borrowDate: string | null;
  dueDate: string | null;
  returnDate: string | null;
  renewalCount: number;
}

interface FineHistoryItem {
  id: string;
  bookTitle: string;
  barcode: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

interface HistoryData {
  loans: LoanHistoryItem[];
  fines: FineHistoryItem[];
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

type HistoryTab = 'loans' | 'fines';

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value))
  : '—';

const loanStatus: Record<string, string> = {
  Pending: 'Chờ xác nhận',
  Approved: 'Đã duyệt',
  Borrowed: 'Đang mượn',
  Overdue: 'Quá hạn',
  Returned: 'Đã trả',
  Rejected: 'Từ chối',
  Cancelled: 'Đã hủy',
};

const HistoryPage = () => {
  const token = useAuthStore((state) => state.accessToken);
  const [data, setData] = useState<HistoryData | null>(null);
  const [tab, setTab] = useState<HistoryTab>('loans');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/support/history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await parseApiResponse<ApiEnvelope<HistoryData>>(response);
        if (!response.ok || !result?.success || !result.data) {
          throw new Error(result?.error || 'Không thể tải lịch sử hoạt động.');
        }
        if (!cancelled) setData(result.data);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Không thể tải lịch sử hoạt động.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="annual-home history-page">
      <HomeNavbar />
      <main className="history-main">
        <header className="history-heading">
          <p>SMARTLIBRARY · TÀI KHOẢN</p>
          <h1>Lịch sử</h1>
          <span>Theo dõi mượn, trả, gia hạn, quá hạn và phí phạt của bạn.</span>
        </header>

        <div className="history-tabs" role="tablist" aria-label="Lịch sử hoạt động">
          <button className={tab === 'loans' ? 'is-active' : ''} onClick={() => setTab('loans')} role="tab" aria-selected={tab === 'loans'}>
            <BookOpen size={17} /> Mượn & trả <span>{data?.loans.length ?? 0}</span>
          </button>
          <button className={tab === 'fines' ? 'is-active' : ''} onClick={() => setTab('fines')} role="tab" aria-selected={tab === 'fines'}>
            <Wallet size={17} /> Phí phạt <span>{data?.fines.length ?? 0}</span>
          </button>
        </div>

        {error && <div className="history-alert" role="alert"><AlertCircle size={17} />{error}</div>}
        {loading ? (
          <div className="history-empty"><LoaderCircle className="history-spinner" size={22} /> Đang tải lịch sử...</div>
        ) : tab === 'loans' ? (
          <section className="history-list" aria-label="Lịch sử mượn trả">
            {data?.loans.length ? data.loans.map((loan) => (
              <article className="history-record" key={loan.id}>
                <div className="history-record-icon"><BookOpen size={19} /></div>
                <div className="history-record-main">
                  <strong>{loan.bookTitle}</strong>
                  <span>Mã bản sao: {loan.barcode}</span>
                  <div className="history-record-dates">
                    <span>Mượn: {formatDate(loan.borrowDate)}</span>
                    <span>Hạn trả: {formatDate(loan.dueDate)}</span>
                    <span>Đã trả: {formatDate(loan.returnDate)}</span>
                    <span>Gia hạn: {loan.renewalCount} lần</span>
                  </div>
                </div>
                <span className={`history-status history-status--${loan.status.toLowerCase()}`}>
                  {loan.status === 'Borrowed' && loan.dueDate && new Date(loan.dueDate) < new Date()
                    ? 'Quá hạn'
                    : loanStatus[loan.status] ?? loan.status}
                </span>
              </article>
            )) : <div className="history-empty"><Clock3 size={22} />Chưa có lịch sử mượn sách.</div>}
          </section>
        ) : (
          <section className="history-list" aria-label="Lịch sử phí phạt">
            {data?.fines.length ? data.fines.map((fine) => (
              <article className="history-record" key={fine.id}>
                <div className="history-record-icon history-record-icon--fine"><Wallet size={19} /></div>
                <div className="history-record-main">
                  <strong>{fine.reason}</strong>
                  <span>{fine.bookTitle} · {fine.barcode}</span>
                  <div className="history-record-dates">
                    <span>Ghi nhận: {formatDate(fine.createdAt)}</span>
                    <span>Thanh toán: {formatDate(fine.paidAt)}</span>
                  </div>
                </div>
                <div className="history-fine-total">
                  <strong>{fine.amount.toLocaleString('vi-VN')}đ</strong>
                  <span className={`history-status history-status--${fine.status.toLowerCase()}`}>
                    {fine.status === 'Paid' ? 'Đã thanh toán' : fine.status === 'Pending' ? 'Chưa thanh toán' : fine.status}
                  </span>
                </div>
              </article>
            )) : <div className="history-empty"><Wallet size={22} />Bạn chưa có khoản phí phạt nào.</div>}
          </section>
        )}
      </main>
    </div>
  );
};

export default HistoryPage;
