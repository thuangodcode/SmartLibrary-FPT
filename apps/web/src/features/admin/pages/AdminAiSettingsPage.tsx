import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Bot, LoaderCircle, RefreshCw, RotateCcw } from 'lucide-react';
import { useAuthStore } from '../../auth/store/useAuthStore';
import { useToast } from '../../../components/ui/useToast';
import AiConfirmDialog from '../../ai/components/AiConfirmDialog';
import { findProvider } from '../../ai/aiProviders';
import {
  getAiSettings,
  reindexRag,
  saveAdminAiSettings,
  setLibrarianAiAccountEnabled,
  type AiServiceFlag,
  type AiSettingsStatus,
  type LibrarianAiAccount,
} from '../../ai/aiApi';
import './AdminAiSettingsPage.css';

type ConfirmKind = 'restore' | 'disable-system' | 'disable-service' | 'disable-account' | null;

const AI_SERVICES: Array<{ flag: AiServiceFlag; title: string }> = [
  { flag: 'isEnabled', title: 'Hệ thống AI' },
  { flag: 'readerAiEnabled', title: 'Tìm kiếm ngữ nghĩa' },
  { flag: 'librarianAiEnabled', title: 'Gợi ý nhập sách' },
  { flag: 'recommendEnabled', title: 'Gợi ý sách cá nhân hóa' },
  { flag: 'trendsEnabled', title: 'Phân tích xu hướng đọc' },
  { flag: 'overduePredictEnabled', title: 'Dự đoán nguy cơ quá hạn' },
];

const AdminAiSettingsPage = () => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const { showToast } = useToast();
  const [status, setStatus] = useState<AiSettingsStatus | null>(null);
  const [loading, setLoading] = useState(() => Boolean(accessToken));
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [error, setError] = useState<string | null>(accessToken ? null : 'Vui lòng đăng nhập Admin.');
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [pendingDisable, setPendingDisable] = useState<AiServiceFlag | null>(null);
  const [pendingAccount, setPendingAccount] = useState<LibrarianAiAccount | null>(null);
  const [busyFlag, setBusyFlag] = useState<AiServiceFlag | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const statusRef = useRef<AiSettingsStatus | null>(null);

  const activeServiceCount = status
    ? [
      status.isEnabled,
      status.readerAiEnabled,
      status.librarianAiEnabled,
      status.recommendEnabled,
      status.trendsEnabled,
      status.overduePredictEnabled,
    ].filter(Boolean).length
    : 0;
  const configuredCount = status?.librarianAccounts?.filter((item) => item.hasApiKey).length ?? 0;
  const connectionLabel = !status?.hasApiKey
    ? 'Chưa cấu hình'
    : status.lastTestOk === false
      ? 'Lỗi kết nối'
      : status.isEnabled
        ? 'Đang hoạt động'
        : 'Đã lưu';
  const activeName = findProvider(status?.provider || 'gemini').name;

  const applyStatus = (next: AiSettingsStatus) => {
    statusRef.current = next;
    setStatus(next);
  };

  useEffect(() => {
    if (!accessToken) return;
    const controller = new AbortController();
    setLoading(true);
    void getAiSettings(accessToken)
      .then((next) => {
        if (!controller.signal.aborted) {
          applyStatus(next);
          setError(null);
        }
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Không tải được cấu hình AI.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken]);

  const persistFlags = async (patch: Partial<Pick<AiSettingsStatus, AiServiceFlag>>) => {
    if (!accessToken) return;
    const rollback = statusRef.current;
    if (!rollback) return;
    const flag = (Object.keys(patch)[0] || null) as AiServiceFlag | null;
    applyStatus({ ...rollback, ...patch });
    if (flag) setBusyFlag(flag);
    try {
      applyStatus(await saveAdminAiSettings(accessToken, patch));
    } catch (toggleError) {
      applyStatus(rollback);
      showToast({
        type: 'error',
        title: 'Không đổi được dịch vụ',
        message: toggleError instanceof Error ? toggleError.message : 'Lỗi không xác định.',
      });
    } finally {
      setBusyFlag(null);
    }
  };

  const requestToggle = (flag: AiServiceFlag, enabled: boolean) => {
    if (!enabled) {
      setPendingDisable(flag);
      setConfirm(flag === 'isEnabled' ? 'disable-system' : 'disable-service');
      return;
    }
    void persistFlags({ [flag]: true });
  };

  const restoreDefaults = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      applyStatus(await saveAdminAiSettings(accessToken, {
        isEnabled: false,
        readerAiEnabled: false,
        librarianAiEnabled: false,
        recommendEnabled: false,
        trendsEnabled: false,
        overduePredictEnabled: false,
      }));
      setConfirm(null);
      showToast({ type: 'success', title: 'Đã khôi phục mặc định', message: 'Các dịch vụ AI đã tắt. Khóa của thủ thư không đổi.' });
    } catch (restoreError) {
      showToast({
        type: 'error',
        title: 'Không khôi phục được',
        message: restoreError instanceof Error ? restoreError.message : 'Lỗi không xác định.',
      });
    } finally {
      setSaving(false);
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
        message: `Sách ${result.booksIndexed}, chính sách ${result.policiesIndexed}, bỏ qua ${result.skippedUnchanged}, lỗi ${result.failed}.`,
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

  const setAccountEnabled = async (account: LibrarianAiAccount, enabled: boolean) => {
    if (!accessToken) return;
    setBusyUserId(account.userId);
    try {
      applyStatus(await setLibrarianAiAccountEnabled(accessToken, account.userId, enabled));
      showToast({
        type: 'success',
        title: enabled ? 'Đã bật quyền AI' : 'Đã tắt quyền AI',
        message: `${account.fullName} ${enabled ? 'có thể dùng AI bằng khóa của mình.' : 'không còn gọi được AI.'}`,
      });
    } catch (accountError) {
      showToast({
        type: 'error',
        title: 'Không đổi được quyền AI',
        message: accountError instanceof Error ? accountError.message : 'Lỗi không xác định.',
      });
    } finally {
      setBusyUserId(null);
      setPendingAccount(null);
      setConfirm(null);
    }
  };

  return (
    <section className="ai-cfg">
      <nav className="ai-cfg-crumb" aria-label="Đường dẫn">
        <Link to="/admin">Trang chủ</Link>
        <span>/</span>
        <span>Cài đặt hệ thống</span>
        <span>/</span>
        <strong>Cấu hình AI</strong>
      </nav>

      <header className="ai-cfg-head">
        <div>
          <p>QUẢN TRỊ HỆ THỐNG</p>
          <h1>Chính sách AI hệ thống</h1>
        </div>
        <div className={`ai-cfg-pulse ai-cfg-pulse--${connectionLabel === 'Đang hoạt động' ? 'ok' : connectionLabel === 'Lỗi kết nối' ? 'bad' : 'idle'}`}>
          <Bot size={16} />
          {connectionLabel}
        </div>
      </header>

      {loading ? (
        <div className="ai-cfg-empty"><LoaderCircle className="ai-spin" size={20} /> Đang tải cấu hình…</div>
      ) : error ? (
        <div className="ai-cfg-empty" role="alert"><AlertCircle size={18} /> {error}</div>
      ) : (
        <>
          <section className="ai-cfg-kpis" aria-label="Tổng quan AI">
            <article>
              <p>Thủ thư đã cấu hình</p>
              <strong>{configuredCount}</strong>
              <small>
                Thư viện đang dùng {activeName}
                {status?.libraryLibrarianName ? ` · ${status.libraryLibrarianName}` : ''}
              </small>
            </article>
            <article>
              <p>Dịch vụ đang hoạt động</p>
              <strong>{activeServiceCount}</strong>
            </article>
            <article>
              <p>Model hội thoại</p>
              <strong>{status?.chatModel || '—'}</strong>
              <small>Không hiển thị API Key</small>
            </article>
            <article>
              <p>Model embedding</p>
              <strong>{status?.embeddingModel || '—'}</strong>
              <small>{status?.needsReindex ? 'Cần đồng bộ lại RAG' : `${status?.documentCount ?? 0} tài liệu`}</small>
            </article>
          </section>

          <section className="ai-cfg-card">
            <h2>Dịch vụ AI toàn hệ thống</h2>
            <p>Admin bật/tắt dịch vụ. Thủ thư tự nhập API Key; không thể tự bật lại dịch vụ khi Admin tắt.</p>
            <div className="ai-cfg-services">
              {AI_SERVICES.map((service) => (
                <ServiceRow
                  key={service.flag}
                  title={service.title}
                  enabled={Boolean(status?.[service.flag])}
                  busy={busyFlag === service.flag}
                  onToggle={(value) => requestToggle(service.flag, value)}
                />
              ))}
            </div>
            <div className="ai-cfg-actions">
              <button type="button" className="ai-btn" disabled={reindexing || !status?.hasApiKey} onClick={() => void reindex()}>
                <RefreshCw size={14} /> {reindexing ? 'Đang tạo embedding…' : 'Đồng bộ dữ liệu RAG'}
              </button>
              <button type="button" className="ai-btn" onClick={() => setConfirm('restore')}>
                <RotateCcw size={14} /> Khôi phục mặc định
              </button>
            </div>
          </section>

          <section className="ai-cfg-card">
            <h2>Tài khoản thủ thư</h2>
            <p>Xem nhà cung cấp và model đang dùng. Không đọc được API Key. Có thể tắt quyền AI của một tài khoản.</p>
            {(status?.librarianAccounts?.length ?? 0) === 0 ? (
              <p>Chưa có tài khoản thủ thư.</p>
            ) : (
              <div className="ai-cfg-table-wrap">
                <table className="ai-cfg-table">
                  <thead>
                    <tr>
                      <th>Thủ thư</th>
                      <th>Nhà cung cấp</th>
                      <th>Model</th>
                      <th>Trạng thái</th>
                      <th>Quyền AI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(status?.librarianAccounts ?? []).map((account) => (
                      <tr key={account.userId}>
                        <td>
                          <strong>{account.fullName || account.email}</strong>
                          <small>{account.email}</small>
                          {account.isLibraryActive && <em className="ai-cfg-pill">Dùng cho độc giả</em>}
                        </td>
                        <td>{account.hasApiKey ? findProvider(account.provider).name : 'Chưa cấu hình'}</td>
                        <td>{account.hasApiKey ? account.chatModel || '—' : '—'}</td>
                        <td>
                          {!account.hasApiKey
                            ? 'Chưa cấu hình'
                            : account.lastTestOk === false
                              ? account.lastTestMessage || 'Lỗi API'
                              : account.lastTestOk
                                ? 'Kết nối thành công'
                                : 'Đã lưu'}
                        </td>
                        <td>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={account.isEnabled}
                            className={`ai-switch${account.isEnabled ? ' is-on' : ''}`}
                            disabled={busyUserId === account.userId}
                            onClick={() => {
                              if (account.isEnabled) {
                                setPendingAccount(account);
                                setConfirm('disable-account');
                                return;
                              }
                              void setAccountEnabled(account, true);
                            }}
                            aria-label={`Quyền AI của ${account.fullName}`}
                          >
                            <span />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {confirm === 'restore' && (
        <AiConfirmDialog
          title="Khôi phục mặc định?"
          message="Các dịch vụ AI sẽ tắt. API Key của thủ thư vẫn được giữ."
          confirmLabel="Khôi phục"
          busy={saving}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void restoreDefaults()}
        />
      )}
      {(confirm === 'disable-system' || confirm === 'disable-service') && (
        <AiConfirmDialog
          title={confirm === 'disable-system' ? 'Tắt hệ thống AI?' : 'Tắt dịch vụ đang dùng?'}
          message={confirm === 'disable-system'
            ? 'Toàn bộ trợ lý AI sẽ ngừng. Thủ thư không thể tự bật lại bằng cấu hình cá nhân.'
            : 'Dịch vụ này sẽ tắt cho đến khi bạn bật lại.'}
          confirmLabel="Tắt dịch vụ"
          onCancel={() => { setConfirm(null); setPendingDisable(null); }}
          onConfirm={() => {
            if (pendingDisable) void persistFlags({ [pendingDisable]: false });
            setConfirm(null);
            setPendingDisable(null);
          }}
        />
      )}
      {confirm === 'disable-account' && pendingAccount && (
        <AiConfirmDialog
          title={`Tắt quyền AI của ${pendingAccount.fullName}?`}
          message="Tài khoản này không còn gọi được AI. Khóa đã lưu vẫn giữ, Admin không đọc được khóa."
          confirmLabel="Tắt quyền"
          busy={busyUserId === pendingAccount.userId}
          onCancel={() => { setConfirm(null); setPendingAccount(null); }}
          onConfirm={() => void setAccountEnabled(pendingAccount, false)}
        />
      )}
    </section>
  );
};

function ServiceRow({
  title,
  enabled,
  busy,
  onToggle,
}: {
  title: string;
  enabled?: boolean;
  busy?: boolean;
  onToggle: (value: boolean) => void;
}) {
  return (
    <article className="ai-cfg-service">
      <div>
        <h3>{title}</h3>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(enabled)}
        className={`ai-switch${enabled ? ' is-on' : ''}`}
        title={enabled ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'}
        disabled={busy}
        onClick={() => onToggle(!enabled)}
        aria-label={`Bật ${title}`}
      >
        <span />
      </button>
    </article>
  );
}

export default AdminAiSettingsPage;
