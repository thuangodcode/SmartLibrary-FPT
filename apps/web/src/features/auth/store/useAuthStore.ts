import { create } from 'zustand';
import { API_BASE_URL } from '../../../config';
import { parseApiResponse } from '../../../lib/api';

let hydrationPromise: Promise<void> | null = null;
let sessionVersion = 0;
let refreshFlight: { version: number; promise: Promise<string> } | null = null;

const isAccessTokenExpiring = (token: string, skewSeconds = 60): boolean => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return true;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { exp?: number };
    return typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000) + skewSeconds;
  } catch {
    return true;
  }
};

export interface User {
  id: string;
  email: string;
  fullName: string;
  studentId?: string;
  avatarUrl?: string;
  role: 'Reader' | 'Librarian' | 'Admin';
  status: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, token: string, permissions?: string[]) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
  hydrate: () => Promise<void>;
  getAccessToken: (forceRefresh?: boolean) => Promise<string>;
}

interface AuthApiResponse<T> {
  success?: boolean;
  data?: T;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, token, permissions = []) => {
    sessionVersion++;
    localStorage.setItem('sl_user', JSON.stringify(user));
    localStorage.setItem('sl_token', token);
    localStorage.setItem('sl_perms', JSON.stringify(permissions));
    localStorage.setItem('sl_refresh_cookie', '1');
    set({
      user,
      accessToken: token,
      permissions,
      isAuthenticated: true,
      isLoading: false,
    });
  },

  setAccessToken: (token) => {
    localStorage.setItem('sl_token', token);
    set({
      accessToken: token,
      isAuthenticated: !!token,
    });
  },

  logout: () => {
    sessionVersion++;
    localStorage.removeItem('sl_user');
    localStorage.removeItem('sl_token');
    localStorage.removeItem('sl_perms');
    localStorage.removeItem('sl_refresh_cookie');
    set({
      user: null,
      accessToken: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
    });
  },

  getAccessToken: async (forceRefresh = false) => {
    const token = get().accessToken || localStorage.getItem('sl_token');
    if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    const version = sessionVersion;
    if (refreshFlight?.version === version) return refreshFlight.promise;
    if (!forceRefresh && !isAccessTokenExpiring(token)) return token;
    const promise = (async () => {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST', credentials: 'include', signal: AbortSignal.timeout(15_000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (version === sessionVersion && (response.status === 400 || response.status === 401)) {
        get().logout();
        throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      const result = await parseApiResponse<AuthApiResponse<{ accessToken?: string }>>(response);
      if (version !== sessionVersion) throw new Error('Phiên đăng nhập đã thay đổi.');
      const next = result?.data?.accessToken;
      if (!response.ok || !result?.success || !next) {
        throw new Error(response.status >= 500 ? 'Tạm thời không thể làm mới phiên.' : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
      }
      get().setAccessToken(next);
      localStorage.setItem('sl_refresh_cookie', '1');
      return next;
    })();
    refreshFlight = { version, promise };
    try { return await promise; }
    finally { if (refreshFlight?.promise === promise) refreshFlight = null; }
  },

  hydrate: () => {
    if (hydrationPromise) return hydrationPromise;

    const hydration = (async () => {
      let token = localStorage.getItem('sl_token');
      if (!token) {
        localStorage.removeItem('sl_user');
        localStorage.removeItem('sl_perms');
        localStorage.removeItem('sl_refresh_cookie');
        set({ user: null, accessToken: null, permissions: [], isAuthenticated: false, isLoading: false });
        return;
      }

      const version = sessionVersion;
      const refreshAccessToken = async () => get().getAccessToken(true);

      try {
        let refreshAttempted = false;
        if (
          localStorage.getItem('sl_refresh_cookie') === '1'
          && isAccessTokenExpiring(token)
        ) {
          refreshAttempted = true;
          token = (await refreshAccessToken()) ?? token;
        }

        let response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
          credentials: 'include',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401 && !refreshAttempted) {
          const refreshedToken = await refreshAccessToken();
          if (refreshedToken) {
            token = refreshedToken;
            response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
              credentials: 'include',
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        }

        const result = await parseApiResponse<AuthApiResponse<{
          user?: User & { permissions?: string[] };
        }>>(response);
        const user = result?.data?.user;
        if (
          !response.ok ||
          !result?.success ||
          !user?.id ||
          user.status !== 'Active' ||
          !['Admin', 'Librarian', 'Reader'].includes(user.role)
        ) {
          throw new Error('The saved session is no longer valid.');
        }

        if (version !== sessionVersion) return;
        const { permissions = [], ...verifiedUser } = user;
        localStorage.setItem('sl_user', JSON.stringify(verifiedUser));
        localStorage.setItem('sl_perms', JSON.stringify(permissions));
        set({
          user: verifiedUser,
          accessToken: token,
          permissions,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch {
        if (version !== sessionVersion) return;
        localStorage.removeItem('sl_user');
        localStorage.removeItem('sl_token');
        localStorage.removeItem('sl_perms');
        localStorage.removeItem('sl_refresh_cookie');
        set({ user: null, accessToken: null, permissions: [], isAuthenticated: false, isLoading: false });
      }
    })();

    hydrationPromise = hydration;
    void hydration.finally(() => {
      if (hydrationPromise === hydration) hydrationPromise = null;
    });
    return hydration;
  },
}));

// Handle a rejected negotiate even if the JWT's expiry has not been reached
// (revoked session/account, or a token rejected after the API restarted).
export async function recoverRealtimeSession(error: unknown): Promise<boolean> {
  if (!/\b401\b|unauthorized/i.test(error instanceof Error ? error.message : String(error))) return false;
  if (!useAuthStore.getState().isAuthenticated) return true;
  try {
    const token = await useAuthStore.getState().getAccessToken(true);
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000),
    });
    if ((response.status === 401 || response.status === 403) && useAuthStore.getState().accessToken === token) useAuthStore.getState().logout();
    return response.ok || response.status === 401 || response.status === 403;
  } catch { return !useAuthStore.getState().isAuthenticated; }
}
