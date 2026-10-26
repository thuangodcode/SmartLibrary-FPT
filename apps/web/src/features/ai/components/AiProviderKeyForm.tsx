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

function embeddingProviderFor(status: AiSettingsStatus, chatProvider: AiProviderId): AiProviderId {
  if (chatProvider === 'ollama') return 'local';
  if (isProviderId(status.embeddingProvider) && supportsEmbedding(status.embeddingProvider))
    return status.embeddingProvider;
  if (supportsEmbedding(chatProvider)) return chatProvider;
  const configured = AI_PROVIDERS.find((item) =>
    supportsEmbedding(item.id) && status.providers?.some((entry) => entry.id === item.id && entry.hasApiKey),
  );
  return configured?.id ?? 'gemini';
}

function normalizedChatModel(provider: AiProviderId, model: string | null | undefined): string {
  if (provider === 'deepseek' && model === 'deepseek-chat') return 'deepseek-flash';
  return model || findProvider(provider).chatModels[0]?.id || '';
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
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [chatModel, setChatModel] = useState(() => normalizedChatModel(
    isProviderId(status.provider) ? status.provider : 'gemini',
    status.chatModel,
  ));
  const [embeddingProvider, setEmbeddingProvider] = useState(() => embeddingProviderFor(
    status,
    isProviderId(status.provider) ? status.provider : 'gemini',
  ));
  const [embeddingModel, setEmbeddingModel] = useState(status.embeddingModel || 'gemini-embedding-001');
  const [baseUrl, setBaseUrl] = useState(
    status.baseUrl || (status.provider === 'ollama' ? 'http://localhost:11434' : ''),
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const provider = findProvider(providerId);
  const embeddingProviderDef = findProvider(embeddingProvider);
  const saved = status.providers?.find((item) => item.id === providerId);
  const savedEmbedding = status.providers?.find((item) => item.id === embeddingProvider);
  const tabHasKey = Boolean(saved?.hasApiKey || (saved?.isActive && status.hasApiKey));
  const tabLast4 = saved?.apiKeyLast4 || (saved?.isActive ? status.apiKeyLast4 : null) || null;
  const savedChat = saved?.chatModel || provider.chatModels[0]?.id || '';
  const savedEmbedProvider = embeddingProviderFor(status, providerId);
  const savedEmbed = status.providers?.find((item) => item.id === savedEmbedProvider)?.embeddingModel
    || (savedEmbedProvider === status.embeddingProvider ? status.embeddingModel : '')
    || findProvider(savedEmbedProvider).embeddingModels[0]?.id
    || '';
  const savedBase = saved?.baseUrl || '';
  const storedKey = keyFor(status, providerId);
  const providerState = connectionState(
    {
      ...status,
      hasApiKey: tabHasKey,
      lastTestOk: saved ? saved.lastTestOk : status.lastTestOk,
    },
    testing,
  );
  const dirty = apiKey.trim() !== storedKey
    || chatModel !== savedChat
    || embeddingModel !== savedEmbed
    || embeddingProvider !== savedEmbedProvider
    || (provider.needsBaseUrl && baseUrl.trim() !== savedBase);
  const showSaved = justSaved && !dirty;

  const fill = (next: AiSettingsStatus, tab: AiProviderId) => {
    const item = next.providers?.find((entry) => entry.id === tab);
    const selectedEmbeddingProvider = embeddingProviderFor(next, tab);
    const embeddingDef = findProvider(selectedEmbeddingProvider);
    const embeddingStatus = next.providers?.find((entry) => entry.id === selectedEmbeddingProvider);
    setChatModel(normalizedChatModel(tab, item?.chatModel || (item?.isActive ? next.chatModel : null)));
    setEmbeddingProvider(selectedEmbeddingProvider);
    setEmbeddingModel(
      embeddingStatus?.embeddingModel
      || (selectedEmbeddingProvider === next.embeddingProvider ? next.embeddingModel : '')
      || embeddingDef.embeddingModels[0]?.id
      || '',
    );
    setBaseUrl(item?.baseUrl || (tab === 'ollama' ? 'http://localhost:11434' : ''));
    setApiKey(keyFor(next, tab));
  };

  const selectTab = (id: AiProviderId) => {
    setProviderId(id);
    setShowKey(false);
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
    const embeddingKeyAvailable = embeddingProvider === 'local'
      || (embeddingProvider === providerId
      ? Boolean(apiKey.trim() || tabHasKey)
      : Boolean(savedEmbedding?.hasApiKey));
    if (ragOn && status.useForLibrary && !embeddingKeyAvailable) {
      setKeyError(`Hãy lưu API Key ${embeddingProviderDef.name} trước khi dùng cho RAG.`);
      return;
    }
    setKeyError(null);
    setSaving(true);
    try {
      const next = await saveMyAiSettings(accessToken, {
        provider: providerId,
        apiKey: apiKey.trim() || undefined,
        chatModel,
        embeddingProvider,
        embeddingModel: embeddingModel || undefined,
        baseUrl: provider.needsBaseUrl ? baseUrl.trim() : undefined,
      });
      onStatus(next);
      fill(next, providerId);
      setShowKey(false);
      setJustSaved(true);
      showToast({
        type: 'success',
        title: 'Đã lưu cấu hình',
        message: providerId === 'ollama'
          ? `${provider.name} đã lưu. Chat chạy cục bộ, không dùng API Key.`
          : `${provider.name} đang dùng token trong ô nhập.`,
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
        <span className={`ai-cfg-badge ai-cfg-badge--${providerState === 'ok' ? 'ok' : providerState === 'error' ? 'bad' : 'idle'}`}>
          {connectionLabel(providerState)}
        </span>
      </div>
      <p>
        Cấu hình nhà cung cấp thuộc tài khoản thủ thư này. API Key (nếu dùng) được mã hóa khi lưu; Admin không đọc được khóa.
        Hãy lưu mọi thay đổi trước khi kiểm tra kết nối.
      </p>
      <p>Nhà cung cấp đang chọn xử lý hội thoại; RAG dùng nhà cung cấp embedding riêng. Ollama và ONNX chạy trên máy chủ, không gửi nội dung tìm kiếm tới API AI bên ngoài.</p>
      {status.accountEnabled === false && (
        <p className="ai-cfg-warn">Admin đã tắt quyền AI của tài khoản này. Lưu khóa được nhưng không gọi được AI.</p>
      )}

      <div className="ai-cfg-tabs" role="tablist" aria-label="Nhà cung cấp AI">
        {AI_PROVIDERS.filter((item) => item.id !== 'local').map((item) => (
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
        {tabHasKey && providerId !== 'ollama' && (
          <p className="ai-cfg-token">Đang dùng token {tabLast4 ? `••••${tabLast4}` : 'đã lưu'}</p>
        )}
        {provider.needsBaseUrl && (
          <label>
            Base URL
            <input
              type="url"
              value={baseUrl}
              placeholder={providerId === 'ollama' ? 'http://localhost:11434' : 'https://api.example.com/v1'}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                setKeyError(null);
              }}
            />
          </label>
        )}
        {providerId !== 'ollama' && (
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
        )}
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
            Nhà cung cấp embedding cho RAG
            <select
              value={embeddingProvider}
              onChange={(event) => {
                const nextProvider = event.target.value as AiProviderId;
                const nextDef = findProvider(nextProvider);
                const nextSaved = status.providers?.find((item) => item.id === nextProvider);
                setEmbeddingProvider(nextProvider);
                setEmbeddingModel(
                  nextSaved?.embeddingModel
                  || (nextProvider === status.embeddingProvider ? status.embeddingModel : '')
                  || nextDef.embeddingModels[0]?.id
                  || '',
                );
              }}
            >
              {AI_PROVIDERS.filter((item) => supportsEmbedding(item.id)).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            Model embedding
            {embeddingProviderDef.embeddingModels.length ? (
              <select value={embeddingModel} onChange={(event) => setEmbeddingModel(event.target.value)}>
                {embeddingProviderDef.embeddingModels.map((model) => (
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
          <button
            type="button"
            className="ai-btn"
            disabled={testing || saving || dirty || !tabHasKey}
            title={dirty ? 'Hãy lưu cấu hình trước khi kiểm tra kết nối.' : undefined}
            onClick={() => void test()}
          >
            <Wifi size={14} /> {testing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
          </button>
          {dirty && <span className="ai-cfg-save-state is-dirty">Chưa lưu thay đổi</span>}
          {dirty && <span className="ai-cfg-save-state">Lưu cấu hình trước khi kiểm tra.</span>}
          {showSaved && <span className="ai-cfg-save-state is-saved">Đã lưu</span>}
        </div>
      </div>
    </section>
  );
};

export default AiProviderKeyForm;
