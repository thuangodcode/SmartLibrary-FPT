export type AiProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'deepseek'
  | 'openrouter'
  | 'huggingface'
  | 'other';

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiProviderDef {
  id: AiProviderId;
  name: string;
  hint: string;
  keyPlaceholder: string;
  needsBaseUrl: boolean;
  chatModels: AiModelOption[];
  embeddingModels: AiModelOption[];
}

export const AI_PROVIDERS: AiProviderDef[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    hint: 'generateContent / embedContent. Embedding 768 chiều cho RAG.',
    keyPlaceholder: 'AIza…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'gemini-3.8-flash', label: 'gemini-3.8-flash' },
      { id: 'gemini-3.5-flash', label: 'gemini-3.5-flash' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    ],
    embeddingModels: [
      { id: 'gemini-embedding-001', label: 'gemini-embedding-001' },
      { id: 'text-embedding-004', label: 'text-embedding-004' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    hint: 'chat/completions và embeddings. text-embedding-3-small dùng 768 chiều để khớp kho RAG.',
    keyPlaceholder: 'sk-…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    ],
    embeddingModels: [
      { id: 'text-embedding-3-small', label: 'text-embedding-3-small (768 chiều)' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    hint: 'Messages API cho hội thoại. Claude không có embedding; RAG vẫn cần Gemini hoặc OpenAI.',
    keyPlaceholder: 'sk-ant-…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
      { id: 'claude-haiku-4-5', label: 'claude-haiku-4-5' },
    ],
    embeddingModels: [],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hint: 'API tương thích OpenAI tại api.deepseek.com. Không hỗ trợ embedding RAG.',
    keyPlaceholder: 'sk-…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'deepseek-chat', label: 'deepseek-chat' },
    ],
    embeddingModels: [],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    hint: 'Cổng đa mô hình, chat/completions. Có thể gọi embeddings nếu model hỗ trợ.',
    keyPlaceholder: 'sk-or-…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'openai/gpt-4o-mini', label: 'openai/gpt-4o-mini' },
      { id: 'google/gemini-2.0-flash', label: 'google/gemini-2.0-flash' },
    ],
    embeddingModels: [
      { id: 'openai/text-embedding-3-small', label: 'openai/text-embedding-3-small' },
    ],
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    hint: 'Router OpenAI-compatible. Kiểm tra kết nối bằng chat completions.',
    keyPlaceholder: 'hf_…',
    needsBaseUrl: false,
    chatModels: [
      { id: 'openai/gpt-oss-20b', label: 'openai/gpt-oss-20b' },
    ],
    embeddingModels: [],
  },
  {
    id: 'other',
    name: 'Nhà cung cấp khác',
    hint: 'API tương thích OpenAI. Cần Base URL dạng https://host/v1.',
    keyPlaceholder: 'API Key',
    needsBaseUrl: true,
    chatModels: [],
    embeddingModels: [],
  },
];

export function isProviderId(id: string | null | undefined): id is AiProviderId {
  return AI_PROVIDERS.some((item) => item.id === id);
}

export function findProvider(id: string): AiProviderDef {
  return AI_PROVIDERS.find((item) => item.id === id) ?? AI_PROVIDERS[0];
}

export function supportsEmbedding(id: string): boolean {
  return id === 'gemini' || id === 'openai' || id === 'openrouter' || id === 'other';
}

export function formatAiTime(value: string | null | undefined): string {
  if (!value) return 'Chưa có';
  return new Date(value).toLocaleString('vi-VN');
}
