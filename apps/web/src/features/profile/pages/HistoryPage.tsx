import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import HomeNavbar from '../../home/components/HomeNavbar';
import HomeFooter from '../../home/components/HomeFooter';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import './HistoryPage.css';

interface CirculationLoan {
  id: string;
  code: string;
  bookTitle: string;
  barcode: string;
  status: string;
  displayStatus: string;
  borrowDate: string | null;
  dueDate: string | null;
  pickupAt: string | null;
  acceptedAt: string | null;
  librarianName: string | null;
  returnDate: string | null;
  renewalCount: number;
  canRenew: boolean;
  renewalUnavailableReason?: string | null;
  hasOpenFine: boolean;
  suggestedFine: number | null;
}

interface CirculationFine {
  id: string;
  code: string;
  bookTitle: string;
  barcode: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  pendingPaymentStatus?: string | null;
  checkoutUrl?: string | null;
  qrCode?: string | null;
  paymentExpiresAt?: string | null;
}

interface FinePaymentCheckout {
  fineId: string;
  amount: number;
  checkoutUrl: string;
  qrCode: string;
  expiresAt: string | null;
}

interface LoanList {
  items: CirculationLoan[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: { message?: string };
}

type HistoryTab = 'loans' | 'fines';
type LoanFilter = 'all' | 'active' | 'history';
type FineFilter = 'all' | 'pending' | 'paid';

const PAGE_SIZE = 20;

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value))
  : '—';

const formatDateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value))
  : '—';

const isActiveLoan = (loan: CirculationLoan) =>
  ['Pending', 'Approved', 'Borrowed', 'Overdue'].includes(loan.status);

const statusLabel: Record<string, string> = {
  Pending: 'Chờ tiếp nhận',
  Approved: 'Đã tiếp nhận',
  Borrowed: 'Đang mượn',
  Overdue: 'Quá hạn',
  Returned: 'Đã trả',
  Rejected: 'Từ chối',
  Cancelled: 'Đã hủy',
  PendingPayment: 'Chưa thanh toán',
  Paid: 'Đã thanh toán',
  Waived: 'Đã miễn',
};

const HistoryPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const returnFineId = searchParams.get('fineId');
  const paymentRedirect = searchParams.get('payment');
  const token = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const [loans, setLoans] = useState<LoanList | null>(null);
  const [fines, setFines] = useState<CirculationFine[]>([]);
  const tab: HistoryTab = searchParams.get('tab') === 'fines' ? 'fines' : 'loans';
  const [loanFilter, setLoanFilter] = useState<LoanFilter>('all');
  const [fineFilter, setFineFilter] = useState<FineFilter>('all');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const selectTab = (nextTab: HistoryTab) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', nextTab);
    setSearchParams(next, { replace: true });
  };
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [paymentCheckout, setPaymentCheckout] = useState<FinePaymentCheckout | null>(null);
  const [paymentBusy, setPaymentBusy] = useState<string | null>(null);
  const renewalRequestInFlight = useRef(false);
  const paymentRedirectInfoShown = useRef(false);
  const paymentRedirectHandled = useRef(false);
  const paymentRedirectKey = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refreshFromRealtime = () => setRefreshKey((current) => current + 1);
    window.addEventListener('reader-circulation-updated', refreshFromRealtime);
    return () => window.removeEventListener('reader-circulation-updated', refreshFromRealtime);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = { Authorization: `Bearer ${token}` };
        const [loanResponse, fineResponse] = await Promise.all([
          fetch(`${API_BASE_URL}/api/v1/me/circulation/loans?page=${page}&pageSize=${PAGE_SIZE}`, { headers }),
          fetch(`${API_BASE_URL}/api/v1/me/circulation/fines`, { headers }),
        ]);
        const [loanResult, fineResult] = await Promise.all([
          parseApiResponse<ApiEnvelope<LoanList>>(loanResponse),
          parseApiResponse<ApiEnvelope<CirculationFine[]>>(fineResponse),
        ]);
        if (!loanResponse.ok || !loanResult?.success || !loanResult.data) {
          throw new Error(loanResult?.error || 'Không thể tải danh sách phiếu mượn.');
        }
        if (!fineResponse.ok || !fineResult?.success || !fineResult.data) {
          throw new Error(fineResult?.error || 'Không thể tải danh sách phí phạt.');
        }
        if (!cancelled) {
          setLoans(loanResult.data);
          setFines(fineResult.data);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Không thể tải dữ liệu mượn trả.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey, token]);

  const visibleLoans = useMemo(() => {
    const records = loans?.items ?? [];
    if (loanFilter === 'active') return records.filter(isActiveLoan);
    if (loanFilter === 'history') return records.filter((loan) => !isActiveLoan(loan));
    return records;
  }, [loanFilter, loans]);

  const visibleFines = useMemo(() => {
    if (fineFilter === 'pending') return fines.filter((fine) => fine.status === 'Pending');
    if (fineFilter === 'paid') return fines.filter((fine) => fine.status === 'Paid');
    return fines;
  }, [fineFilter, fines]);

  const unpaidTotal = fines
    .filter((fine) => fine.status === 'Pending')
    .reduce((total, fine) => total + fine.amount, 0);

  const renewLoan = async (loan: CirculationLoan) => {
    if (!token || renewalRequestInFlight.current) return;
    renewalRequestInFlight.current = true;
    setRenewingId(loan.id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/circulation/loans/${loan.id}/renew`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<ApiEnvelope<CirculationLoan>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể gia hạn phiếu mượn.');
      }
      if (!result.data || result.data.id !== loan.id || !result.data.dueDate) {
        throw new Error('Máy chủ không trả về hạn trả mới. Hãy tải lại danh sách phiếu mượn.');
      }
      showToast({
        type: 'success',
        title: 'Gia hạn thành công',
        message: `Hạn trả mới: ${formatDateTime(result.data.dueDate)}.`,
      });
      setRefreshKey((current) => current + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Vui lòng thử lại sau.';
      setError(message);
      showToast({
        type: 'error',
        title: 'Không thể gia hạn',
        message,
      });
    } finally {
      renewalRequestInFlight.current = false;
      setRenewingId(null);
    }
  };

  const createPayOSCheckout = async (fine: CirculationFine) => {
    if (!token || paymentBusy) return;
    setPaymentBusy(fine.id);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/me/circulation/fines/${fine.id}/pay/payos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await parseApiResponse<ApiEnvelope<FinePaymentCheckout>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể tạo thanh toán PayOS.');
      }
      setPaymentCheckout(result.data);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Không thể tạo thanh toán PayOS.';
      setError(message);
      showToast({ type: 'error', title: 'Không thể thanh toán', message });
    } finally {
      setPaymentBusy(null);
    }
  };

  useEffect(() => {
    const shouldPoll = Boolean(paymentCheckout || (paymentRedirect === 'return' && returnFineId));
    if (!shouldPoll) return undefined;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      setRefreshKey((current) => current + 1);
      if (attempts >= 24) window.clearInterval(timer);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [paymentCheckout, paymentRedirect, returnFineId]);

  useEffect(() => {
    if (!paymentCheckout) return;
    const paid = fines.some((fine) => fine.id === paymentCheckout.fineId && fine.status === 'Paid');
    if (paid) {
      setPaymentCheckout(null);
      showToast({
        type: 'success',
        title: 'Đã xác nhận thanh toán',
        message: 'PayOS đã xác nhận giao dịch. Khoản phí đã được cập nhật.',
      });
    }
  }, [fines, paymentCheckout, showToast]);

  useEffect(() => {
    const key = returnFineId && paymentRedirect ? `${paymentRedirect}:${returnFineId}` : null;
    if (paymentRedirectKey.current !== key) {
      paymentRedirectKey.current = key;
      paymentRedirectInfoShown.current = false;
      paymentRedirectHandled.current = false;
    }
    if (!returnFineId || !paymentRedirect || loading || paymentRedirectHandled.current) return;
    const next = new URLSearchParams(searchParams);
    if (paymentRedirect === 'cancel') {
      paymentRedirectHandled.current = true;
      showToast({
        type: 'info',
        title: 'Thanh toán chưa hoàn tất',
        message: 'Khoản phí vẫn đang chờ thanh toán; hệ thống chưa ghi nhận đã thu.',
      });
      next.delete('payment');
      next.delete('fineId');
      setSearchParams(next, { replace: true });
      return;
    }
    if (paymentRedirect !== 'return') return;

    const fine = fines.find((item) => item.id === returnFineId);
    if (fine?.status === 'Paid' && fine.paymentMethod === 'PayOS') {
      paymentRedirectHandled.current = true;
      showToast({
        type: 'success',
        title: 'Đã xác nhận thanh toán',
        message: 'PayOS đã xác nhận giao dịch.',
      });
      next.delete('payment');
      next.delete('fineId');
      setSearchParams(next, { replace: true });
    } else if (!paymentRedirectInfoShown.current) {
      paymentRedirectInfoShown.current = true;
      showToast({
        type: 'info',
        title: 'Đang xác minh thanh toán',
        message: 'Hệ thống đang chờ PayOS xác nhận. Trạng thái sẽ tự cập nhật; chưa ghi nhận giao dịch chỉ dựa trên trang chuyển hướng.',
      });
    }
  }, [fines, loading, paymentRedirect, returnFineId, searchParams, setSearchParams, showToast]);

  return (
    <div className="annual-home history-page">
      <HomeNavbar />
      <main className="history-main">
        <header className="history-heading">
          <p>SMARTLIBRARY · TÀI KHOẢN</p>
          <h1>Mượn & trả của tôi</h1>
          <span>Quản lý phiếu mượn, theo dõi hạn trả, gia hạn và kiểm tra phí phạt.</span>
        </header>

        <section className="history-summary" aria-label="Tổng quan mượn trả">
          <article>
            <span>Phiếu mượn</span>
            <strong>{loans?.totalCount ?? '—'}</strong>
            <BookOpen size={19} aria-hidden="true" />
          </article>
          <article>
            <span>Đang mượn · trang này</span>
            <strong>{loans?.items.filter((loan) => loan.status === 'Borrowed').length ?? '—'}</strong>
            <Clock3 size={19} aria-hidden="true" />
          </article>
          <article>
            <span>Quá hạn · trang này</span>
            <strong>{loans?.items.filter((loan) => loan.displayStatus === 'Overdue').length ?? '—'}</strong>
            <CalendarDays size={19} aria-hidden="true" />
          </article>
          <article>
            <span>Phí chưa thanh toán</span>
            <strong>{unpaidTotal.toLocaleString('vi-VN')}đ</strong>
            <Wallet size={19} aria-hidden="true" />
          </article>
        </section>

        <div className="history-tabs" role="tablist" aria-label="Quản lý mượn trả">
          <button
            className={tab === 'loans' ? 'is-active' : ''}
            onClick={() => selectTab('loans')}
            role="tab"
            aria-selected={tab === 'loans'}
          >
            <BookOpen size={17} /> Mượn & trả <span>{loans?.totalCount ?? 0}</span>
          </button>
          <button
            className={tab === 'fines' ? 'is-active' : ''}
            onClick={() => selectTab('fines')}
            role="tab"
            aria-selected={tab === 'fines'}
          >
            <Wallet size={17} /> Phí phạt <span>{fines.length}</span>
          </button>
        </div>

        <div className="history-toolbar">
          <div>
            <strong>{tab === 'loans' ? 'Danh sách phiếu mượn' : 'Danh sách phí phạt'}</strong>
            <span>Dữ liệu được cập nhật trực tiếp từ hồ sơ thư viện của bạn.</span>
          </div>
          <label>
            <span className="sr-only">Lọc trạng thái</span>
            {tab === 'loans' ? (
              <select value={loanFilter} onChange={(event) => setLoanFilter(event.target.value as LoanFilter)}>
                <option value="all">Tất cả phiếu</option>
                <option value="active">Đang xử lý / mượn</option>
                <option value="history">Đã hoàn tất / từ chối</option>
              </select>
            ) : (
              <select value={fineFilter} onChange={(event) => setFineFilter(event.target.value as FineFilter)}>
                <option value="all">Tất cả phí phạt</option>
                <option value="pending">Chưa thanh toán</option>
                <option value="paid">Đã thanh toán</option>
              </select>
            )}
          </label>
        </div>

        {error && <div className="history-alert" role="alert"><AlertCircle size={17} />{error}</div>}
        {loading ? (
          <div className="history-empty"><LoaderCircle className="history-spinner" size={22} /> Đang tải dữ liệu...</div>
        ) : tab === 'loans' ? (
          <section className="history-list" aria-label="Danh sách mượn và trả">
            {visibleLoans.length ? visibleLoans.map((loan) => (
              <article className="history-record" key={loan.id}>
                <div className="history-record-icon"><BookOpen size={19} /></div>
                <div className="history-record-main">
                  <div className="history-record-title">
                    <strong>{loan.bookTitle}</strong>
                    <span>{loan.code}</span>
                  </div>
                  <span>Mã bản sao: {loan.barcode}</span>
                  {loan.pickupAt && <span>Lịch đến nhận: {formatDateTime(loan.pickupAt)}</span>}
                  {loan.acceptedAt && (
                    <span>
                      Tiếp nhận bởi {loan.librarianName || 'thủ thư'} lúc {formatDateTime(loan.acceptedAt)}
                    </span>
                  )}
                  <div className="history-record-dates">
                    <span>Mượn: {formatDateTime(loan.borrowDate)}</span>
                    <span>Hạn trả: {formatDateTime(loan.dueDate)}</span>
                    <span>Đã trả: {formatDate(loan.returnDate)}</span>
                    <span>Gia hạn: {loan.renewalCount} lần</span>
                  </div>
                  {loan.hasOpenFine && <span className="history-record-warning">Phiếu này đang có phí chưa thanh toán.</span>}
                  {loan.suggestedFine != null && (
                    <span className="history-record-warning">
                      Phí quá hạn tạm tính: {loan.suggestedFine.toLocaleString('vi-VN')}đ
                    </span>
                  )}
                </div>
                <div className="history-record-actions">
                  <span className={`history-status history-status--${loan.displayStatus.toLowerCase()}`}>
                    {statusLabel[loan.displayStatus] ?? loan.displayStatus}
                  </span>
                  {['Borrowed', 'Overdue'].includes(loan.status) && !loan.canRenew && loan.renewalUnavailableReason && (
                    <span className="history-renew-note">{loan.renewalUnavailableReason}</span>
                  )}
                  {loan.canRenew && (
                    <button
                      type="button"
                      className="history-renew-button"
                      onClick={() => void renewLoan(loan)}
                      disabled={renewingId !== null}
                    >
                      {renewingId === loan.id
                        ? <LoaderCircle className="history-spinner" size={14} />
                        : <RefreshCw size={14} />}
                      Gia hạn
                    </button>
                  )}
                </div>
              </article>
            )) : (
              <div className="history-empty"><Clock3 size={22} />Không có phiếu mượn phù hợp với bộ lọc.</div>
            )}
          </section>
        ) : (
          <section className="history-list" aria-label="Danh sách phí phạt">
            {visibleFines.length ? visibleFines.map((fine) => (
              <article className="history-record" key={fine.id}>
                <div className="history-record-icon history-record-icon--fine">
                  {fine.status === 'Paid' ? <CheckCircle2 size={19} /> : <Wallet size={19} />}
                </div>
                <div className="history-record-main">
                  <div className="history-record-title">
                    <strong>{fine.reason}</strong>
                    <span>{fine.code}</span>
                  </div>
                  <span>{fine.bookTitle} · Mã bản sao: {fine.barcode}</span>
                  <div className="history-record-dates">
                    <span>Ghi nhận: {formatDate(fine.createdAt)}</span>
                    <span>Thanh toán: {formatDate(fine.paidAt)}</span>
                  </div>
                  {fine.paymentMethod && (
                    <span className="history-record-payment-method">
                      Phương thức: {fine.paymentMethod === 'Cash' ? 'Tiền mặt tại quầy' : 'PayOS'}
                      {fine.paymentReference ? ` · Mã giao dịch: ${fine.paymentReference}` : ''}
                    </span>
                  )}
                </div>
                <div className="history-fine-total">
                  <strong>{fine.amount.toLocaleString('vi-VN')}đ</strong>
                  <span className={`history-status history-status--${fine.status.toLowerCase()}`}>
                    {statusLabel[fine.status] ?? fine.status}
                  </span>
                  {fine.status === 'Pending' && (
                    <button
                      type="button"
                      className="history-pay-button"
                      disabled={paymentBusy !== null}
                      onClick={() => void createPayOSCheckout(fine)}
                    >
                      {paymentBusy === fine.id ? <LoaderCircle className="history-spinner" size={14} /> : <Wallet size={14} />}
                      Thanh toán PayOS
                    </button>
                  )}
                </div>
              </article>
            )) : (
              <div className="history-empty"><Wallet size={22} />Không có khoản phí phù hợp với bộ lọc.</div>
            )}
          </section>
        )}

        {tab === 'loans' && (loans?.totalPages ?? 0) > 1 && (
          <nav className="history-pagination" aria-label="Phân trang phiếu mượn">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
              <ArrowLeft size={15} /> Trước
            </button>
            <span>Trang {loans?.page ?? page} / {loans?.totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(loans?.totalPages ?? current, current + 1))}
              disabled={page >= (loans?.totalPages ?? 1)}
            >
              Sau <ArrowRight size={15} />
            </button>
          </nav>
        )}
      </main>
      {paymentCheckout && (
        <div className="history-payment-backdrop" role="presentation" onClick={() => setPaymentCheckout(null)}>
          <section
            className="history-payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-payment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="history-payment-close" aria-label="Đóng" onClick={() => setPaymentCheckout(null)}>×</button>
            <p>THANH TOÁN PHÍ PHẠT</p>
            <h2 id="history-payment-title">Quét mã QR PayOS</h2>
            <strong className="history-payment-amount">{paymentCheckout.amount.toLocaleString('vi-VN')}đ</strong>
            <QRCodeCanvas value={paymentCheckout.qrCode} size={220} level="M" includeMargin />
            <span>Quét mã bằng ứng dụng ngân hàng hoặc mở trang thanh toán PayOS.</span>
            <a href={paymentCheckout.checkoutUrl} target="_blank" rel="noreferrer">Mở trang thanh toán</a>
            <small>Trang sẽ tự cập nhật sau khi PayOS xác nhận giao dịch. Không đóng trang thanh toán trước khi hoàn tất.</small>
          </section>
        </div>
      )}
      <HomeFooter />
    </div>
  );
};

export default HistoryPage;
