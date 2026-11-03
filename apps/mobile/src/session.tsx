import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, apiRequest, setTokenRefreshHandler } from './api';
import type { AppRole, User } from './types';

interface SessionContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    const savedToken = token || await SecureStore.getItemAsync('sl_access_token');
    if (savedToken) {
      try { await apiRequest('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({}) }, savedToken); } catch { /* Local sign-out still succeeds. */ }
    }
    await Promise.all([SecureStore.deleteItemAsync('sl_access_token'), SecureStore.deleteItemAsync('sl_refresh_token'), SecureStore.deleteItemAsync('sl_user')]);
    setUser(null);
    setToken(null);
  }, [token]);

  useEffect(() => {
    let refreshPromise: Promise<string | null> | null = null;
    const refresh = async () => {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        const refreshToken = await SecureStore.getItemAsync('sl_refresh_token');
        if (!refreshToken) return null;
        const result = await apiRequest<{ accessToken?: string; refreshToken?: string }>('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'X-Client-Type': 'mobile' },
          body: JSON.stringify({ refreshToken }),
        });
        const nextToken = result.data?.accessToken;
        if (!nextToken) return null;
        await SecureStore.setItemAsync('sl_access_token', nextToken);
        if (result.data?.refreshToken) await SecureStore.setItemAsync('sl_refresh_token', result.data.refreshToken);
        setToken(nextToken);
        return nextToken;
      })().finally(() => { refreshPromise = null; });
      return refreshPromise;
    };
    setTokenRefreshHandler(refresh);
    return () => setTokenRefreshHandler(null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const savedToken = await SecureStore.getItemAsync('sl_access_token');
        if (!savedToken) return;
        const result = await apiRequest<{ user: User }>('/api/v1/auth/me', {}, savedToken);
        const verified = result.data?.user;
        if (!verified?.id || verified.status !== 'Active' || !['Reader', 'Librarian'].includes(verified.role)) throw new Error('Phiên đăng nhập không còn hợp lệ.');
        const activeToken = await SecureStore.getItemAsync('sl_access_token') || savedToken;
        if (active) { setToken(activeToken); setUser(verified); }
      } catch (error) {
        const canKeepSavedSession = error instanceof ApiError && (error.status === 0 || error.status >= 500);
        const savedUser = canKeepSavedSession ? await SecureStore.getItemAsync('sl_user') : null;
        const savedToken = canKeepSavedSession ? await SecureStore.getItemAsync('sl_access_token') : null;
        if (active && savedUser && savedToken) {
          try {
            const cached = JSON.parse(savedUser) as User;
            if (cached?.id && ['Reader', 'Librarian'].includes(cached.role)) {
              setToken(savedToken);
              setUser(cached);
              return;
            }
          } catch { /* Invalid local profile should be removed below. */ }
        }
        await Promise.all([SecureStore.deleteItemAsync('sl_access_token'), SecureStore.deleteItemAsync('sl_refresh_token'), SecureStore.deleteItemAsync('sl_user')]);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<{ accessToken?: string; refreshToken?: string; user?: User }>('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'X-Client-Type': 'mobile' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const nextUser = result.data?.user;
    const nextToken = result.data?.accessToken;
    if (!nextUser?.id || !nextToken || nextUser.status !== 'Active') throw new Error('Tài khoản chưa được kích hoạt hoặc thông tin đăng nhập không hợp lệ.');
    if (!['Reader', 'Librarian'].includes(nextUser.role)) throw new Error('Ứng dụng mobile chỉ hỗ trợ vai trò Reader và Thủ thư.');
    await SecureStore.setItemAsync('sl_access_token', nextToken);
    if (result.data?.refreshToken) await SecureStore.setItemAsync('sl_refresh_token', result.data.refreshToken);
    await SecureStore.setItemAsync('sl_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser({ ...nextUser, role: nextUser.role as AppRole });
  }, []);

  const value = useMemo(() => ({ user, token, loading, signIn, signOut }), [user, token, loading, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
