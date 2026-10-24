import { API_BASE_URL } from '../../config';
import { parseApiResponse } from '../../lib/api';

export interface AiProviderStatus {
  id: string;
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  chatModel: string | null;
  embeddingModel: string | null;
  baseUrl: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  isActive: boolean;
}

export interface AiSettingsStatus {
  hasApiKey: boolean;
  apiKeyLast4: string | null;
  provider: string;
  chatModel: string;
  embeddingModel: string;
  baseUrl?: string | null;
  isEnabled: boolean;
  readerAiEnabled: boolean;
  librarianAiEnabled: boolean;
  useMajor?: boolean;
  useCategory?: boolean;
  useHistory?: boolean;
  useReviews?: boolean;
  useGoals?: boolean;
  recommendEnabled?: boolean;
  trendsEnabled?: boolean;
  overduePredictEnabled?: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  documentsSyncedAt: string | null;
  documentCount: number;
  canEditApiKey: boolean;
  accountEnabled?: boolean;
  useForLibrary?: boolean;
  needsReindex?: boolean;
  activeLibrarianUserId?: string | null;
  libraryLibrarianName?: string | null;
  providers?: AiProviderStatus[];
  librarianAccounts?: LibrarianAiAccount[];
}

export interface LibrarianAiAccount {
  userId: string;
  fullName: string;
  email: string;
  hasApiKey: boolean;
  isEnabled: boolean;
  isLibraryActive: boolean;
  provider: string;
  chatModel: string;
  embeddingModel: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
  lastUsedAt?: string | null;
}

export interface AiConnectionTest {
  ok: boolean;
  message: string;
  testedAt: string;
  provider?: string;
}

export type AiServiceFlag =
  | 'isEnabled'
  | 'readerAiEnabled'
  | 'librarianAiEnabled'
  | 'recommendEnabled'
  | 'trendsEnabled'
  | 'overduePredictEnabled';

export interface RagSource {
  sourceType: string;
  sourceId: string;
  title: string;
  score: number;
  author?: string | null;
  coverImageUrl?: string | null;
  isbn?: string | null;
  code?: string | null;
  publishedYear?: number | null;
  availableCopies?: number;
  totalCopies?: number;
  location?: string | null;
  categories?: string[];
  matchLabel?: string | null;
}

export interface RagAskResult {
  answer: string;
  sources: RagSource[];
}

export interface RagReindexResult {
  booksIndexed: number;
  policiesIndexed: number;
  skippedUnchanged: number;
  failed: number;
  documentCount: number;
  syncedAt: string;
}

export interface AiBookSuggestion {
  id: string;
  title: string;
  borrowCount?: number;
  author?: string | null;
  coverImageUrl?: string | null;
  reason?: string | null;
  availableCopies?: number;
  totalCopies?: number;
  categories?: string[];
}

export interface AiReadingTrends {
  days: number;
  borrowed: number;
  returned: number;
  overdue: number;
  dueSoon: number;
}

export interface AiCriterion {
  id: string;
  label: string;
  count: number;
  detail: string;
  hasData: boolean;
}

export interface AiOverdueRiskItem {
  loanId: string;
  readerName: string;
  bookTitle: string;
  overdueDays: number;
  risk: string;
}

export interface AiLibrarianWorkspace {
  criteria: AiCriterion[];
  trends: AiReadingTrends;
  topBorrowed: AiBookSuggestion[];
  overdueRisks: AiOverdueRiskItem[];
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

async function callApi<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const result = await parseApiResponse<ApiEnvelope<T>>(response);
  if (!response.ok || !result?.success || result.data === undefined) {
    throw new Error(result?.error || `Không gọi được dịch vụ AI (HTTP ${response.status}).`);
  }
  return result.data;
}

const json = (body: object) => ({ method: 'POST', body: JSON.stringify(body) });

export const getAiSettings = (token: string) =>
  callApi<AiSettingsStatus>(token, '/api/v1/ai/settings', { method: 'GET' });

export const saveAdminAiSettings = (token: string, payload: Record<string, unknown>) =>
  callApi<AiSettingsStatus>(token, '/api/v1/ai/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const saveLibrarianAiSettings = (
  token: string,
  payload: {
    librarianAiEnabled: boolean;
    useMajor?: boolean;
    useCategory?: boolean;
    useHistory?: boolean;
    useReviews?: boolean;
    useGoals?: boolean;
  },
) => callApi<AiSettingsStatus>(token, '/api/v1/ai/librarian-settings', {
  method: 'PATCH',
  body: JSON.stringify(payload),
});

export const saveMyAiSettings = (token: string, payload: Record<string, unknown>) =>
  callApi<AiSettingsStatus>(token, '/api/v1/ai/my-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });

export const useMyAiForLibrary = (token: string) =>
  callApi<AiSettingsStatus>(token, '/api/v1/ai/my-settings/use-for-library', { method: 'POST' });

export const setLibrarianAiAccountEnabled = (token: string, userId: string, isEnabled: boolean) =>
  callApi<AiSettingsStatus>(token, `/api/v1/ai/librarians/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  });

export const testAiConnection = (token: string, provider?: string) =>
  callApi<AiConnectionTest>(token, '/api/v1/ai/test', json({ provider }));

export const reindexRag = (token: string) =>
  callApi<RagReindexResult>(token, '/api/v1/ai/reindex', { method: 'POST' });

export const getAcquisitionSuggestions = (token: string) =>
  callApi<RagAskResult>(token, '/api/v1/ai/acquisition-suggestions', { method: 'POST' });

export const getLibrarianWorkspace = (token: string, days = 30) =>
  callApi<AiLibrarianWorkspace>(token, `/api/v1/ai/librarian-workspace?days=${days}`, { method: 'GET' });

export const getPersonalizedRecommendations = (token: string) =>
  callApi<AiBookSuggestion[]>(token, '/api/v1/rag/recommendations', { method: 'GET' });

export const askRag = (token: string, question: string) =>
  callApi<RagAskResult>(token, '/api/v1/rag/ask', json({ question }));
