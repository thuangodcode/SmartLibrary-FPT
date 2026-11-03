import { API_BASE_URL } from './config';
import type { ApiResponse } from './types';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type TokenRefreshHandler = () => Promise<string | null>;
let tokenRefreshHandler: TokenRefreshHandler | null = null;

export function setTokenRefreshHandler(handler: TokenRefreshHandler | null) {
  tokenRefreshHandler = handler;
}

async function send(path: string, options: RequestInit, token?: string) {
  const isMultipart = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
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

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<ApiResponse<T>> {
  const fetchResponse = async (requestToken?: string) => {
    try {
      return await send(path, options, requestToken);
    } catch {
      throw new ApiError(`Điện thoại không kết nối được máy chủ (${API_BASE_URL}). Hãy mở địa chỉ này trên trình duyệt điện thoại để kiểm tra; nếu không truy cập được, chạy API ở chế độ LAN và kiểm tra Wi-Fi cùng Tường lửa Windows.`, 0);
    }
  };
  let response = await fetchResponse(token);
  if (response.status === 401 && token && !path.startsWith('/api/v1/auth/') && tokenRefreshHandler) {
    const refreshedToken = await tokenRefreshHandler();
    if (refreshedToken) response = await fetchResponse(refreshedToken);
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
