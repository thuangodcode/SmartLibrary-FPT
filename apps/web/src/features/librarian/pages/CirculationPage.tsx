import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, NavLink, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Wallet,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import {
  STATUS_LABELS,
  TABS,
  errorMessage,
  formatDate,
  formatDateTime,
  formatDelta,
  formatMoney,
  initials,
  isCirculationTab,
  reservationLabel,
  tabPath,
  useCirculationAuth,
  type ApiResult,
  type CirculationActivity,
  type CirculationFine,
  type CirculationIncident,
  type CirculationLoan,
  type CirculationReservation,
  type CirculationStats,
  type CirculationTab,
} from './circulationShared';
import './CirculationPage.css';

const TAB_ICONS = {
  loans: BookOpen,
  return: RotateCcw,
  overdue: Clock3,
  fines: Wallet,
} as const;

interface LoanList {
  items: CirculationLoan[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface IncidentDraft {
  severity: string;
  amount: string;
  applyOverdue: boolean;
  notes: string;
}

function DebouncedSearchInput({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (value: string) => void;
}) {
  const [input, setInput] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (input !== value) onSearch(input);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [input, onSearch, value]);

  return (
    <input
      value={input}
      placeholder="Tìm theo mã phiếu, tên sách, mã độc giả..."
      onChange={(event) => setInput(event.target.value)}
    />
  );
}

function Chrome({ tab, stats, loading }: { tab: CirculationTab; stats: CirculationStats | null; loading?: boolean }) {
  const current = TABS.find((item) => item.id === tab)!;
  const HeroIcon = TAB_ICONS[tab];
  return (
    <>
      <nav className="circ-crumb" aria-label="Breadcrumb">
        <span>Trang chủ</span>
        <span>/</span>
        <span>Quản lý dịch vụ</span>
        <span>/</span>
        <strong>{current.crumb}</strong>
      </nav>
      <header className="circ-hero">
        <span className="circ-hero-icon"><HeroIcon size={22} /></span>
        <div>
          <h1>{current.label}</h1>
          <p>{current.description}</p>
        </div>
      </header>
      <section className="circ-stats" aria-label="Chỉ số mượn trả">
        <article className="circ-stat circ-stat--borrow">
          <span><BookOpen size={18} /></span>
          <div>
            <small>Đang mượn</small>
            <strong>{loading ? '—' : (stats?.borrowed ?? 0)}</strong>
            <em>{stats ? formatDelta(stats.borrowedDelta) : 'Đang tải...'}</em>
          </div>
        </article>
        <article className="circ-stat circ-stat--return">
          <span><RotateCcw size={18} /></span>
          <div>
            <small>Đã trả</small>
            <strong>{loading ? '—' : (stats?.returned ?? 0)}</strong>
            <em>{stats ? formatDelta(stats.returnedDelta) : 'Đang tải...'}</em>
          </div>
        </article>
        <article className="circ-stat circ-stat--overdue">
          <span><Clock3 size={18} /></span>
          <div>
            <small>Quá hạn</small>
            <strong>{loading ? '—' : (stats?.overdue ?? 0)}</strong>
            <em>{stats ? formatDelta(stats.overdueDelta) : 'Đang tải...'}</em>
          </div>
        </article>
        <article className="circ-stat circ-stat--fine">
          <span><Wallet size={18} /></span>
          <div>
            <small>Tổng phí phạt</small>
            <strong>{loading ? '—' : formatMoney(stats?.unpaidFines)}</strong>
            <em>{stats ? formatDelta(stats.unpaidFinesDelta) : 'Đang tải...'}</em>
          </div>
        </article>
      </section>
      <nav className="circ-tabs" aria-label="Chức năng mượn trả">
        {TABS.map((item) => {
          const Icon = TAB_ICONS[item.id];
          return (
            <NavLink key={item.id} to={item.to} className={`circ-tab${tab === item.id ? ' is-active' : ''}`}>
              <Icon size={15} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}

function LoansView() {
  const headers = useCirculationAuth();
  const [params, setParams] = useSearchParams();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [list, setList] = useState<LoanList | null>(null);
  const [fines, setFines] = useState<CirculationFine[]>([]);
  const [pending, setPending] = useState<CirculationLoan[]>([]);
  const [readerKey, setReaderKey] = useState('');
  const [borrowBarcode, setBorrowBarcode] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CirculationLoan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const search = params.get('q') ?? '';
  const status = params.get('status') ?? 'All';
  const page = Number(params.get('page') ?? '1') || 1;
  const setFilter = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'All') next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  }, [params, setParams]);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '8' });
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'All') query.set('status', status);
      const [statsRes, listRes, fineRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/loans?${query}`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/fines?status=Pending`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/pending`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const listJson = await parseApiResponse<ApiResult<LoanList>>(listRes);
      const fineJson = await parseApiResponse<ApiResult<CirculationFine[]>>(fineRes);
      const pendingJson = await parseApiResponse<ApiResult<CirculationLoan[]>>(pendingRes);
      if (!listRes.ok || !listJson?.success || !listJson.data) throw new Error(listJson?.error || 'Không tải được danh sách mượn.');
      setError(null);
      setStats(statsJson?.data ?? null);
      setList(listJson.data);
      setFines(fineJson?.data ?? []);
      setPending(pendingJson?.data ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Lỗi tải dữ liệu.'));
    } finally {
      setLoading(false);
    }
  }, [headers, page, search, status]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (url: string, body?: object) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Thao tác thất bại.');
      setMessage(json.meta?.message || 'Đã cập nhật.');
      setBorrowBarcode('');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Thao tác thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page">
      <Chrome tab="loans" stats={stats} loading={loading} />
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}

      <form
        className="circ-card"
        onSubmit={(e) => {
          e.preventDefault();
          void post('/api/v1/circulation/checkout', { readerKey, barcode: borrowBarcode });
        }}
      >
        <h2>Mượn sách tại quầy</h2>
        <div className="circ-checkout">
          <label className="circ-field">
            Mã thẻ hoặc tên độc giả
            <input value={readerKey} onChange={(e) => setReaderKey(e.target.value)} placeholder="Nhập mã thẻ, email hoặc mã sinh viên" />
          </label>
          <label className="circ-field">
            Mã vạch sách
            <input value={borrowBarcode} onChange={(e) => setBorrowBarcode(e.target.value)} placeholder="Quét hoặc nhập mã bản sao, ví dụ py01-01" />
          </label>
          <button type="submit" className="circ-btn circ-btn--primary" disabled={busy}>
            Xác nhận mượn <ArrowRight size={14} />
          </button>
        </div>
      </form>

      <div className="circ-layout">
        <div className="circ-main">
          <div className="circ-card">
            <div className="circ-card-head">
              <h2>Danh sách mượn sách</h2>
              <div className="circ-toolbar">
                <DebouncedSearchInput key={search} value={search} onSearch={(value) => setFilter('q', value)} />
                <select value={status} onChange={(e) => setFilter('status', e.target.value)}>
                  <option value="All">Tất cả trạng thái</option>
                  <option value="Borrowed">Đang mượn</option>
                  <option value="Returned">Đã trả</option>
                  <option value="Overdue">Quá hạn</option>
                  <option value="Pending">Chờ xác nhận</option>
                </select>
              </div>
            </div>
            {loading && !list ? (
              <p className="circ-empty"><LoaderCircle className="spin" size={18} /> Đang tải danh sách...</p>
            ) : !list?.items.length ? (
              <p className="circ-empty">Chưa có phiếu mượn phù hợp.</p>
            ) : (
              <div className="circ-table-wrap">
                <table className="circ-table">
                  <thead>
                    <tr>
                      <th>Mã phiếu</th><th>Ngày mượn</th><th>Hạn trả</th><th>Độc giả</th><th>Sách</th><th>Trạng thái</th><th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.items.map((loan) => (
                      <tr key={loan.id}>
                        <td>{loan.code}</td>
                        <td>{formatDate(loan.borrowDate)}</td>
                        <td>{formatDate(loan.dueDate)}</td>
                        <td>
                          <span className="circ-reader">
                            <span className="circ-avatar">{initials(loan.readerName)}</span>
                            {loan.readerName}
                          </span>
                        </td>
                        <td className="circ-book">{loan.bookTitle}</td>
                        <td>
                          <span className={`circ-badge is-${loan.displayStatus.toLowerCase()}`}>
                            {STATUS_LABELS[loan.displayStatus] ?? loan.displayStatus}
                          </span>
                        </td>
                        <td>
                          <div className="circ-actions">
                            <button type="button" className="circ-btn" onClick={() => setDetail(loan)}><Eye size={14} /> Xem</button>
                            <details className="circ-more">
                              <summary aria-label="Thao tác khác"><MoreHorizontal size={16} /></summary>
                              <div>
                                {loan.displayStatus !== 'Returned' && (
                                  <Link to={`${tabPath('return')}?barcode=${encodeURIComponent(loan.barcode)}`}>Trả sách</Link>
                                )}
                                {loan.canRenew && loan.displayStatus !== 'Returned' && (
                                  <button type="button" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${loan.id}/renew`)}>
                                    Gia hạn{loan.renewalCount ? ` (${loan.renewalCount})` : ''}
                                  </button>
                                )}
                                {loan.displayStatus === 'Overdue' && <Link to={tabPath('overdue')}>Xem quá hạn</Link>}
                                <button type="button" onClick={() => setDetail(loan)}>Chi tiết phiếu</button>
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {list && list.totalCount > 0 && (
              <div className="circ-pager">
                <span>Hiển thị {(list.page - 1) * list.pageSize + 1} – {Math.min(list.page * list.pageSize, list.totalCount)} / {list.totalCount} phiếu</span>
                <div className="circ-pages">
                  {Array.from({ length: list.totalPages }, (_, i) => i + 1)
                    .filter((p) => list.totalPages <= 5 || p === 1 || p === list.totalPages || Math.abs(p - page) <= 1)
                    .map((p, index, arr) => (
                      <span key={p}>
                        {index > 0 && arr[index - 1] !== p - 1 ? <em>…</em> : null}
                        <button type="button" className={`circ-page-btn${p === page ? ' is-active' : ''}`} onClick={() => setFilter('page', String(p))}>{p}</button>
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>

          <div className="circ-card">
            <div className="circ-card-head">
              <h2>Yêu cầu mượn chờ xác nhận</h2>
              <small className="circ-count">{pending.length} yêu cầu</small>
            </div>
            {loading && !pending.length ? (
              <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải...</p>
            ) : !pending.length ? (
              <p className="circ-empty">Không có yêu cầu chờ duyệt.</p>
            ) : (
              <div className="circ-table-wrap">
                <table className="circ-table">
                  <thead><tr><th>Độc giả</th><th>Sách</th><th>Ngày gửi</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {pending.map((item) => (
                      <tr key={item.id}>
                        <td>{item.readerName}</td>
                        <td>{item.bookTitle}</td>
                        <td>{formatDateTime(item.createdAt || item.borrowDate)}</td>
                        <td className="circ-actions">
                          <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${item.id}/approve`)}>Xác nhận</button>
                          <button type="button" className="circ-btn" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${item.id}/reject`)}>Từ chối</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <aside className="circ-side">
          <div className="circ-card">
            <h2>Thông tin nhanh</h2>
            <div className="circ-quick">
              <Link to={`${tabPath('loans')}?status=Borrowed`}>
                <span><BookOpen size={15} /> Sách đang mượn</span>
                <strong>{stats?.borrowed ?? 0} <ChevronRight size={14} /></strong>
              </Link>
              <Link to={tabPath('overdue')}>
                <span><Clock3 size={15} /> Sắp đến hạn</span>
                <strong>{stats?.dueSoon ?? 0} <ChevronRight size={14} /></strong>
              </Link>
              <Link to={tabPath('overdue')}>
                <span><AlertCircle size={15} /> Quá hạn</span>
                <strong>{stats?.overdue ?? 0} <ChevronRight size={14} /></strong>
              </Link>
              <Link to={tabPath('fines')}>
                <span><Wallet size={15} /> Tổng phí phạt</span>
                <strong>{formatMoney(stats?.unpaidFines)} <ChevronRight size={14} /></strong>
              </Link>
            </div>
          </div>
          <div className="circ-card">
            <div className="circ-card-head">
              <h2>Phí phạt gần đây</h2>
              <Link to={tabPath('fines')}>Xem tất cả</Link>
            </div>
            {fines.slice(0, 4).map((fine) => (
              <div className="circ-fine-row" key={fine.id}>
                <div>
                  <b>{fine.readerName}</b>
                  <small>{fine.code} · {formatDate(fine.createdAt)}</small>
                </div>
                <div className="circ-fine-amt">
                  <strong>{formatMoney(fine.amount)}</strong>
                  <em>Chưa thanh toán</em>
                </div>
              </div>
            ))}
            {fines.length === 0 && <p className="circ-empty">Chưa có khoản phạt chờ thu.</p>}
          </div>
          <div className="circ-card">
            <h2>Lưu ý</h2>
            <ul className="circ-note">
              <li>Trả sách đúng hạn để tránh phát sinh phí phạt.</li>
              <li>Quá hạn sẽ tính theo hạn trả và trạng thái phiếu thực tế.</li>
              <li>Vui lòng kiểm tra email nhắc hạn nếu độc giả chưa trả.</li>
            </ul>
          </div>
        </aside>
      </div>

      {detail && (
        <div className="circ-modal" role="dialog" aria-labelledby="loan-detail-title">
          <div className="circ-card">
            <h2 id="loan-detail-title">Chi tiết {detail.code}</h2>
            <p><b>Độc giả:</b> {detail.readerName}</p>
            <p><b>Sách:</b> {detail.bookTitle}</p>
            <p><b>Mã vạch:</b> {detail.barcode}</p>
            <p><b>Mượn:</b> {formatDate(detail.borrowDate)} · <b>Hạn:</b> {formatDate(detail.dueDate)}</p>
            <p>
              <b>Trạng thái:</b> {STATUS_LABELS[detail.displayStatus] ?? detail.displayStatus}
              {detail.overdueDays > 0 ? ` · Trễ ${detail.overdueDays} ngày` : ''}
            </p>
            <div className="circ-actions">
              {detail.displayStatus !== 'Returned' && (
                <Link className="circ-btn circ-btn--primary" to={`${tabPath('return')}?barcode=${encodeURIComponent(detail.barcode)}`}>Trả sách</Link>
              )}
              <button type="button" className="circ-btn" onClick={() => setDetail(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ReturnView() {
  const headers = useCirculationAuth();
  const [params] = useSearchParams();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [reservations, setReservations] = useState<CirculationReservation[]>([]);
  const [activity, setActivity] = useState<CirculationActivity[]>([]);
  const [readerKey, setReaderKey] = useState('');
  const [returnBarcode, setReturnBarcode] = useState(params.get('barcode') ?? '');
  const [reserveBarcode, setReserveBarcode] = useState('');
  const [condition, setCondition] = useState('Good');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsRes, reservationRes, activityRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/reservations`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/activity`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const reservationJson = await parseApiResponse<ApiResult<CirculationReservation[]>>(reservationRes);
      const activityJson = await parseApiResponse<ApiResult<CirculationActivity[]>>(activityRes);
      if (!reservationRes.ok || !reservationJson?.success) throw new Error(reservationJson?.error || 'Không tải được đặt chỗ.');
      setStats(statsJson?.data ?? null);
      setReservations(reservationJson.data ?? []);
      setActivity(activityJson?.data ?? []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Không tải được dữ liệu trả sách.'));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (url: string, body?: object) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Thao tác thất bại.');
      setMessage(json.meta?.message || 'Đã cập nhật.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Thao tác thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page">
      <Chrome tab="return" stats={stats} loading={loading} />
      <div className="circ-toolbar-end">
        <span />
        <button type="button" className="circ-btn" disabled={loading || busy} onClick={() => void load()}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}
      <div className="circ-form-grid">
        <form
          className="circ-card"
          onSubmit={(e) => {
            e.preventDefault();
            void post('/api/v1/circulation/return', { barcode: returnBarcode, condition });
          }}
        >
          <h2>Trả sách</h2>
          <label className="circ-field">
            Mã vạch sách
            <input value={returnBarcode} onChange={(e) => setReturnBarcode(e.target.value)} placeholder="Quét hoặc nhập mã bản sao, ví dụ py01-01" />
          </label>
          <label className="circ-field">
            Tình trạng khi trả
            <select value={condition} onChange={(e) => setCondition(e.target.value)}>
              <option value="Good">Bình thường</option>
              <option value="Fair">Hơi cũ</option>
              <option value="Damaged">Hư hỏng</option>
              <option value="Lost">Thất lạc</option>
            </select>
          </label>
          <p className="circ-hint">Hư hỏng hoặc thất lạc chỉ lập hồ sơ chờ xác minh. Thủ thư xác nhận ở mục Quá hạn rồi mới tính bồi thường.</p>
          <button type="submit" className="circ-btn circ-btn--primary" disabled={busy}>Ghi nhận trả sách</button>
        </form>
        <div className="circ-card">
          <h2>Đặt chỗ</h2>
          <form
            className="circ-field"
            onSubmit={(e) => {
              e.preventDefault();
              void post('/api/v1/circulation/reservations', { readerKey, barcode: reserveBarcode });
            }}
            style={{ marginBottom: 12 }}
          >
            <label className="circ-field">
              Mã thẻ hoặc tên độc giả
              <input value={readerKey} onChange={(e) => setReaderKey(e.target.value)} placeholder="Nhập mã thẻ, email hoặc mã sinh viên" />
            </label>
            <label className="circ-field">
              Mã vạch sách cần đặt chỗ
              <input value={reserveBarcode} onChange={(e) => setReserveBarcode(e.target.value)} placeholder="Mã bản sao cần đặt chỗ, ví dụ py01-01" />
            </label>
            <button type="submit" className="circ-btn circ-btn--primary" disabled={busy} style={{ marginTop: 8 }}>Tạo đặt chỗ</button>
            <p className="circ-hint">Không giữ một bản sao cụ thể cho đến khi sách sẵn sàng.</p>
          </form>
          {loading && !reservations.length ? (
            <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải...</p>
          ) : !reservations.length ? (
            <p className="circ-empty">Không có đặt chỗ đang mở.</p>
          ) : reservations.map((item) => (
            <div className="circ-reserve-row" key={item.id}>
              <div>
                <b>{item.readerName}</b>
                <small>{item.bookTitle}</small>
              </div>
              <span className={`circ-badge is-${item.status.toLowerCase()}`}>{reservationLabel(item.status)}</span>
              <button type="button" className="circ-btn" disabled={busy} onClick={() => void post(`/api/v1/circulation/reservations/${item.id}/cancel`)}>Hủy đặt</button>
            </div>
          ))}
        </div>
      </div>
      <div className="circ-card">
        <h2>Giao dịch gần đây</h2>
        {!activity.length ? <p className="circ-empty">Chưa có giao dịch gần đây.</p> : (
          <div className="circ-table-wrap">
            <table className="circ-table">
              <thead><tr><th>Thời gian</th><th>Loại</th><th>Mã vạch</th><th>Độc giả</th></tr></thead>
              <tbody>
                {activity.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateTime(item.at)}</td>
                    <td>
                      <span className={`circ-badge is-${item.kind.toLowerCase()}`}>
                        {item.kind === 'Returned' ? 'Trả' : 'Mượn'}
                      </span>
                    </td>
                    <td>{item.barcode}</td>
                    <td>{item.readerName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function OverdueView() {
  const headers = useCirculationAuth();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [items, setItems] = useState<CirculationLoan[]>([]);
  const [incidents, setIncidents] = useState<CirculationIncident[]>([]);
  const [drafts, setDrafts] = useState<Record<string, IncidentDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statsRes, overdueRes, incidentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/overdue`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/incidents`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const overdueJson = await parseApiResponse<ApiResult<CirculationLoan[]>>(overdueRes);
      const incidentJson = await parseApiResponse<ApiResult<CirculationIncident[]>>(incidentRes);
      if (!overdueRes.ok || !overdueJson?.success) throw new Error(overdueJson?.error || 'Không tải được sách quá hạn.');
      setError(null);
      setStats(statsJson?.data ?? null);
      setItems(overdueJson.data ?? []);
      setIncidents(incidentJson?.data ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Lỗi tải dữ liệu.'));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const draftOf = (item: CirculationIncident): IncidentDraft => drafts[item.id] ?? {
    severity: item.kind === 'Lost' ? 'Lost' : 'Light',
    amount: '',
    applyOverdue: item.overdueDays > 0,
    notes: '',
  };

  const patchDraft = (id: string, item: CirculationIncident, patch: Partial<IncidentDraft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...draftOf(item), ...patch } }));
  };

  const recordFine = async (loan: CirculationLoan) => {
    const suggested = loan.suggestedFine && loan.suggestedFine > 0 ? String(loan.suggestedFine) : '0';
    const amount = Number(window.prompt('Nhập số tiền phạt (VND). Không tự tạo phạt nếu bạn hủy.', suggested) ?? '0');
    if (!amount || amount <= 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/fines`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ borrowRecordId: loan.id, amount, reason: `Phạt quá hạn ${loan.overdueDays} ngày` }),
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không ghi nhận được phạt.');
      setMessage(json.meta?.message || 'Đã ghi nhận phạt.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Không ghi nhận được phạt.'));
    } finally {
      setBusy(false);
    }
  };

  const confirmIncident = async (item: CirculationIncident) => {
    const draft = draftOf(item);
    const amount = Number(draft.amount);
    if (!amount || amount <= 0) {
      setError('Nhập số tiền sau khi đã đối chiếu bản sao và phiếu mượn. Hệ thống không tự lấy giá sách.');
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const body = {
        severity: draft.severity,
        applyOverdue: draft.applyOverdue,
        notes: draft.notes,
        replacementValue: draft.severity === 'Light' ? null : amount,
        assessedFee: draft.severity === 'Light' ? amount : null,
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/incidents/${item.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await parseApiResponse<ApiResult<CirculationIncident>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không xác nhận được hồ sơ.');
      setMessage(json.meta?.message || 'Đã xác nhận bồi thường.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Không xác nhận được hồ sơ.'));
    } finally {
      setBusy(false);
    }
  };

  const rejectIncident = async (item: CirculationIncident) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/incidents/${item.id}/reject`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ notes: draftOf(item).notes, restoreCopy: true }),
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không từ chối được hồ sơ.');
      setMessage(json.meta?.message || 'Đã từ chối hồ sơ.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Không từ chối được hồ sơ.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page">
      <Chrome tab="overdue" stats={stats} loading={loading} />
      <div className="circ-toolbar-end">
        <span />
        <button type="button" className="circ-btn" onClick={() => void load()}><RefreshCw size={14} /> Làm mới</button>
      </div>
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}
      <div className="circ-card">
        <h2>Sách quá hạn</h2>
        {!items.length ? <p className="circ-empty">Không có sách quá hạn.</p> : (
          <div className="circ-table-wrap">
            <table className="circ-table">
              <thead>
                <tr>
                  <th>Độc giả</th><th>Sách</th><th>Hạn trả</th><th>Trễ</th><th>Phạt tạm tính</th><th>Thanh toán</th><th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((loan) => (
                  <tr key={loan.id}>
                    <td>{loan.readerName}</td>
                    <td>{loan.barcode} · {loan.bookTitle}</td>
                    <td>{formatDate(loan.dueDate)}</td>
                    <td><span className="circ-badge is-overdue">{loan.overdueDays} ngày</span></td>
                    <td>{loan.suggestedFine ? formatMoney(loan.suggestedFine) : 'Chưa có mức phạt trong chính sách'}</td>
                    <td>
                      {loan.hasOpenFine ? (
                        <span className="circ-badge is-pending">Chưa thanh toán</span>
                      ) : loan.hasFine ? (
                        <span className="circ-badge is-paid">Đã thanh toán</span>
                      ) : (
                        <span className="circ-badge is-borrowed">Chưa ghi nhận</span>
                      )}
                    </td>
                    <td className="circ-actions">
                      {loan.hasOpenFine || loan.hasFine ? (
                        <Link className="circ-btn" to={tabPath('fines')}>Xem</Link>
                      ) : (
                        <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void recordFine(loan)}>Ghi nhận phạt</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="circ-card">
        <h2>Hư hỏng & thất lạc</h2>
        <p className="circ-hint">Không ghi nhận mất sách hay bồi thường khi độc giả tự báo. Thủ thư đối chiếu bản sao, phiếu mượn rồi xác nhận. Hư hỏng nhẹ tính phí theo mức độ; hư hỏng nặng hoặc mất sách mới mua đền. Không tự khóa tài khoản.</p>
        {!incidents.length ? <p className="circ-empty">Chưa có hồ sơ mất sách hoặc hư hỏng.</p> : incidents.map((item) => {
          const draft = draftOf(item);
          const amount = Number(draft.amount) || 0;
          const overdue = draft.applyOverdue ? (item.suggestedOverdueFine ?? 0) : 0;
          const pending = item.status === 'PendingReview';
          return (
            <article className="circ-incident" key={item.id}>
              <div className="circ-incident-head">
                <div>
                  <b>{item.barcode} · {item.bookTitle}</b>
                  <small>{item.readerName}</small>
                </div>
                <span className={`circ-badge is-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status] ?? item.status}</span>
              </div>
              <p className="circ-incident-meta">
                {STATUS_LABELS[item.kind] ?? item.kind}
                {item.severity !== 'Unknown' ? ` · ${STATUS_LABELS[item.severity] ?? item.severity}` : ' · chưa đánh giá'}
                {item.overdueDays > 0 ? ` · quá hạn ${item.overdueDays} ngày` : ''}
                {item.totalAmount > 0 ? ` · ${formatMoney(item.totalAmount)}` : ''}
              </p>
              {item.description && <p className="circ-incident-note">{item.description}</p>}
              {pending ? (
                <div className="circ-incident-form">
                  <label className="circ-field">
                    Mức độ
                    <select value={draft.severity} onChange={(e) => patchDraft(item.id, item, { severity: e.target.value })} disabled={item.kind === 'Lost'}>
                      {item.kind !== 'Lost' && <option value="Light">Hư hỏng nhẹ, còn dùng được</option>}
                      {item.kind !== 'Lost' && <option value="Severe">Hư hỏng nặng, phải mua đền</option>}
                      <option value="Lost">Mất sách, bồi thường giá trị tài liệu</option>
                    </select>
                  </label>
                  <label className="circ-field">
                    {draft.severity === 'Light' ? 'Mức phí theo độ hư hỏng (VND)' : 'Giá trị bồi thường / mua đền (VND)'}
                    <input type="number" min={1} value={draft.amount} onChange={(e) => patchDraft(item.id, item, { amount: e.target.value })} placeholder="Thủ thư nhập sau khi xác minh" />
                  </label>
                  <label className="circ-check">
                    <input type="checkbox" checked={draft.applyOverdue} onChange={(e) => patchDraft(item.id, item, { applyOverdue: e.target.checked })} disabled={item.overdueDays <= 0} />
                    Cộng phạt quá hạn {item.suggestedOverdueFine ? formatMoney(item.suggestedOverdueFine) : '(chưa có mức trong chính sách)'}
                  </label>
                  <label className="circ-field">
                    Biên bản / ghi chú xác minh
                    <input value={draft.notes} onChange={(e) => patchDraft(item.id, item, { notes: e.target.value })} placeholder="Đã đối chiếu bản sao và phiếu mượn" />
                  </label>
                  {amount > 0 && (
                    <p className="circ-hint">Tạm tính: {formatMoney(amount)}{overdue ? ` + ${formatMoney(overdue)} = ${formatMoney(amount + overdue)}` : ''}. Đây không phải mức cố định cho mọi trường hợp.</p>
                  )}
                  <div className="circ-actions">
                    <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void confirmIncident(item)}>Xác nhận bồi thường</button>
                    <button type="button" className="circ-btn" disabled={busy} onClick={() => void rejectIncident(item)}>Từ chối / tìm thấy sách</button>
                    <Link className="circ-btn" to={tabPath('fines')}>Xem phí</Link>
                  </div>
                </div>
              ) : (
                <div className="circ-actions">
                  <Link className="circ-btn" to={tabPath('fines')}>Xem phí phạt</Link>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function FinesView() {
  const headers = useCirculationAuth();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [items, setItems] = useState<CirculationFine[]>([]);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'All') query.set('status', status);
      const [statsRes, fineRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/fines?${query}`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const fineJson = await parseApiResponse<ApiResult<CirculationFine[]>>(fineRes);
      if (!fineRes.ok || !fineJson?.success) throw new Error(fineJson?.error || 'Không tải được phí phạt.');
      setError(null);
      setStats(statsJson?.data ?? null);
      setItems(fineJson.data ?? []);
    } catch (err) {
      setError(errorMessage(err, 'Lỗi tải dữ liệu.'));
    } finally {
      setLoading(false);
    }
  }, [headers, search, status]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const pay = async (id: string) => {
    if (!window.confirm('Xác nhận đã thu tiền phạt này? Hệ thống không tự đánh dấu đã thanh toán.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/fines/${id}/pay`, { method: 'POST', headers });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không ghi nhận thanh toán.');
      setMessage(json.meta?.message || 'Đã ghi nhận thanh toán.');
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Không ghi nhận thanh toán.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page">
      <Chrome tab="fines" stats={stats} loading={loading} />
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}
      <div className="circ-card">
        <div className="circ-card-head">
          <h2>Danh sách phí phạt</h2>
          <div className="circ-toolbar">
            <input value={searchInput} placeholder="Tìm độc giả, mã vạch, sách..." onChange={(e) => setSearchInput(e.target.value)} />
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="All">Tất cả</option>
              <option value="Pending">Chưa thanh toán</option>
              <option value="Paid">Đã thanh toán</option>
            </select>
          </div>
        </div>
        {!items.length ? <p className="circ-empty">Chưa có khoản phạt.</p> : (
          <div className="circ-table-wrap">
            <table className="circ-table">
              <thead>
                <tr>
                  <th>Mã</th><th>Độc giả</th><th>Sách</th><th>Lý do</th><th>Số tiền</th><th>Ngày</th><th>Trạng thái</th><th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {items.map((fine) => (
                  <tr key={fine.id}>
                    <td>{fine.code}</td>
                    <td>{fine.readerName}</td>
                    <td>{fine.barcode} · {fine.bookTitle}</td>
                    <td>{fine.reason}</td>
                    <td>{formatMoney(fine.amount)}</td>
                    <td>{formatDate(fine.createdAt)}</td>
                    <td>
                      <span className={`circ-badge is-${fine.status.toLowerCase()}`}>
                        {fine.status === 'Pending' ? 'Chưa thanh toán' : (STATUS_LABELS[fine.status] ?? fine.status)}
                      </span>
                    </td>
                    <td>
                      {fine.status === 'Pending' ? (
                        <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void pay(fine.id)}>Ghi nhận thanh toán</button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const VIEWS = {
  loans: LoansView,
  return: ReturnView,
  overdue: OverdueView,
  fines: FinesView,
};

const CirculationPage: React.FC = () => {
  const { tab } = useParams();
  const [params] = useSearchParams();
  if (!isCirculationTab(tab)) return <Navigate to={tabPath('loans')} replace />;
  const View = VIEWS[tab];
  return <View key={tab === 'return' ? params.get('barcode') ?? '' : tab} />;
};

export default CirculationPage;
