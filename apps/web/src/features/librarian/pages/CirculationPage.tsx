import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import {
  BookOpen,
  Bookmark,
  Check,
  Clock3,
  Eye,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';
import { useToast } from '../../../components/ui/useToast';
import { useAuthStore } from '../../auth/store/useAuthStore';
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
  reservations: Bookmark,
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
  applyOverdue: boolean;
  notes: string;
}

function policyIncidentFee(stats: CirculationStats | null, severity: string): number {
  if (!stats) return 0;
  return severity === 'Light' ? stats.damageFee || 0 : stats.lostFee || 0;
}

interface ReservationOption {
  id: string;
  label: string;
  detail: string;
  studentId?: string | null;
  email?: string;
  code?: string;
  sampleBarcode?: string | null;
  availableCopies?: number;
}

function ReservationAutocomplete({
  label,
  step,
  value,
  selected,
  placeholder,
  endpoint,
  onChange,
  onSelect,
  onClear,
}: {
  label: string;
  step?: string;
  value: string;
  selected: ReservationOption | null;
  placeholder: string;
  endpoint: 'reader' | 'book';
  onChange: (value: string) => void;
  onSelect: (option: ReservationOption) => void;
  onClear: () => void;
}) {
  const [result, setResult] = useState<{
    query: string;
    options: ReservationOption[];
    error: string | null;
  }>({ query: '', options: [], error: null });
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const headers = useCirculationAuth();
  const query = value.trim();

  useEffect(() => {
    if (!query) {
      setResult({ query: '', options: [], error: null });
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const path = endpoint === 'reader'
            ? '/api/v1/circulation/reservation-reader-options'
            : '/api/v1/circulation/reservation-book-options';
          const response = await fetch(`${API_BASE_URL}${path}?search=${encodeURIComponent(query)}`, {
            headers,
            signal: controller.signal,
          });
          if (response.status === 404) {
            throw new Error('API gợi ý chưa có trên máy chủ. Hãy cập nhật và khởi động lại backend.');
          }
          const result = await parseApiResponse<ApiResult<Array<{
            id: string;
            fullName?: string;
            studentId?: string | null;
            email?: string;
            title?: string;
            code?: string;
            availableCopies?: number;
            sampleBarcode?: string | null;
          }>>>(response);
          if (!response.ok || !result?.success || !result.data) {
            throw new Error(result?.error || 'Không tải được danh sách gợi ý.');
          }
          setResult({
            query,
            options: result.data.map((item) => endpoint === 'reader'
              ? {
                id: item.id,
                label: item.fullName || '',
                detail: [item.studentId, item.email].filter(Boolean).join(' · '),
                studentId: item.studentId,
                email: item.email,
              }
              : {
                id: item.id,
                label: item.title || '',
                detail: [
                  item.code,
                  item.availableCopies !== undefined
                    ? item.availableCopies > 0
                      ? `${item.availableCopies} bản sao sẵn sàng`
                      : 'Hết bản sao'
                    : null,
                ].filter(Boolean).join(' · '),
                code: item.code,
                sampleBarcode: item.sampleBarcode,
                availableCopies: item.availableCopies,
              }),
            error: null,
          });
        } catch (caught) {
          if (controller.signal.aborted) return;
          setResult({
            query,
            options: [],
            error: errorMessage(caught, 'Không tải được danh sách gợi ý.'),
          });
        }
      })();
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [endpoint, headers, query]);

  const isCurrentResult = result.query === query;
  const suggestions = isCurrentResult ? result.options : [];
  const isSearching = Boolean(query) && !isCurrentResult;
  const showFeedback = focused && Boolean(query);
  const FieldIcon = endpoint === 'reader' ? UserRound : BookOpen;

  const selectOption = (option: ReservationOption) => {
    onSelect(option);
    setFocused(false);
    setActiveIndex(-1);
  };

  return (
    <div
      className="circ-autocomplete"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {selected ? (
        <div className="circ-selected-option">
          <div className="circ-selected-option__icon"><Check size={18} /></div>
          <div className="circ-selected-option__content">
            <span>Đã chọn {label.toLowerCase()}</span>
            <strong>{selected.label}</strong>
            {selected.detail && <small>{selected.detail}</small>}
          </div>
          <button
            type="button"
            className="circ-selected-option__clear"
            onClick={() => {
              onClear();
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            <X size={15} />
            Đổi
          </button>
        </div>
      ) : (
        <>
          <label className="circ-field" htmlFor={listboxId}>
            <span className="circ-reservation-label">
              {step && <span className="circ-reservation-step">{step}</span>}
              {label}
            </span>
            <span className="circ-autocomplete-control">
              <FieldIcon size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                id={listboxId}
                value={value}
                placeholder={placeholder}
                autoComplete="off"
                role="combobox"
                aria-expanded={showFeedback && (suggestions.length > 0 || isSearching)}
                aria-autocomplete="list"
                aria-controls={`${listboxId}-options`}
                aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
                onFocus={() => setFocused(true)}
                onChange={(event) => {
                  setActiveIndex(-1);
                  onChange(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' && suggestions.length) {
                    event.preventDefault();
                    setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1));
                  } else if (event.key === 'ArrowUp' && suggestions.length) {
                    event.preventDefault();
                    setActiveIndex((index) => Math.max(index - 1, 0));
                  } else if (event.key === 'Enter' && activeIndex >= 0) {
                    event.preventDefault();
                    const option = suggestions[activeIndex];
                    if (option) selectOption(option);
                  } else if (event.key === 'Escape') {
                    setFocused(false);
                    setActiveIndex(-1);
                  }
                }}
              />
              {isSearching && <LoaderCircle className="spin" size={17} aria-label="Đang tìm" />}
            </span>
          </label>
          {showFeedback && (
            <div className="circ-autocomplete-options" role="listbox" id={`${listboxId}-options`}>
              {isSearching ? (
                <p className="circ-autocomplete-feedback">
                  <LoaderCircle className="spin" size={16} /> Đang tìm trong thư viện...
                </p>
              ) : result.error ? (
                <p className="circ-autocomplete-feedback is-error" role="alert">{result.error}</p>
              ) : suggestions.length ? (
                suggestions.map((option, index) => (
                  <button
                    type="button"
                    role="option"
                    id={`${listboxId}-option-${index}`}
                    aria-selected={index === activeIndex}
                    key={option.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectOption(option)}
                  >
                    <strong>{option.label}</strong>
                    {option.detail && <small>{option.detail}</small>}
                  </button>
                ))
              ) : (
                <p className="circ-autocomplete-feedback">Không tìm thấy kết quả phù hợp.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
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
        <div>
          <div className="lib-circ-eyebrow">
            <HeroIcon size={14} />
            <span>KHÔNG GIAN THỦ THƯ • QUẢN LÝ DỊCH VỤ</span>
          </div>
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
    </>
  );
}

function CirculationConfirmDialog({
  eyebrow,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  eyebrow: string;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="circ-payment-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="circ-payment-dialog circ-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="circ-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <p>{eyebrow}</p>
        <h2 id="circ-confirm-title">{title}</h2>
        <span>{message}</span>
        <div className="circ-payment-options circ-confirm-actions">
          <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={onConfirm}>
            {busy && <LoaderCircle className="spin" size={14} />}
            {confirmLabel}
          </button>
          <button type="button" className="circ-btn" disabled={busy} onClick={onCancel}>Hủy</button>
        </div>
      </section>
    </div>
  );
}

function LoansView() {
  const headers = useCirculationAuth();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const [params, setParams] = useSearchParams();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [list, setList] = useState<LoanList | null>(null);
  const [pending, setPending] = useState<CirculationLoan[]>([]);
  const [pendingSearch, setPendingSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CirculationLoan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const search = params.get('q') ?? '';
  const borrowedFrom = params.get('borrowedFrom') ?? '';
  const borrowedTo = params.get('borrowedTo') ?? '';
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
      const query = new URLSearchParams({ page: String(page), pageSize: '20', status: 'Borrowed' });
      if (search.trim()) query.set('search', search.trim());
      if (borrowedFrom) query.set('borrowedFrom', borrowedFrom);
      if (borrowedTo) query.set('borrowedTo', borrowedTo);
      const listRes = await fetch(`${API_BASE_URL}/api/v1/circulation/loans?${query}`, { headers });
      const listJson = await parseApiResponse<ApiResult<LoanList>>(listRes);
      if (!listRes.ok || !listJson?.success || !listJson.data) throw new Error(listJson?.error || 'Không tải được danh sách mượn.');
      setError(null);
      setList(listJson.data);
    } catch (err) {
      const message = errorMessage(err, 'Lỗi tải dữ liệu.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được danh sách mượn', message });
    } finally {
      setLoading(false);
    }
  }, [borrowedFrom, borrowedTo, headers, page, search, showToast]);

  const loadDashboard = useCallback(async () => {
    try {
      const [statsRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/pending`, { headers }),
      ]);
      const [statsJson, pendingJson] = await Promise.all([
        parseApiResponse<ApiResult<CirculationStats>>(statsRes),
        parseApiResponse<ApiResult<CirculationLoan[]>>(pendingRes),
      ]);
      if (statsRes.ok && statsJson?.success) setStats(statsJson.data ?? null);
      if (pendingRes.ok && pendingJson?.success) setPending(pendingJson.data ?? []);
    } catch (err) {
      const message = errorMessage(err, 'Không tải được thông tin tổng quan.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được thông tin tổng quan', message });
    }
  }, [headers, showToast]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => { void Promise.resolve().then(loadDashboard); }, [loadDashboard]);

  const refreshRef = useRef(() => {
    void load();
    void loadDashboard();
  });
  useEffect(() => {
    refreshRef.current = () => {
      void load();
      void loadDashboard();
    };
  }, [load, loadDashboard]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let active = true;
    const hub = new HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/notifications`, { accessTokenFactory: () => accessToken })
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    hub.on('BorrowRequestUpdated', () => {
      if (active) refreshRef.current();
    });
    hub.onreconnected(() => {
      if (active) refreshRef.current();
    });
    void hub.start().catch((caught: unknown) => {
      if (active) {
        const message = errorMessage(caught, 'Không kết nối được cập nhật mượn sách thời gian thực.');
        setError(message);
        showToast({ type: 'error', title: 'Lỗi kết nối realtime', message });
      }
    });
    return () => {
      active = false;
      void hub.stop();
    };
  }, [accessToken, showToast]);

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
      const message = json.meta?.message || 'Đã cập nhật.';
      setMessage(message);
      showToast({ type: 'success', title: 'Thao tác thành công', message });
      await load();
      await loadDashboard();
    } catch (err) {
      const message = errorMessage(err, 'Thao tác thất bại.');
      setError(message);
      showToast({ type: 'error', title: 'Thao tác thất bại', message });
    } finally {
      setBusy(false);
    }
  };

  const pendingTerm = pendingSearch.trim().toLocaleLowerCase('vi');
  const filteredPending = pending.filter((item) => [
    item.readerName,
    item.readerEmail,
    item.studentId,
    item.bookTitle,
    item.barcode,
    item.code,
  ].some((value) => value?.toLocaleLowerCase('vi').includes(pendingTerm)));

  return (
    <section className="circ-page circ-page--loans">
      <Chrome tab="loans" stats={stats} loading={loading} />
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}

      <section className="circ-card circ-pending-card">
        <div className="circ-card-head">
          <div>
            <h2>Yêu cầu chờ xử lý</h2>
            <p className="circ-card-subtitle">Tiếp nhận yêu cầu và xác nhận giao sách tại quầy.</p>
          </div>
          <div className="circ-pending-tools">
            <span className="circ-count">{filteredPending.length} / {pending.length} yêu cầu</span>
            <Link className="circ-btn circ-btn--primary" to="/librarian/circulation/direct-borrow">Mượn tại quầy</Link>
          </div>
        </div>
        <div className="circ-pending-search">
          <DebouncedSearchInput
            value={pendingSearch}
            onSearch={setPendingSearch}
          />
        </div>
        {loading && !pending.length ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải yêu cầu...</p>
        ) : !filteredPending.length ? (
          <p className="circ-empty">{pendingSearch.trim() ? 'Không tìm thấy yêu cầu phù hợp.' : 'Không có yêu cầu chờ xử lý.'}</p>
        ) : (
          <div className="circ-table-wrap circ-request-table-wrap">
            <table className="circ-table circ-request-table">
              <thead>
                <tr>
                  <th>Độc giả</th>
                  <th>Sách / bản sao</th>
                  <th>Lịch nhận</th>
                  <th>Tiếp nhận</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="circ-reader">
                        <span className="circ-avatar">{initials(item.readerName)}</span>
                        <span className="circ-request-reader-info">
                          <strong>{item.readerName}</strong>
                          <small>{item.studentId || item.readerEmail || 'Chưa có mã độc giả'}</small>
                        </span>
                      </span>
                    </td>
                    <td className="circ-request-book-cell">
                      <strong>{item.bookTitle}</strong>
                      <small>Mã bản sao: {item.barcode}</small>
                    </td>
                    <td>{formatDateTime(item.pickupAt)}</td>
                    <td>
                      {item.status === 'Approved' ? (
                        <span className="circ-request-accepted-info">
                          <strong>{item.librarianName || 'Thủ thư'}</strong>
                          <small>{formatDateTime(item.acceptedAt)}</small>
                        </span>
                      ) : <span className="circ-request-pending-info">Chưa tiếp nhận</span>}
                    </td>
                    <td>
                      <span className={`circ-badge is-${item.status.toLowerCase()}`}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>
                      <div className="circ-request-actions">
                        {item.status === 'Pending' ? (
                          <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${item.id}/approve`)}>Tiếp nhận</button>
                        ) : (
                          <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${item.id}/checkout`)}>Giao sách</button>
                        )}
                        <button type="button" className="circ-btn circ-btn--quiet" disabled={busy} onClick={() => void post(`/api/v1/circulation/loans/${item.id}/reject`)}>Từ chối</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="circ-layout circ-layout--loans">
        <div className="circ-main">
          <div className="circ-card">
            <div className="circ-card-head">
              <h2>Danh sách mượn sách</h2>
              <div className="circ-toolbar">
                <DebouncedSearchInput key={search} value={search} onSearch={(value) => setFilter('q', value)} />
                <label className="circ-date-filter">Từ ngày
                  <input type="date" value={borrowedFrom} max={borrowedTo || undefined}
                    onChange={(event) => setFilter('borrowedFrom', event.target.value)} />
                </label>
                <label className="circ-date-filter">Đến ngày
                  <input type="date" value={borrowedTo} min={borrowedFrom || undefined}
                    onChange={(event) => setFilter('borrowedTo', event.target.value)} />
                </label>
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

        </div>
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

export function DirectCheckoutPage() {
  const headers = useCirculationAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [readerOption, setReaderOption] = useState<ReservationOption | null>(null);
  const [readerSearch, setReaderSearch] = useState('');
  const [bookOption, setBookOption] = useState<ReservationOption | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [borrowDays, setBorrowDays] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers });
        const result = await parseApiResponse<ApiResult<CirculationStats>>(response);
        if (response.ok && result?.success) {
          setBorrowDays(result.data?.borrowDays ?? 0);
        }
      } catch {
        setBorrowDays(null);
      }
    })();
  }, [headers]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const finalReaderKey = readerOption?.studentId || readerOption?.email || readerOption?.id || readerSearch.trim();
    if (!finalReaderKey) {
      setError('Vui lòng chọn hoặc nhập mã thẻ / thông tin độc giả.');
      return;
    }
    const finalBarcode = bookOption?.sampleBarcode || '';
    const finalBookId = bookOption?.id;

    if (!finalBarcode && !finalBookId && !bookSearch.trim()) {
      setError('Vui lòng chọn hoặc nhập tên đầu sách cần mượn.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/circulation/checkout`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          readerKey: finalReaderKey,
          barcode: finalBarcode || bookSearch.trim(),
          bookId: finalBookId,
        }),
      });
      const result = await parseApiResponse<ApiResult<unknown>>(response);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Không thể hoàn tất mượn sách.');
      }
      const msg = result.meta?.message || 'Đã lập phiếu mượn thành công.';
      setMessage(msg);
      showToast({ type: 'success', title: 'Mượn sách thành công', message: msg });
      setReaderOption(null);
      setReaderSearch('');
      setBookOption(null);
      setBookSearch('');
    } catch (caught) {
      const msg = errorMessage(caught, 'Không thể hoàn tất mượn sách.');
      setError(msg);
      showToast({ type: 'error', title: 'Không thể mượn sách', message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page circ-page--direct-checkout">
      <nav className="circ-crumb" aria-label="Breadcrumb">
        <Link to="/librarian/circulation/loans">Mượn sách</Link>
        <span>/</span>
        <strong>Mượn tại quầy</strong>
      </nav>
      <header className="circ-direct-heading">
        <div>
          <h1>Mượn sách tại quầy</h1>
          <p>Lập phiếu mượn trực tiếp sau khi xác minh độc giả và bản sao sách.</p>
        </div>
        <Link className="circ-btn" to="/librarian/circulation/loans">Quay lại danh sách</Link>
      </header>
      {message && (
        <div className="circ-banner is-ok">
          <p>{message}</p>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
            <button type="button" className="circ-btn" onClick={() => setMessage(null)}>Tiếp tục mượn sách</button>
            <button type="button" className="circ-btn circ-btn--primary" onClick={() => navigate('/librarian/circulation/loans')}>Xem danh sách mượn</button>
          </div>
        </div>
      )}
      {error && <p className="circ-banner is-err">{error}</p>}
      <form className="circ-card circ-direct-form" onSubmit={(event) => void submit(event)}>
        <ReservationAutocomplete
          label="Mã thẻ hoặc thông tin độc giả"
          step="BƯỚC 1"
          placeholder="Nhập mã thẻ, email, họ tên hoặc MSSV (ví dụ SE1...)"
          endpoint="reader"
          value={readerSearch}
          selected={readerOption}
          onChange={setReaderSearch}
          onSelect={(opt) => {
            setReaderOption(opt);
            setReaderSearch(opt.label);
          }}
          onClear={() => {
            setReaderOption(null);
            setReaderSearch('');
          }}
        />

        <ReservationAutocomplete
          label="Tên đầu sách"
          step="BƯỚC 2"
          placeholder="Nhập tên đầu sách, mã sách hoặc quét mã vạch bản sao..."
          endpoint="book"
          value={bookSearch}
          selected={bookOption}
          onChange={setBookSearch}
          onSelect={(opt) => {
            setBookOption(opt);
            setBookSearch(opt.label);
          }}
          onClear={() => {
            setBookOption(null);
            setBookSearch('');
          }}
        />

        <p className="circ-checkout-hint">
          {borrowDays && borrowDays > 0
            ? `Thời hạn mượn theo chính sách Admin: ${borrowDays} ngày. Hệ thống tự tính ngày đến hạn khi xác nhận.`
            : 'Thời hạn mượn và ngày đến hạn do Backend lấy từ chính sách Admin. Thủ thư không nhập số ngày riêng.'}
        </p>
        <button
          type="submit"
          className="circ-btn circ-btn--primary"
          disabled={busy || (!readerOption && !readerSearch.trim()) || (!bookOption && !bookSearch.trim())}
        >
          {busy ? <LoaderCircle className="spin" size={14} /> : null}
          {busy ? 'Đang xử lý...' : 'Xác nhận mượn sách'}
        </button>
      </form>
    </section>
  );
}

function ReturnView() {
  const headers = useCirculationAuth();
  const [params] = useSearchParams();
  const { showToast } = useToast();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [activity, setActivity] = useState<CirculationActivity[]>([]);
  const [selectedReader, setSelectedReader] = useState<ReservationOption | null>(null);
  const [readerSearch, setReaderSearch] = useState('');
  const [activeLoans, setActiveLoans] = useState<CirculationLoan[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [loansError, setLoansError] = useState<string | null>(null);
  const [conditions, setConditions] = useState<Record<string, string>>({});
  const [returningBarcode, setReturningBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState(params.get('barcode') ?? '');
  const [manualCondition, setManualCondition] = useState('Good');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, activityRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/activity`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const activityJson = await parseApiResponse<ApiResult<CirculationActivity[]>>(activityRes);
      if (!statsRes.ok || !statsJson?.success) throw new Error(statsJson?.error || 'Không tải được thống kê.');
      if (!activityRes.ok || !activityJson?.success) throw new Error(activityJson?.error || 'Không tải được giao dịch.');
      setStats(statsJson?.data ?? null);
      setActivity(activityJson?.data ?? []);
      setError(null);
    } catch (err) {
      const message = errorMessage(err, 'Không tải được dữ liệu trả sách.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được dữ liệu trả sách', message });
    } finally {
      setLoading(false);
    }
  }, [headers, showToast]);

  const fetchReaderLoans = useCallback(async (readerId: string) => {
    setLoadingLoans(true);
    setLoansError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/reader-active-loans?readerKey=${encodeURIComponent(readerId)}`, { headers });
      const json = await parseApiResponse<ApiResult<CirculationLoan[]>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không tải được danh sách sách đang mượn.');
      setActiveLoans(json.data || []);
    } catch (err) {
      setLoansError(errorMessage(err, 'Không tải được danh sách sách đang mượn.'));
    } finally {
      setLoadingLoans(false);
    }
  }, [headers]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    if (selectedReader) {
      void fetchReaderLoans(selectedReader.id);
    } else {
      setActiveLoans([]);
      setLoansError(null);
    }
  }, [selectedReader, fetchReaderLoans]);

  const returnBook = async (barcode: string, condition: string) => {
    setBusy(true);
    setReturningBarcode(barcode);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/return`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ barcode, condition }),
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Thao tác trả sách thất bại.');
      const msg = json.meta?.message || 'Đã ghi nhận trả sách thành công.';
      setMessage(msg);
      showToast({ type: 'success', title: 'Trả sách thành công', message: msg });
      await load();
      if (selectedReader) {
        await fetchReaderLoans(selectedReader.id);
      }
      setManualBarcode('');
    } catch (err) {
      const msg = errorMessage(err, 'Thao tác trả sách thất bại.');
      setError(msg);
      showToast({ type: 'error', title: 'Thao tác thất bại', message: msg });
    } finally {
      setBusy(false);
      setReturningBarcode(null);
    }
  };

  return (
    <section className="circ-page">
      <Chrome tab="return" stats={stats} loading={loading} />
      <div className="circ-toolbar-end">
        <span />
        <button type="button" className="circ-btn" disabled={loading || busy} onClick={() => void load()}>
          {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}

      <div className="circ-card circ-return-panel">
        <div className="circ-return-section-header">
          <div>
            <h2>Trả sách</h2>
            <p>Nhập thông tin độc giả để kiểm tra các cuốn sách đang mượn và chọn cuốn muốn trả, hoặc quét nhanh mã vạch.</p>
          </div>
        </div>

        {/* Bước 1: Chọn độc giả */}
        <div className="circ-return-reader-search">
          <ReservationAutocomplete
            label="Nhập tên độc giả, mã thẻ hoặc MSSV"
            step="BƯỚC 1"
            placeholder="Tìm theo họ tên, mã sinh viên (ví dụ SE1...), email..."
            endpoint="reader"
            value={readerSearch}
            selected={selectedReader}
            onChange={setReaderSearch}
            onSelect={(opt) => {
              setSelectedReader(opt);
              setReaderSearch(opt.label);
            }}
            onClear={() => {
              setSelectedReader(null);
              setReaderSearch('');
              setActiveLoans([]);
            }}
          />
        </div>

        {/* Bước 2: Danh sách sách độc giả đang mượn */}
        {selectedReader && (
          <div className="circ-reader-loans-panel">
            <div className="circ-reader-loans-header">
              <h3>
                <BookOpen size={16} />
                Sách đang mượn ({activeLoans.length})
              </h3>
              <span>Độc giả: <strong>{selectedReader.label}</strong> {selectedReader.detail && `· ${selectedReader.detail}`}</span>
            </div>

            {loadingLoans ? (
              <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang kiểm tra sách độc giả đang mượn...</p>
            ) : loansError ? (
              <p className="circ-banner is-err">{loansError}</p>
            ) : activeLoans.length === 0 ? (
              <div className="circ-no-loans-box">
                <Check size={18} />
                <div>
                  <strong>Độc giả hiện không có sách nào đang mượn.</strong>
                  <p>Tất cả sách trước đó đã được hoàn trả đầy đủ vào thư viện.</p>
                </div>
              </div>
            ) : (
              <div className="circ-active-loans-grid">
                {activeLoans.map((loan) => {
                  const cond = conditions[loan.id] || 'Good';
                  const isProcessing = busy && returningBarcode === loan.barcode;
                  return (
                    <article className="circ-active-loan-card" key={loan.id}>
                      <div className="circ-loan-card-info">
                        <h4>{loan.bookTitle}</h4>
                        <div className="circ-loan-card-meta">
                          <span>Mã vạch: <strong>{loan.barcode}</strong></span>
                          <span>Mượn: {formatDate(loan.borrowDate)}</span>
                          <span>Hạn trả: <strong>{formatDate(loan.dueDate)}</strong></span>
                        </div>
                        <div className="circ-loan-card-status">
                          <span className={`circ-badge is-${loan.status.toLowerCase()}`}>
                            {loan.status === 'Overdue' ? `Quá hạn ${loan.overdueDays} ngày` : 'Đang mượn'}
                          </span>
                          {loan.overdueDays > 0 && loan.createdFineAmount ? (
                            <span className="circ-fine-tag">Phí dự kiến: {formatMoney(loan.createdFineAmount)}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="circ-loan-card-action">
                        <label className="circ-condition-select">
                          <span>Tình trạng khi trả:</span>
                          <select
                            value={cond}
                            disabled={busy}
                            onChange={(e) => setConditions((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                          >
                            <option value="Good">Bình thường</option>
                            <option value="Fair">Hơi cũ</option>
                            <option value="Damaged">Hư hỏng</option>
                            <option value="Lost">Thất lạc</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="circ-btn circ-btn--primary"
                          disabled={busy}
                          onClick={() => void returnBook(loan.barcode, cond)}
                        >
                          {isProcessing ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}
                          {isProcessing ? 'Đang ghi nhận...' : 'Ghi nhận trả sách'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quét mã vạch trực tiếp */}
        <details className="circ-quick-barcode-accordion">
          <summary>
            <span>Hoặc quét nhanh mã vạch bản sao</span>
          </summary>
          <form
            className="circ-quick-barcode-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (manualBarcode.trim()) void returnBook(manualBarcode.trim(), manualCondition);
            }}
          >
            <label className="circ-field">
              Mã vạch bản sao
              <input
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Quét hoặc nhập mã bản sao (ví dụ py01-01)"
              />
            </label>
            <label className="circ-field">
              Tình trạng khi trả
              <select value={manualCondition} onChange={(e) => setManualCondition(e.target.value)}>
                <option value="Good">Bình thường</option>
                <option value="Fair">Hơi cũ</option>
                <option value="Damaged">Hư hỏng</option>
                <option value="Lost">Thất lạc</option>
              </select>
            </label>
            <button type="submit" className="circ-btn circ-btn--primary" disabled={busy || !manualBarcode.trim()}>
              {busy ? <LoaderCircle className="spin" size={14} /> : null}
              {busy ? 'Đang ghi nhận...' : 'Ghi nhận trả theo mã vạch'}
            </button>
          </form>
        </details>
      </div>
      <div className="circ-card">
        <h2>Giao dịch gần đây</h2>
        {loading ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải giao dịch...</p>
        ) : !activity.length ? <p className="circ-empty">Chưa có giao dịch gần đây.</p> : (
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

function ReservationsView() {
  const headers = useCirculationAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [reservations, setReservations] = useState<CirculationReservation[]>([]);
  const [readerSearch, setReaderSearch] = useState('');
  const [readerOption, setReaderOption] = useState<ReservationOption | null>(null);
  const [bookSearch, setBookSearch] = useState('');
  const [bookOption, setBookOption] = useState<ReservationOption | null>(null);
  const [reservationSearch, setReservationSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, reservationRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/reservations`, { headers }),
      ]);
      const [statsJson, reservationJson] = await Promise.all([
        parseApiResponse<ApiResult<CirculationStats>>(statsRes),
        parseApiResponse<ApiResult<CirculationReservation[]>>(reservationRes),
      ]);
      if (!statsRes.ok || !statsJson?.success) throw new Error(statsJson?.error || 'Không tải được thống kê.');
      if (!reservationRes.ok || !reservationJson?.success) throw new Error(reservationJson?.error || 'Không tải được đặt chỗ.');
      setStats(statsJson.data ?? null);
      setReservations(reservationJson.data ?? []);
      setError(null);
    } catch (caught) {
      const message = errorMessage(caught, 'Không tải được dữ liệu đặt chỗ.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được dữ liệu đặt chỗ', message });
    } finally {
      setLoading(false);
    }
  }, [headers, showToast]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const filteredReservations = reservations.filter((item) => {
    const query = reservationSearch.trim().toLocaleLowerCase();
    return !query
      || item.readerName.toLocaleLowerCase().includes(query)
      || item.bookTitle.toLocaleLowerCase().includes(query);
  });

  const post = async (url: string, body?: object) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await parseApiResponse<ApiResult<unknown>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Thao tác thất bại.');
      const successMessage = result.meta?.message || 'Đã cập nhật.';
      setMessage(successMessage);
      showToast({ type: 'success', title: 'Cập nhật thành công', message: successMessage });
      await load();
      return true;
    } catch (caught) {
      const message = errorMessage(caught, 'Thao tác thất bại.');
      setError(message);
      showToast({ type: 'error', title: 'Thao tác thất bại', message });
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page circ-page--reservations">
      <Chrome tab="reservations" stats={stats} loading={loading} />
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}
      <section className="circ-card circ-reservation-create">
        <div className="circ-reservation-intro">
          <span className="circ-reservation-intro__icon"><Bookmark size={21} /></span>
          <div>
            <span className="circ-reservation-eyebrow">QUẢN LÝ HÀNG ĐỢI</span>
            <h2>Tạo đặt chỗ tại quầy</h2>
            <p>Tìm đúng độc giả và đầu sách để thêm yêu cầu vào hàng đợi.</p>
          </div>
        </div>
        <form
          className="circ-reservation-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readerOption || !bookOption) {
              setError('Chọn độc giả và đầu sách từ danh sách gợi ý trước khi tạo đặt chỗ.');
              return;
            }
            void post('/api/v1/circulation/reservations/by-book', {
              readerId: readerOption.id,
              bookId: bookOption.id,
            }).then((created) => {
              if (!created) return;
              setReaderSearch('');
              setReaderOption(null);
              setBookSearch('');
              setBookOption(null);
            });
          }}
        >
          <ReservationAutocomplete
            step="01"
            label="Tên độc giả hoặc mã sinh viên"
            value={readerSearch}
            selected={readerOption}
            placeholder="Nhập tên hoặc mã sinh viên (ví dụ: SE1)"
            endpoint="reader"
            onChange={(value) => {
              setReaderSearch(value);
              setReaderOption(null);
              setError(null);
            }}
            onSelect={(option) => {
              setReaderOption(option);
              setReaderSearch('');
              setError(null);
            }}
            onClear={() => setReaderOption(null)}
          />
          <ReservationAutocomplete
            step="02"
            label="Tên đầu sách"
            value={bookSearch}
            selected={bookOption}
            placeholder="Nhập tên đầu sách cần đặt trước"
            endpoint="book"
            onChange={(value) => {
              setBookSearch(value);
              setBookOption(null);
              setError(null);
            }}
            onSelect={(option) => {
              setBookOption(option);
              setBookSearch('');
              setError(null);
            }}
            onClear={() => setBookOption(null)}
          />
          <div className="circ-reservation-submit">
            <p className="circ-hint">Chỉ đặt trước khi không còn bản sao có thể mượn. Độc giả được thông báo khi sách sẵn sàng.</p>
            <button
              type="submit"
              className="circ-btn circ-btn--primary"
              disabled={busy || !readerOption || !bookOption}
            >
              {busy ? <LoaderCircle className="spin" size={16} /> : <Bookmark size={16} />}
              {busy ? 'Đang xử lý...' : 'Tạo đặt chỗ'}
            </button>
          </div>
        </form>
      </section>
      <section className="circ-card circ-reservation-queue">
        <div className="circ-card-head">
          <div>
            <h2>Danh sách đặt chỗ đang mở</h2>
            <p>Quản lý các yêu cầu đang chờ và theo dõi trạng thái phục vụ.</p>
          </div>
          <button type="button" className="circ-btn" disabled={loading || busy} onClick={() => void load()}>
            {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
            {loading ? 'Đang tải...' : 'Làm mới'}
          </button>
        </div>
        <div className="circ-reservation-toolbar">
          <label className="circ-reservation-search">
            <Search size={17} aria-hidden="true" />
            <input
              value={reservationSearch}
              onChange={(event) => setReservationSearch(event.target.value)}
              placeholder="Tìm theo độc giả hoặc đầu sách..."
              aria-label="Tìm đặt chỗ theo độc giả hoặc đầu sách"
            />
          </label>
          <span>{filteredReservations.length} / {reservations.length} yêu cầu</span>
        </div>
        {loading ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải đặt chỗ...</p>
        ) : !reservations.length ? (
          <p className="circ-empty">Không có đặt chỗ đang mở.</p>
        ) : !filteredReservations.length ? (
          <p className="circ-empty">Không có đặt chỗ nào khớp với từ khóa tìm kiếm.</p>
        ) : (
          <div className="circ-reservation-list">
            {filteredReservations.map((item) => (
              <div className="circ-reserve-row" key={item.id}>
                <div className="circ-reserve-row__people">
                  <b>{item.readerName}</b>
                  <small>{item.bookTitle}</small>
                </div>
                <span className={`circ-badge is-${item.status.toLowerCase()}`}>{reservationLabel(item.status)}</span>
                <small className="circ-reserve-expiry">
                  {item.expiresAt ? `Hết hạn: ${formatDateTime(item.expiresAt)}` : `Đặt lúc: ${formatDateTime(item.reservedAt)}`}
                </small>
                <button
                  type="button"
                  className="circ-btn circ-reserve-cancel"
                  disabled={busy}
                  onClick={() => void post(`/api/v1/circulation/reservations/${item.id}/cancel`)}
                >
                  Hủy đặt
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function OverdueView() {
  const headers = useCirculationAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [items, setItems] = useState<CirculationLoan[]>([]);
  const [incidents, setIncidents] = useState<CirculationIncident[]>([]);
  const [drafts, setDrafts] = useState<Record<string, IncidentDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [overdueLoadFailed, setOverdueLoadFailed] = useState(false);
  const [incidentLoadFailed, setIncidentLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fineToRecord, setFineToRecord] = useState<CirculationLoan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, overdueRes, incidentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/overdue`, { headers }),
        fetch(`${API_BASE_URL}/api/v1/circulation/incidents`, { headers }),
      ]);
      const statsJson = await parseApiResponse<ApiResult<CirculationStats>>(statsRes);
      const overdueJson = await parseApiResponse<ApiResult<CirculationLoan[]>>(overdueRes);
      const incidentJson = await parseApiResponse<ApiResult<CirculationIncident[]>>(incidentRes);
      const errors: string[] = [];
      if (statsRes.ok && statsJson?.success && statsJson.data) {
        setStats(statsJson.data ?? null);
      } else {
        setStats(null);
        errors.push(statsJson?.error || 'Không tải được chính sách phí.');
      }
      if (overdueRes.ok && overdueJson?.success && overdueJson.data) {
        setItems(overdueJson.data ?? []);
        setOverdueLoadFailed(false);
      } else {
        setOverdueLoadFailed(true);
        errors.push(overdueJson?.error || 'Không tải được sách quá hạn.');
      }
      if (incidentRes.ok && incidentJson?.success && incidentJson.data) {
        setIncidents(incidentJson.data ?? []);
        setIncidentLoadFailed(false);
      } else {
        setIncidentLoadFailed(true);
        errors.push(incidentJson?.error || 'Không tải được hồ sơ sự cố.');
      }
      const error = errors.length > 0 ? errors.join(' ') : null;
      setError(error);
      if (error) {
        showToast({ type: 'error', title: 'Dữ liệu quá hạn chưa đầy đủ', message: error });
      }
    } catch (err) {
      const message = errorMessage(err, 'Lỗi tải dữ liệu.');
      setOverdueLoadFailed(true);
      setIncidentLoadFailed(true);
      setError(message);
      showToast({ type: 'error', title: 'Không tải được dữ liệu quá hạn', message });
    } finally {
      setLoading(false);
    }
  }, [headers, showToast]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const initialDraftOf = (item: CirculationIncident): IncidentDraft => ({
    severity: item.kind === 'Lost' ? 'Lost' : 'Light',
    applyOverdue: item.overdueDays > 0 && (item.suggestedOverdueFine ?? 0) > 0,
    notes: '',
  });

  const draftOf = (item: CirculationIncident): IncidentDraft => drafts[item.id] ?? initialDraftOf(item);

  const patchDraft = (id: string, item: CirculationIncident, patch: Partial<IncidentDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? initialDraftOf(item)), ...patch },
    }));
  };

  const recordFine = async (loan: CirculationLoan) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/fines`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ borrowRecordId: loan.id }),
      });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không ghi nhận được phạt.');
      const message = json.meta?.message || 'Đã ghi nhận phạt.';
      setMessage(message);
      showToast({ type: 'success', title: 'Đã ghi nhận phí phạt', message });
      setFineToRecord(null);
      await load();
    } catch (err) {
      const message = errorMessage(err, 'Không ghi nhận được phạt.');
      setError(message);
      showToast({ type: 'error', title: 'Không ghi nhận được phí phạt', message });
    } finally {
      setBusy(false);
    }
  };

  const confirmIncident = async (item: CirculationIncident) => {
    const draft = draftOf(item);
    const expectedFee = policyIncidentFee(stats, draft.severity);
    if (!expectedFee || expectedFee <= 0) {
      const message = stats
        ? `Admin cần cấu hình ${draft.severity === 'Light' ? 'damage_fee' : 'lost_book_fee'} trong Chính sách > Phí phạt. Không ghi nhận số tiền do Thủ thư nhập tay.`
        : 'Chưa tải được cấu hình phí. Hãy làm mới trang trước khi xác nhận.';
      setError(message);
      showToast({ type: 'error', title: 'Thiếu chính sách phí', message });
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
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/incidents/${item.id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await parseApiResponse<ApiResult<CirculationIncident>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không xác nhận được hồ sơ.');
      const message = json.meta?.message || 'Đã xác nhận bồi thường.';
      setMessage(message);
      showToast({ type: 'success', title: 'Đã xác nhận hồ sơ', message });
      await load();
    } catch (err) {
      const message = errorMessage(err, 'Không xác nhận được hồ sơ.');
      setError(message);
      showToast({ type: 'error', title: 'Không xác nhận được hồ sơ', message });
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
      const message = json.meta?.message || 'Đã từ chối hồ sơ.';
      setMessage(message);
      showToast({ type: 'success', title: 'Đã xử lý hồ sơ', message });
      await load();
    } catch (err) {
      const message = errorMessage(err, 'Không từ chối được hồ sơ.');
      setError(message);
      showToast({ type: 'error', title: 'Không từ chối được hồ sơ', message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="circ-page circ-page--overdue">
      <Chrome tab="overdue" stats={stats} loading={loading} />
      <div className="circ-toolbar-end">
        <span />
        <button type="button" className="circ-btn" disabled={loading || busy} onClick={() => void load()}>
          {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
          {loading ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>
      {message && <p className="circ-banner is-ok">{message}</p>}
      {error && <p className="circ-banner is-err">{error}</p>}
      <div className="circ-card">
        <h2>Sách quá hạn</h2>
        {loading ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải danh sách quá hạn...</p>
        ) : overdueLoadFailed ? (
          <p className="circ-error" role="alert">Không thể xác định danh sách quá hạn. Hãy bấm “Làm mới” để thử lại.</p>
        ) : !items.length ? <p className="circ-empty">Không có sách quá hạn.</p> : (
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
                        <button
                          type="button"
                          className="circ-btn circ-btn--primary"
                          disabled={busy || !loan.suggestedFine || loan.suggestedFine <= 0}
                          title={loan.suggestedFine && loan.suggestedFine > 0
                            ? 'Tạo khoản phí quá hạn theo chính sách hiện hành'
                            : 'Admin cần cấu hình overdue_fee_per_day trong Chính sách > Phí phạt'}
                          onClick={() => setFineToRecord(loan)}
                        >
                          Ghi nhận phạt
                        </button>
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
        <p className="circ-hint">Đối chiếu sách và phiếu mượn trước khi xác nhận. Mức bồi thường lấy từ chính sách Admin.</p>
        {loading ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải hồ sơ sự cố...</p>
        ) : incidentLoadFailed ? (
          <p className="circ-error" role="alert">Không thể tải hồ sơ sự cố. Hãy bấm “Làm mới” để thử lại.</p>
        ) : !incidents.length ? <p className="circ-empty">Chưa có hồ sơ mất sách hoặc hư hỏng.</p> : incidents.map((item) => {
          const draft = draftOf(item);
          const amount = policyIncidentFee(stats, draft.severity);
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
              {item.description && pending && <p className="circ-incident-note">{item.description}</p>}
              {pending ? (
                <div className="circ-incident-form">
                  {item.kind === 'Lost' ? (
                    <div className="circ-field">
                      <span>Mức độ đã ghi nhận</span>
                      <div className="circ-incident-fixed-field">Mất sách, bồi thường giá trị tài liệu</div>
                    </div>
                  ) : (
                    <label className="circ-field">
                      Mức độ hư hỏng
                      <select value={draft.severity} onChange={(e) => patchDraft(item.id, item, { severity: e.target.value })}>
                        <option value="Light">Hư hỏng nhẹ, còn sử dụng được</option>
                        <option value="Severe">Hư hỏng nặng, cần bồi thường</option>
                      </select>
                    </label>
                  )}
                  <p className="circ-hint" role={amount > 0 ? undefined : 'status'}>
                    {amount > 0
                      ? `Dự kiến theo chính sách: ${formatMoney(amount)}${overdue ? ` + quá hạn ${formatMoney(overdue)} = ${formatMoney(amount + overdue)}` : ''}.`
                      : stats
                        ? `Chưa thể xác nhận: Admin cần cấu hình ${draft.severity === 'Light' ? 'damage_fee' : 'lost_book_fee'} trong Chính sách > Phí phạt.`
                        : 'Chưa thể xác nhận vì chưa tải được chính sách phí. Hãy bấm “Làm mới” để thử lại.'}
                  </p>
                  {item.overdueDays > 0 && item.suggestedOverdueFine ? (
                    <label className="circ-check">
                      <input
                        type="checkbox"
                        checked={draft.applyOverdue}
                        onChange={(e) => patchDraft(item.id, item, { applyOverdue: e.target.checked })}
                      />
                      Cộng phí quá hạn {formatMoney(item.suggestedOverdueFine)}
                    </label>
                  ) : item.overdueDays > 0 ? (
                    <p className="circ-hint circ-hint--warning" role="status">
                      Phiếu trễ {item.overdueDays} ngày nhưng chưa có mức phí quá hạn hợp lệ. Kiểm tra chính sách `overdue_fee_per_day`.
                    </p>
                  ) : null}
                  <label className="circ-field">
                    Biên bản / ghi chú xác minh
                    <textarea
                      value={draft.notes}
                      onChange={(e) => patchDraft(item.id, item, { notes: e.target.value })}
                      placeholder="Ghi kết quả đối chiếu bản sao và phiếu mượn..."
                      rows={3}
                      maxLength={2000}
                      aria-label="Biên bản / ghi chú xác minh"
                    />
                  </label>
                  <div className="circ-actions">
                    <button
                      type="button"
                      className="circ-btn circ-btn--primary"
                      disabled={busy || amount <= 0}
                      title={amount > 0
                        ? 'Xác nhận hồ sơ và lập khoản phí theo chính sách'
                        : stats
                          ? `Admin cần cấu hình ${draft.severity === 'Light' ? 'damage_fee' : 'lost_book_fee'} trước khi xác nhận`
                          : 'Chưa tải được chính sách phí; hãy làm mới trang'}
                      onClick={() => void confirmIncident(item)}
                    >
                      Xác nhận bồi thường
                    </button>
                    <button type="button" className="circ-btn" disabled={busy} onClick={() => void rejectIncident(item)}>Từ chối / tìm thấy sách</button>
                    <Link className="circ-btn" to={tabPath('fines')}>Danh sách phí</Link>
                    {item.totalAmount <= 0 && (
                      <span className="circ-hint">Khoản bồi thường chỉ được lập sau khi xác nhận hồ sơ.</span>
                    )}
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
      {fineToRecord && (
        <CirculationConfirmDialog
          eyebrow="GHI NHẬN PHÍ QUÁ HẠN"
          title={`${fineToRecord.readerName} · ${fineToRecord.bookTitle}`}
          message={`Phí dự kiến theo chính sách: ${formatMoney(fineToRecord.suggestedFine ?? 0)}. Hệ thống sẽ tự tính lại theo chính sách Admin khi ghi nhận.`}
          confirmLabel="Ghi nhận phí"
          busy={busy}
          onConfirm={() => void recordFine(fineToRecord)}
          onCancel={() => setFineToRecord(null)}
        />
      )}
    </section>
  );
}

function FinesView() {
  const headers = useCirculationAuth();
  const { showToast } = useToast();
  const [stats, setStats] = useState<CirculationStats | null>(null);
  const [items, setItems] = useState<CirculationFine[]>([]);
  const [status, setStatus] = useState('All');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFine, setSelectedFine] = useState<CirculationFine | null>(null);
  const [cashConfirmation, setCashConfirmation] = useState<'cash' | 'cancel-payos' | null>(null);
  const [paymentCheckout, setPaymentCheckout] = useState<{
    fineId: string; amount: number; checkoutUrl: string; qrCode: string; expiresAt: string | null;
  } | null>(null);
  const paymentConfirmationNotified = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput), 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async (quiet = false, includePaidDuringCheckout = false) => {
    if (!quiet) setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'All' && !(includePaidDuringCheckout && status === 'Pending')) {
        query.set('status', status);
      }
      const fineRes = await fetch(`${API_BASE_URL}/api/v1/circulation/fines?${query}`, { headers });
      const fineJson = await parseApiResponse<ApiResult<CirculationFine[]>>(fineRes);
      if (!fineRes.ok || !fineJson?.success) throw new Error(fineJson?.error || 'Không tải được phí phạt.');
      setError(null);
      setItems(fineJson.data ?? []);
    } catch (err) {
      const message = errorMessage(err, 'Lỗi tải dữ liệu.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được danh sách phí phạt', message });
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [headers, search, showToast, status]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/circulation/stats`, { headers });
      const result = await parseApiResponse<ApiResult<CirculationStats>>(response);
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Không tải được thống kê.');
      setStats(result.data ?? null);
    } catch (err) {
      const message = errorMessage(err, 'Không tải được thống kê.');
      setError(message);
      showToast({ type: 'error', title: 'Không tải được thống kê', message });
    }
  }, [headers, showToast]);

  useEffect(() => { void Promise.resolve().then(loadStats); }, [loadStats]);

  const payCash = async (id: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/circulation/fines/${id}/pay/cash`, { method: 'POST', headers });
      const json = await parseApiResponse<ApiResult<unknown>>(res);
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Không ghi nhận thanh toán.');
      const message = json.meta?.message || 'Đã ghi nhận thanh toán tiền mặt.';
      setMessage(message);
      showToast({ type: 'success', title: 'Đã ghi nhận thanh toán', message });
      setSelectedFine(null);
      setPaymentCheckout(null);
      setCashConfirmation(null);
      await Promise.all([load(), loadStats()]);
    } catch (err) {
      const message = errorMessage(err, 'Không ghi nhận thanh toán.');
      setError(message);
      showToast({ type: 'error', title: 'Không ghi nhận thanh toán', message });
    } finally {
      setBusy(false);
    }
  };

  const createPayOSCheckout = async (fine: CirculationFine) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/circulation/fines/${fine.id}/pay/payos`, {
        method: 'POST',
        headers,
      });
      const result = await parseApiResponse<ApiResult<{
        fineId: string; amount: number; checkoutUrl: string; qrCode: string; expiresAt: string | null;
      }>>(response);
      if (!response.ok || !result?.success || !result.data) {
        throw new Error(result?.error || 'Không thể tạo thanh toán PayOS.');
      }
      setPaymentCheckout(result.data);
      await load();
    } catch (err) {
      const message = errorMessage(err, 'Không thể tạo thanh toán PayOS.');
      setError(message);
      showToast({ type: 'error', title: 'Không thể tạo thanh toán PayOS', message });
    } finally {
      setBusy(false);
    }
  };

  const checkoutFine = paymentCheckout
    ? items.find((fine) => fine.id === paymentCheckout.fineId)
    : undefined;
  const paymentConfirmed = checkoutFine?.status === 'Paid';

  useEffect(() => {
    if (!paymentCheckout || paymentConfirmed) return undefined;
    const timer = window.setInterval(() => void load(true, true), 5000);
    return () => window.clearInterval(timer);
  }, [load, paymentCheckout, paymentConfirmed]);

  useEffect(() => {
    if (!paymentCheckout || !paymentConfirmed
      || paymentConfirmationNotified.current === paymentCheckout.fineId) return;
    paymentConfirmationNotified.current = paymentCheckout.fineId;
    showToast({
      type: 'success',
      title: 'Đã xác nhận thanh toán',
      message: 'PayOS đã xác nhận giao dịch.',
    });
    void Promise.all([load(), loadStats()]);
  }, [load, loadStats, paymentCheckout, paymentConfirmed, showToast]);

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
            <button
              type="button"
              className="circ-btn"
              disabled={loading || busy}
              onClick={() => void Promise.all([load(), loadStats()])}
            >
              {loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
              {loading ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="circ-empty"><LoaderCircle className="spin" size={16} /> Đang tải danh sách phí phạt...</p>
        ) : !items.length ? <p className="circ-empty">Chưa có khoản phạt.</p> : (
          <div className="circ-table-wrap">
            <table className="circ-table">
              <thead>
                <tr>
                  <th>Mã</th><th>Độc giả</th><th>Sách</th><th>Lý do</th><th>Số tiền</th><th>Ngày</th><th>Phương thức</th><th>Trạng thái</th><th>Thao tác</th>
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
                      {fine.paymentMethod === 'Cash' ? 'Tiền mặt' : fine.paymentMethod === 'PayOS' ? 'PayOS' : '—'}
                      {fine.paymentReference && <small className="circ-payment-reference">{fine.paymentReference}</small>}
                    </td>
                    <td>
                      <span className={`circ-badge is-${fine.status.toLowerCase()}`}>
                        {fine.status === 'Pending' ? 'Chưa thanh toán' : (STATUS_LABELS[fine.status] ?? fine.status)}
                      </span>
                      {fine.reconciliationRequired && <small className="circ-reconciliation-warning">Cần đối soát giao dịch</small>}
                    </td>
                    <td>
                      {fine.status === 'Pending' ? (
                        <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => { setSelectedFine(fine); setPaymentCheckout(null); }}>Ghi nhận thanh toán</button>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedFine && !paymentConfirmed && (
        <div className="circ-payment-backdrop" role="presentation" onClick={() => { setSelectedFine(null); setCashConfirmation(null); setPaymentCheckout(null); }}>
          <section
            className="circ-payment-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="circ-payment-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="circ-payment-close" aria-label="Đóng" onClick={() => { setSelectedFine(null); setCashConfirmation(null); setPaymentCheckout(null); }}>×</button>
            <p>GHI NHẬN THANH TOÁN · {selectedFine.code}</p>
            <h2 id="circ-payment-title">{selectedFine.readerName}</h2>
            <strong className="circ-payment-amount">{formatMoney(selectedFine.amount)}</strong>
            {!paymentCheckout ? (
              <div className="circ-payment-options">
                <button type="button" className="circ-btn circ-btn--primary" disabled={busy} onClick={() => void createPayOSCheckout(selectedFine)}>
                  Tạo mã QR PayOS
                </button>
                <button type="button" className="circ-btn" disabled={busy} onClick={() => setCashConfirmation('cash')}>
                  Xác nhận đã nhận tiền mặt
                </button>
              </div>
            ) : (
              <>
                <QRCodeCanvas value={paymentCheckout.qrCode} size={220} level="M" includeMargin />
                <span>Đợi PayOS xác nhận trước khi hoàn tất. Không xác nhận tiền mặt cho cùng khoản này.</span>
                <a href={paymentCheckout.checkoutUrl} target="_blank" rel="noreferrer">Mở trang thanh toán PayOS</a>
                <button type="button" className="circ-btn" disabled={busy} onClick={() => setCashConfirmation('cancel-payos')}>
                  Hủy link PayOS và ghi nhận tiền mặt
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {selectedFine && cashConfirmation && (
        <CirculationConfirmDialog
          eyebrow={cashConfirmation === 'cancel-payos' ? 'CHUYỂN SANG TIỀN MẶT' : 'THU TIỀN MẶT TẠI QUẦY'}
          title={`Xác nhận ${formatMoney(selectedFine.amount)}?`}
          message={cashConfirmation === 'cancel-payos'
            ? 'Chỉ xác nhận nếu đã nhận đủ tiền mặt. Hệ thống sẽ yêu cầu PayOS hủy liên kết đang chờ trước khi ghi nhận thanh toán tiền mặt.'
            : 'Chỉ tiếp tục sau khi đã nhận đủ tiền mặt từ độc giả. Giao dịch sẽ được lưu riêng với phương thức Tiền mặt trong báo cáo.'}
          confirmLabel={cashConfirmation === 'cancel-payos' ? 'Hủy PayOS và ghi nhận' : 'Đã nhận tiền mặt'}
          busy={busy}
          onConfirm={() => void payCash(selectedFine.id)}
          onCancel={() => setCashConfirmation(null)}
        />
      )}
    </section>
  );
}

const VIEWS = {
  loans: LoansView,
  return: ReturnView,
  reservations: ReservationsView,
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
