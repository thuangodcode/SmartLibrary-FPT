import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, LoaderCircle, Save, Search, Sparkles } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import { useHomeCategories } from '../../home/hooks/useHomeData';
import AiConfirmDialog from '../../ai/components/AiConfirmDialog';
import { findProvider, formatAiTime } from '../../ai/aiProviders';
import {
  askRag,
  getAcquisitionSuggestions,
  getAiSettings,
  getLibrarianWorkspace,
  markMyAiForLibrary,
  reindexRag,
  saveLibrarianAiSettings,
  type AiCriterion,
  type AiLibrarianWorkspace,
  type AiSettingsStatus,
  type RagAskResult,
  type RagSource,
} from '../../ai/aiApi';
import AiProviderKeyForm from '../../ai/components/AiProviderKeyForm';
import '../../admin/pages/AdminAiSettingsPage.css';
import './LibrarianAiPage.css';

type CriterionFlag = 'useMajor' | 'useCategory' | 'useHistory' | 'useReviews' | 'useGoals';

const SENSITIVE_ERROR = /api[_-]?key|bearer|authorization|token|secret|password|encrypted/i;

function flagsFromStatus(status: AiSettingsStatus | null): Record<CriterionFlag, boolean> {
  return {
    useMajor: status?.useMajor !== false,
    useCategory: status?.useCategory !== false,
    useHistory: status?.useHistory !== false,
    useReviews: status?.useReviews !== false,
    useGoals: status?.useGoals !== false,
  };
}

function friendlySaveError(error: unknown): string {
  const fallback = 'Đã xảy ra lỗi khi cập nhật. Vui lòng thử lại.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Mất kết nối mạng. Kiểm tra internet rồi thử lại.';
  }
  const message = error instanceof Error ? error.message.trim() : '';
  if (!message) return fallback;
  if (/failed to fetch|networkerror|load failed|err_internet|err_connection|network request failed/i.test(message)) {
    return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
  }
  if (SENSITIVE_ERROR.test(message) || message.length > 180) return fallback;
  return message;
}

const CRITERION_DEFS: Array<{ id: string; flag: CriterionFlag; label: string; hint: string }> = [
  { id: 'major', flag: 'useMajor', label: 'Chuyên ngành của độc giả', hint: 'Ưu tiên sách đúng ngành học' },
  { id: 'category', flag: 'useCategory', label: 'Thể loại sách', hint: 'Ưu tiên danh mục đang được mượn' },
  { id: 'history', flag: 'useHistory', label: 'Lịch sử đọc', hint: 'Dựa trên phiếu mượn thực tế' },
  { id: 'review', flag: 'useReviews', label: 'Lượt đánh giá và phản hồi', hint: 'Ưu tiên sách được đánh giá tốt' },
  { id: 'goal', flag: 'useGoals', label: 'Mục tiêu học tập', hint: 'Dựa trên sở thích đọc đã lưu' },
];

const LibrarianAiPage = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const navigate = useNavigate();
  const { showToast, dismissToast } = useToast();
  const categoriesQuery = useHomeCategories();
  const [status, setStatus] = useState<AiSettingsStatus | null>(null);
  const [workspace, setWorkspace] = useState<AiLibrarianWorkspace | null>(null);
  const [loadedToken, setLoadedToken] = useState<string | null>(null);
  const loading = Boolean(accessToken) && loadedToken !== accessToken;
  const [error, setError] = useState<string | null>(accessToken ? null : 'Vui lòng đăng nhập thủ thư.');
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<RagAskResult | null>(null);
  const [question, setQuestion] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<RagAskResult | null>(null);
  const [statsRange, setStatsRange] = useState('30');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [loadedWorkspaceKey, setLoadedWorkspaceKey] = useState<string | null>(null);
  const workspaceKey = `${accessToken ?? ''}:${statsRange}`;
  const workspaceLoading = Boolean(accessToken) && loadedWorkspaceKey !== workspaceKey;
  const [flags, setFlags] = useState<Record<CriterionFlag, boolean>>(flagsFromStatus(null));
  const [justSaved, setJustSaved] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const saveToastId = useRef<string | null>(null);
  const savingRef = useRef(false);

  const connected = Boolean(status?.hasApiKey && status.isEnabled && status.accountEnabled !== false);
  const connectionText = status?.accountEnabled === false
    ? 'Admin đã tắt quyền AI của tài khoản này. Không thể tự bật lại.'
    : !status?.hasApiKey
      ? 'Chưa cấu hình API Key. Nhập khóa bên dưới trước khi dùng tìm kiếm ngữ nghĩa, RAG và gợi ý sách.'
      : !status.isEnabled
        ? 'Hệ thống AI đang tắt. Liên hệ Admin để bật. Cấu hình cá nhân không ghi đè chính sách này.'
        : status.lastTestOk === false
          ? `Kết nối AI đang lỗi: ${status.lastTestMessage || 'không rõ nguyên nhân'}.`
          : 'Đang dùng API Key và model của tài khoản thủ thư này.';

  const applyStatus = (next: AiSettingsStatus) => {
    setStatus(next);
    setFlags(flagsFromStatus(next));
  };

  const dirty = Boolean(status) && CRITERION_DEFS.some((item) => flags[item.flag] !== flagsFromStatus(status)[item.flag]);
  const saveHint = dirty ? 'dirty' : justSaved ? 'saved' : null;

  useEffect(() => {
    if (!accessToken) return;
    void getAiSettings(accessToken)
      .then((next) => {
        applyStatus(next);
        setError(null);
      })
      .catch((loadError: unknown) => {
        setError(loadError instanceof Error ? loadError.message : 'Không tải được trạng thái AI.');
      })
      .finally(() => setLoadedToken(accessToken));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void getLibrarianWorkspace(accessToken, Number(statsRange))
      .then((next) => {
        if (cancelled) return;
        setWorkspace(next);
        setWorkspaceError(null);
        setLoadedWorkspaceKey(workspaceKey);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setWorkspace(null);
        setWorkspaceError(loadError instanceof Error ? loadError.message : 'Không tải được dữ liệu nghiệp vụ.');
        setLoadedWorkspaceKey(workspaceKey);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, statsRange, workspaceKey]);

  const notifySave = (toast: Parameters<typeof showToast>[0]) => {
    if (saveToastId.current) dismissToast(saveToastId.current);
    saveToastId.current = showToast(toast);
  };

  const markLibrary = async () => {
    if (!accessToken) return;
    setLibraryBusy(true);
    try {
      applyStatus(await markMyAiForLibrary(accessToken));
      showToast({
        type: 'success',
        title: 'Đã dùng cho độc giả',
        message: 'Cấu hình này sẽ phục vụ tìm kiếm và gợi ý của độc giả. Đồng bộ RAG nếu vừa đổi model embedding.',
      });
    } catch (libraryError) {
      showToast({
        type: 'error',
        title: 'Không đặt được cấu hình thư viện',
        message: libraryError instanceof Error ? libraryError.message : 'Lỗi không xác định.',
      });
    } finally {
      setLibraryBusy(false);
    }
  };

  const reindex = async () => {
    if (!accessToken) return;
    setReindexing(true);
    try {
      const result = await reindexRag(accessToken);
      setStatus((current) => current
        ? { ...current, documentCount: result.documentCount, documentsSyncedAt: result.syncedAt, needsReindex: false }
        : current);
      showToast({
        type: result.failed ? 'error' : 'success',
        title: 'Đã đồng bộ RAG',
        message: `Sách ${result.booksIndexed}, chính sách ${result.policiesIndexed}, lỗi ${result.failed}.`,
      });
    } catch (reindexError) {
      showToast({
        type: 'error',
        title: 'Không đồng bộ được RAG',
        message: reindexError instanceof Error ? reindexError.message : 'Lỗi không xác định.',
      });
    } finally {
      setReindexing(false);
    }
  };

  const saveSettings = async () => {
    if (!accessToken || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      applyStatus(await saveLibrarianAiSettings(accessToken, {
        librarianAiEnabled: Boolean(status?.librarianAiEnabled),
        ...flags,
      }));
      setJustSaved(true);
      setConfirm(null);
      notifySave({
        type: 'success',
        title: 'Đã lưu thiết lập AI',
        message: 'Các thay đổi của bạn đã được cập nhật thành công.',
        duration: 3500,
      });
    } catch (saveError) {
      notifySave({
        type: 'error',
        title: 'Không thể lưu thiết lập',
        message: friendlySaveError(saveError),
        duration: 8000,
        action: {
          label: 'Thử lại',
          onClick: () => { void saveSettings(); },
        },
      });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const previewSuggestions = async () => {
    if (!accessToken) return;
    if (!status?.isEnabled || !status.librarianAiEnabled) {
      showToast({
        type: 'error',
        title: 'Chưa bật gợi ý',
        message: 'Admin cần bật hệ thống AI và gợi ý nhập sách trước khi xem thử.',
      });
      return;
    }
    setPreviewing(true);
    try {
      setPreview(await getAcquisitionSuggestions(accessToken));
    } catch (previewError) {
      setPreview(null);
      showToast({
        type: 'error',
        title: 'Không xem thử được',
        message: previewError instanceof Error ? previewError.message : 'Lỗi không xác định.',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    if (question.trim().length < 3) {
      setSearchError('Câu hỏi cần ít nhất 3 ký tự.');
      return;
    }
    if (!status?.isEnabled) {
      setSearchError('Hệ thống AI đang tắt. Liên hệ Admin để bật.');
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const categoryName = categoriesQuery.data?.find((item) => item.id === categoryId)?.name;
      const payload = categoryName
        ? `Trong danh mục “${categoryName}”: ${question.trim()}`
        : question.trim();
      setSearchResult(await askRag(accessToken, payload));
    } catch (askError) {
      setSearchResult(null);
      setSearchError(askError instanceof Error ? askError.message : 'Không tìm kiếm được.');
    } finally {
      setSearching(false);
    }
  };

  const criteria = useMemo(() => {
    const counts = new Map((workspace?.criteria ?? []).map((item: AiCriterion) => [item.id, item]));
    return CRITERION_DEFS.map((item) => {
      const live = counts.get(item.id);
      return {
        ...item,
        count: live?.count ?? 0,
        detail: live?.detail || item.hint,
        hasData: Boolean(live?.hasData),
        enabled: flags[item.flag],
      };
    });
  }, [workspace, flags]);

  const bookHits = (searchResult?.sources ?? []).filter((item) => item.sourceType === 'book');
  const trends = workspace?.trends;

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onDocumentClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(`${url.pathname}${url.search}${url.hash}`);
      setConfirm('leave');
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onDocumentClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, [dirty]);

  return (
    <section className="ai-biz">
      <nav className="ai-biz-crumb" aria-label="Đường dẫn">
        <Link to="/librarian">Trang chủ</Link>
        <span>/</span>
        <span>Cấu hình AI</span>
        <span>/</span>
        <strong>Thiết lập nghiệp vụ AI</strong>
      </nav>

      <header className="ai-biz-head">
        <div>
          <p>NGHIỆP VỤ THƯ VIỆN</p>
          <h1>Thiết lập AI nghiệp vụ</h1>
          <span>Nhập API Key của bạn, chọn model, rồi dùng các chức năng AI được phân quyền.</span>
        </div>
        <div className={`ai-biz-pulse ${connected && status?.lastTestOk !== false ? 'is-ok' : 'is-warn'}`}>
          {connected && status?.lastTestOk !== false ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {connected ? 'AI sẵn sàng' : 'AI chưa sẵn sàng'}
        </div>
      </header>

      {loading ? (
        <div className="ai-biz-empty"><LoaderCircle className="ai-spin" size={20} /> Đang tải thiết lập…</div>
      ) : error ? (
        <div className="ai-biz-empty" role="alert">{error}</div>
      ) : (
        <>
          <section className="ai-biz-status" aria-live="polite">
            <p>{connectionText}</p>
            <dl>
              <div>
                <dt>Nhà cung cấp</dt>
                <dd>{findProvider(status?.provider || 'gemini').name}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>{status?.chatModel || 'Chưa có'}</dd>
              </div>
              <div>
                <dt>Kiểm tra gần nhất</dt>
                <dd>{formatAiTime(status?.lastTestedAt)}</dd>
              </div>
              <div>
                <dt>Kho RAG</dt>
                <dd>
                  {status?.documentCount ?? 0} tài liệu
                  {status?.needsReindex ? ' · cần lập chỉ mục lại' : ''}
                </dd>
              </div>
            </dl>
            <div className="ai-biz-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="ai-btn"
                disabled={libraryBusy || !status?.hasApiKey || status.accountEnabled === false}
                onClick={() => void markLibrary()}
              >
                {status?.useForLibrary ? 'Đang dùng cho độc giả' : 'Dùng cấu hình này cho độc giả'}
              </button>
              {status?.useForLibrary && (
                <button type="button" className="ai-btn" disabled={reindexing || !status.hasApiKey} onClick={() => void reindex()}>
                  {reindexing ? 'Đang đồng bộ…' : 'Đồng bộ dữ liệu RAG'}
                </button>
              )}
            </div>
          </section>

          {accessToken && status && (
            <AiProviderKeyForm accessToken={accessToken} status={status} onStatus={applyStatus} />
          )}

          <div className="ai-biz-grid">
            <section className="ai-biz-card">
              <h2><Sparkles size={16} /> Gợi ý sách phục vụ bạn đọc</h2>
              <p>Chỉnh tiêu chí rồi lưu. Dịch vụ do Admin bật. Tiêu chí này dùng cho gợi ý nhập sách và gợi ý độc giả.</p>
              <div className="ai-switch-row">
                <span>
                  <strong>Gợi ý nhập sách AI</strong>
                  <small>
                    {status?.librarianAiEnabled
                      ? 'Admin đã bật dịch vụ này. Thủ thư chỉ chỉnh tiêu chí bên dưới.'
                      : 'Admin đang tắt dịch vụ này. Liên hệ Admin để bật.'}
                  </small>
                </span>
                <button
                  type="button"
                  role="switch"
                  className={`ai-switch${status?.librarianAiEnabled ? ' is-on' : ''}`}
                  aria-checked={Boolean(status?.librarianAiEnabled)}
                  disabled
                  aria-label="Trạng thái gợi ý nhập sách AI do Admin quản lý"
                >
                  <span />
                </button>
              </div>

              <div className="ai-biz-criteria">
                <div className="ai-biz-criteria-head">
                  <h3>Tiêu chí gợi ý</h3>
                  {saveHint === 'dirty' && <span className="ai-biz-save-state is-dirty">Chưa lưu thay đổi</span>}
                  {saveHint === 'saved' && (
                    <span className="ai-biz-save-state is-saved"><CheckCircle2 size={13} /> Đã lưu</span>
                  )}
                </div>
                <ul>
                  {criteria.map((item) => (
                    <li key={item.id}>
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {workspaceError
                            ? item.hint
                            : item.hasData
                              ? item.detail
                              : 'Chưa có dữ liệu trong thư viện'}
                        </small>
                      </span>
                      <div className="ai-biz-criterion-side">
                        <em className={item.hasData ? 'is-ready' : ''}>
                          {workspaceError ? 'Chưa tải số liệu' : item.hasData ? `Đã nối · ${item.count}` : 'Chưa có dữ liệu'}
                        </em>
                        <button
                          type="button"
                          role="switch"
                          className={`ai-switch${item.enabled ? ' is-on' : ''}`}
                          aria-checked={item.enabled}
                          disabled={saving}
                          onClick={() => {
                            setJustSaved(false);
                            setFlags((current) => ({ ...current, [item.flag]: !current[item.flag] }));
                          }}
                          aria-label={`Bật ${item.label}`}
                        >
                          <span />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {workspace && workspace.topBorrowed.length > 0 && (
                <div className="ai-biz-result">
                  <h3>Sách đang được mượn nhiều</h3>
                  <ul>
                    {workspace.topBorrowed.map((book) => (
                      <li key={book.id}>
                        {book.title}
                        {book.borrowCount ? ` · ${book.borrowCount} lượt mượn` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="ai-biz-actions">
                <button
                  type="button"
                  className="ai-btn ai-btn--primary"
                  disabled={saving}
                  aria-busy={saving}
                  onClick={() => void saveSettings()}
                >
                  {saving ? <LoaderCircle className="ai-spin" size={14} /> : <Save size={14} />}
                  {saving ? 'Đang lưu...' : 'Lưu thiết lập'}
                </button>
                <button type="button" className="ai-btn" disabled={previewing} onClick={() => void previewSuggestions()}>
                  {previewing ? 'Đang phân tích…' : 'Xem thử kết quả gợi ý'}
                </button>
              </div>
              {preview && (
                <div className="ai-biz-result">
                  <p>{preview.answer}</p>
                  <BookSourceList sources={preview.sources} empty="Không có sách thật khớp tiêu chí hiện tại." />
                </div>
              )}
            </section>

            <section className="ai-biz-card">
              <h2><Search size={16} /> Tìm kiếm ngữ nghĩa</h2>
              <p>
                {(status?.documentCount ?? 0) > 0
                  ? 'Câu hỏi thực tế được tìm trong kho RAG. Kết quả sách hiện bên dưới.'
                  : 'Kho ngữ nghĩa chưa đồng bộ. Tìm thử sẽ dò trong danh mục sách hiện có của thư viện.'}
              </p>
              <form onSubmit={(event) => void runSearch(event)} className="ai-biz-search">
                <label>
                  Câu hỏi thử nghiệm
                  <textarea
                    rows={6}
                    value={question}
                    maxLength={4000}
                    placeholder="Ví dụ: Sinh viên kỳ 3 ngành SE muốn học Python từ đầu rồi đọc về kiến trúc phần mềm sạch để làm đồ án. Gợi ý sách thật trong thư viện và giải thích vì sao phù hợp."
                    onChange={(event) => setQuestion(event.target.value)}
                  />
                </label>
                <label>
                  Lọc theo thể loại
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="">Tất cả danh mục</option>
                    {(categoriesQuery.data ?? []).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="ai-btn ai-btn--primary" disabled={searching}>
                  {searching ? 'Đang tìm ngữ cảnh…' : 'Tìm thử'}
                </button>
              </form>
              {searching && (
                <p className="ai-biz-muted">
                  <LoaderCircle className="ai-spin" size={14} />
                  {(status?.documentCount ?? 0) > 0 ? ' Đang truy vấn RAG…' : ' Đang tìm trong danh mục sách…'}
                </p>
              )}
              {searchError && <p className="ai-biz-error" role="alert">{searchError}</p>}
              {!searching && searchResult && bookHits.length === 0 && (
                <p className="ai-biz-blank">Không tìm thấy sách phù hợp.</p>
              )}
              {searchResult && (
                <div className="ai-biz-result">
                  <p>{searchResult.answer}</p>
                  {bookHits.length > 0 && <BookSourceList sources={searchResult.sources} />}
                </div>
              )}
            </section>
          </div>

          <section className="ai-biz-card">
            <div className="ai-biz-card-head">
              <div>
                <h2>Thống kê lưu thông phục vụ AI</h2>
                <p>
                  Số liệu lấy từ phiếu mượn thật khi Admin bật phân tích xu hướng.
                  {status?.trendsEnabled ? '' : ' Admin đang tắt phân tích xu hướng đọc.'}
                  {status?.overduePredictEnabled ? '' : ' Cảnh báo quá hạn đang tắt.'}
                </p>
              </div>
              <label>
                Khoảng thời gian
                <select
                  value={statsRange}
                  disabled={workspaceLoading}
                  onChange={(event) => setStatsRange(event.target.value)}
                >
                  <option value="7">7 ngày</option>
                  <option value="30">30 ngày</option>
                  <option value="90">90 ngày</option>
                </select>
              </label>
            </div>
            {workspaceLoading && !trends ? (
              <div className="ai-biz-blank"><LoaderCircle className="ai-spin" size={18} /> Đang tải số liệu lưu thông…</div>
            ) : workspaceError ? (
              <div className="ai-biz-blank" role="status">
                Dịch vụ thống kê chưa khả dụng: {workspaceError}
              </div>
            ) : !status?.trendsEnabled ? (
              <div className="ai-biz-blank">Admin đang tắt phân tích xu hướng đọc.</div>
            ) : !trends ? (
              <div className="ai-biz-blank">Chưa có dữ liệu lưu thông để thống kê.</div>
            ) : (
              <>
                <div className="ai-biz-stats">
                  <article>
                    <p>Lượt mượn</p>
                    <strong>{trends.borrowed}</strong>
                    <small>{statsRange} ngày gần đây</small>
                  </article>
                  <article>
                    <p>Lượt trả</p>
                    <strong>{trends.returned}</strong>
                    <small>{statsRange} ngày gần đây</small>
                  </article>
                  <article>
                    <p>Đang quá hạn</p>
                    <strong>{trends.overdue}</strong>
                    <small>Toàn hệ thống</small>
                  </article>
                  <article>
                    <p>Sắp đến hạn</p>
                    <strong>{trends.dueSoon}</strong>
                    <small>Trong 3 ngày tới</small>
                  </article>
                </div>
                {!status?.overduePredictEnabled ? (
                  <p className="ai-biz-muted">Admin đang tắt cảnh báo quá hạn.</p>
                ) : workspace && workspace.overdueRisks.length > 0 ? (
                  <div className="ai-biz-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Độc giả</th>
                          <th>Sách</th>
                          <th>Ngày trễ</th>
                          <th>Mức rủi ro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workspace.overdueRisks.map((item) => (
                          <tr key={item.loanId}>
                            <td>{item.readerName}</td>
                            <td>{item.bookTitle}</td>
                            <td>{item.overdueDays}</td>
                            <td>{item.risk}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="ai-biz-muted">Không có phiếu quá hạn trong dữ liệu hiện tại.</p>
                )}
              </>
            )}
          </section>
        </>
      )}

      {confirm === 'leave' && (
        <AiConfirmDialog
          title="Rời trang khi chưa lưu?"
          message="Bạn có thay đổi tiêu chí chưa lưu. Rời trang sẽ mất các thay đổi này."
          confirmLabel="Rời trang"
          tone="primary"
          onCancel={() => {
            setConfirm(null);
            setLeaveTo(null);
          }}
          onConfirm={() => {
            const target = leaveTo;
            setConfirm(null);
            setLeaveTo(null);
            setJustSaved(false);
            if (target) navigate(target);
          }}
        />
      )}
    </section>
  );
};

function formatBookSource(source: RagSource) {
  const copies = Number.isFinite(source.availableCopies) && Number.isFinite(source.totalCopies)
    ? ` · bản sao ${source.availableCopies}/${source.totalCopies}`
    : '';
  const score = Number.isFinite(source.score) && source.score > 0
    ? ` · liên quan ${(source.score * 100).toFixed(0)}%`
    : '';
  return `${source.title}${source.author ? ` · ${source.author}` : ''}${source.isbn ? ` · ISBN ${source.isbn}` : ''}${copies}${score}`;
}

function BookSourceList({ sources, empty }: { sources: RagSource[]; empty?: string }) {
  const books = sources.filter((item) => item.sourceType === 'book');
  if (books.length === 0) {
    return empty ? <p className="ai-biz-muted">{empty}</p> : null;
  }
  return (
    <ul>
      {books.map((source) => (
        <li key={`${source.sourceType}-${source.sourceId}`}>{formatBookSource(source)}</li>
      ))}
    </ul>
  );
}

export default LibrarianAiPage;
