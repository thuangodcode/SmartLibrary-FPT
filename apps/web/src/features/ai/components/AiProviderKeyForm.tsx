import { useState } from 'react';
import { Eye, EyeOff, Save, Wifi } from 'lucide-react';
import {
  AI_PROVIDERS,
  findProvider,
  isProviderId,
  supportsEmbedding,
  type AiProviderId,
} from '../aiProviders';
import {
  saveMyAiSettings,
  testAiConnection,
  type AiSettingsStatus,
} from '../aiApi';
import { useToast } from '../../../components/ui/useToast';

type ConnectionState = 'idle' | 'missing' | 'testing' | 'ok' | 'error';

function keyFor(status: AiSettingsStatus, tab: AiProviderId): string {
  const item = status.providers?.find((entry) => entry.id === tab);
  return (item?.apiKey || (item?.isActive ? status.apiKey : '') || '').trim();
}

function connectionState(status: AiSettingsStatus | null, testing: boolean): ConnectionState {
  if (testing) return 'testing';
  if (!status?.hasApiKey) return 'missing';
  if (status.lastTestOk === false) return 'error';
  if (status.lastTestOk === true) return 'ok';
  return 'idle';
}

function connectionLabel(state: ConnectionState): string {
  if (state === 'testing') return 'Đang kiểm tra';
  if (state === 'missing') return 'Chưa cấu hình';
  if (state === 'ok') return 'Kết nối thành công';
  if (state === 'error') return 'Lỗi kết nối';
  return 'Đã lưu';
}

interface Props {
  accessToken: string;
  status: AiSettingsStatus;
  onStatus: (next: AiSettingsStatus) => void;
}

const AiProviderKeyForm = ({ accessToken, status, onStatus }: Props) => {
  const { showToast } = useToast();
  const [providerId, setProviderId] = useState<AiProviderId>(
    isProviderId(status.provider) ? status.provider : 'gemini',
  );
  const [apiKey, setApiKey] = useState(() => keyFor(status, isProviderId(status.provider) ? status.provider : 'gemini'));
  const [showKey, setShowKey] = useState(true);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState(status.chatModel || 'gemini-3.8-flash');
  const [embeddingModel, setEmbeddingModel] = useState(status.embeddingModel || 'gemini-embedding-001');
  const [baseUrl, setBaseUrl] = useState(status.baseUrl || '');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const provider = findProvider(providerId);
  const saved = status.providers?.find((item) => item.id === providerId);
  const tabHasKey = Boolean(saved?.hasApiKey || (saved?.isActive && status.hasApiKey));
  const tabLast4 = saved?.apiKeyLast4 || (saved?.isActive ? status.apiKeyLast4 : null) || null;
  const state = connectionState(status, testing);
  const savedChat = saved?.chatModel || provider.chatModels[0]?.id || '';
  const savedEmbed = saved?.embeddingModel || provider.embeddingModels[0]?.id || '';
  const savedBase = saved?.baseUrl || '';
  const storedKey = keyFor(status, providerId);
  const dirty = apiKey.trim() !== storedKey
    || chatModel !== savedChat
    || embeddingModel !== savedEmbed
    || (provider.needsBaseUrl && baseUrl.trim() !== savedBase);
  const showSaved = justSaved && !dirty;

  const fill = (next: AiSettingsStatus, tab: AiProviderId) => {
    const def = findProvider(tab);
    const item = next.providers?.find((entry) => entry.id === tab);
    setChatModel(item?.chatModel || def.chatModels[0]?.id || '');
    setEmbeddingModel(item?.embeddingModel || def.embeddingModels[0]?.id || '');
    setBaseUrl(item?.baseUrl || '');
    setApiKey(keyFor(next, tab));
  };

  const selectTab = (id: AiProviderId) => {
    setProviderId(id);
    setShowKey(true);
    setKeyError(null);
    fill(status, id);
  };

  const save = async () => {
    if (apiKey.trim() && apiKey.trim().length < 20) {
      setKeyError('API Key cần ít nhất 20 ký tự.');
      return;
    }
    if (provider.needsBaseUrl && !baseUrl.trim() && !saved?.baseUrl) {
      setKeyError('Nhà cung cấp khác cần Base URL.');
      return;
    }
    const ragOn = status.isEnabled
      && (status.readerAiEnabled || status.recommendEnabled || status.librarianAiEnabled);
    if (ragOn && status.useForLibrary && !supportsEmbedding(providerId)) {
      setKeyError('Nhà này không tạo embedding. Chọn Gemini hoặc OpenAI trước khi dùng cho độc giả.');
      return;
    }
    setKeyError(null);
    setSaving(true);
    try {
      const next = await saveMyAiSettings(accessToken, {
        provider: providerId,
        apiKey: apiKey.trim() || undefined,
        chatModel,
        embeddingModel: embeddingModel || undefined,
        baseUrl: provider.needsBaseUrl ? baseUrl.trim() : undefined,
      });
      onStatus(next);
      fill(next, providerId);
      setJustSaved(true);
      showToast({
        type: 'success',
        title: 'Đã lưu cấu hình',
        message: `${provider.name} đang dùng token trong ô nhập.`,
      });
    } catch (saveError) {
      showToast({
        type: 'error',
        title: 'Không lưu được',
        message: saveError instanceof Error ? saveError.message : 'Lỗi không xác định.',
      });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const result = await testAiConnection(accessToken, providerId);
      onStatus({
        ...status,
        lastTestOk: result.ok,
        lastTestMessage: result.message,
        lastTestedAt: result.testedAt,
        providers: (status.providers ?? []).map((item) => item.id === providerId
          ? { ...item, lastTestOk: result.ok, lastTestMessage: result.message, lastTestedAt: result.testedAt }
          : item),
      });
      showToast({
        type: result.ok ? 'success' : 'error',
        title: result.ok ? `Kết nối ${provider.name} thành công` : `${provider.name} từ chối kết nối`,
        message: result.message,
      });
    } catch (testError) {
      showToast({
        type: 'error',
        title: 'Không kiểm tra được kết nối',
        message: testError instanceof Error ? testError.message : 'Lỗi không xác định.',
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="ai-cfg-card">
      <div className="ai-cfg-card-head">
        <h2>Nhà cung cấp AI của bạn</h2>
        <span className={`ai-cfg-badge ai-cfg-badge--${state === 'ok' ? 'ok' : state === 'error' ? 'bad' : 'idle'}`}>
          {connectionLabel(state)}
        </span>
      </div>
      <p>
        API Key thuộc tài khoản thủ thư này và được mã hóa khi lưu.
        Ô nhập luôn hiện token đang dùng. Chỉ đổi khi bạn sửa rồi bấm Lưu. Admin không đọc được khóa.
      </p>
      {status.accountEnabled === false && (
        <p className="ai-cfg-warn">Admin đã tắt quyền AI của tài khoản này. Lưu khóa được nhưng không gọi được AI.</p>
      )}

      <div className="ai-cfg-tabs" role="tablist" aria-label="Nhà cung cấp AI">
        {AI_PROVIDERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={providerId === item.id}
            className={providerId === item.id ? 'is-active' : ''}
            onClick={() => selectTab(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="ai-cfg-provider">
        {tabHasKey && (
          <p className="ai-cfg-token">Đang dùng token {tabLast4 ? `••••${tabLast4}` : 'đã lưu'}</p>
        )}
        {provider.needsBaseUrl && (
          <label>
            Base URL
            <input
              type="url"
              value={baseUrl}
              placeholder="https://api.example.com/v1"
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setKeyError(null);
              }}
            />
          </label>
        )}
        <label>
          API Key
          <span className="ai-cfg-key">
            <input
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              value={apiKey}
              placeholder={provider.keyPlaceholder}
              onChange={(event) => {
                setApiKey(event.target.value);
                setKeyError(null);
              }}
              aria-invalid={Boolean(keyError)}
            />
            <button
              type="button"
              className="ai-cfg-eye"
              onClick={() => setShowKey((value) => !value)}
              aria-label={showKey ? 'Ẩn API Key' : 'Hiện API Key'}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
          {keyError && <em>{keyError}</em>}
        </label>
        <div className="ai-cfg-fields">
          <label>
            Model hội thoại
            {provider.chatModels.length ? (
              <select value={chatModel} onChange={(event) => setChatModel(event.target.value)}>
                {provider.chatModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
            ) : (
              <input value={chatModel} onChange={(event) => setChatModel(event.target.value)} />
            )}
          </label>
          <label>
            Model embedding
            {provider.embeddingModels.length ? (
              <select value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)}>
                {provider.embeddingModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.label}</option>
                ))}
              </select>
            ) : (
              <input
                value={embeddingModel}
                placeholder="Để trống nếu nhà cung cấp không có embedding"
                onChange={(event) => setEmbeddingModel(event.target.value)}
              />
            )}
          </label>
        </div>
        <div className="ai-cfg-actions">
          <button type="button" className="ai-btn ai-btn--primary" disabled={saving} onClick={() => void save()}>
            <Save size={14} /> {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
          </button>
          <button type="button" className="ai-btn" disabled={testing || !tabHasKey} onClick={() => void test()}>
            <Wifi size={14} /> {testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
          </button>
          {dirty && <span className="ai-cfg-save-state is-dirty">Chưa lưu thay đổi</span>}
          {showSaved && <span className="ai-cfg-save-state is-saved">Đã lưu</span>}
        </div>
      </div>
    </section>
  );
};

export default AiProviderKeyForm;
