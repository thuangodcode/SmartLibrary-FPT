import { API_BASE_URL } from './config';
import type { ApiResponse } from './types';

function tokenSubject(token?: string): string | undefined {
  if (!token) return undefined;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { sub } = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof sub === 'string' ? sub : undefined;
  } catch { return undefined; }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type SessionTokenHandler = (forceRefresh?: boolean) => Promise<string>;
let sessionTokenHandler: SessionTokenHandler | null = null;
let sessionExpiredHandler: (() => Promise<void>) | null = null;

export function setSessionTokenHandler(handler: SessionTokenHandler | null, expired: (() => Promise<void>) | null = null) {
  sessionTokenHandler = handler;
  sessionExpiredHandler = expired;
}

export async function getSessionAccessToken(forceRefresh = false): Promise<string> {
  if (!sessionTokenHandler) throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
  return sessionTokenHandler(forceRefresh);
}

async function send(path: string, options: RequestInit, token?: string, timeoutMs = 15_000) {
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body && !isMultipart ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string, timeoutMs = 15_000): Promise<ApiResponse<T>> {
  const fetchResponse = async (requestToken?: string) => {
    try {
      return await send(path, options, requestToken, timeoutMs);
    } catch {
      throw new ApiError(`Điện thoại không kết nối được máy chủ (${API_BASE_URL}). Hãy mở địa chỉ này trên trình duyệt điện thoại để kiểm tra; nếu không truy cập được, chạy API ở chế độ LAN và kiểm tra Wi-Fi cùng Tường lửa Windows.`, 0);
    }
  };
  const authenticated = !!token && (!path.startsWith('/api/v1/auth/') || path === '/api/v1/auth/me');
  const requestToken = authenticated && sessionTokenHandler ? await getSessionAccessToken() : token;
  const ensureSameUser = (nextToken?: string) => {
    const originalUser = tokenSubject(token);
    const nextUser = tokenSubject(nextToken);
    if (originalUser && nextUser && originalUser !== nextUser) throw new ApiError('Phiên đăng nhập đã thay đổi. Vui lòng thực hiện lại thao tác.', 401);
  };
  ensureSameUser(requestToken);
  let response = await fetchResponse(requestToken);
  if (response.status === 401 && authenticated && sessionTokenHandler) {
    const retryToken = await getSessionAccessToken(true);
    ensureSameUser(retryToken);
    response = await fetchResponse(retryToken);
    if (response.status === 401 && await getSessionAccessToken() === retryToken) await sessionExpiredHandler?.();
  }
  const body = await response.text();
  let result: ApiResponse<T>;
  try {
    result = body ? JSON.parse(body) as ApiResponse<T> : {};
  } catch {
    throw new ApiError('API trả về dữ liệu không hợp lệ.', response.status);
  }
  if (!response.ok || result.success === false) {
    throw new ApiError(result.error || `Yêu cầu thất bại (${response.status}).`, response.status);
  }
  return result;
}
