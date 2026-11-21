import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiError, apiRequest, setSessionTokenHandler } from './api';
import { isAccessTokenExpiring } from './tokenExpiry';
import type { AppRole, User } from './types';
import { googleSignIn } from './googleAuth';

interface SessionContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  updateUser: (patch: Partial<Pick<User, 'email' | 'fullName' | 'avatarUrl' | 'isVerified' | 'phone' | 'address' | 'dateOfBirth'>>) => Promise<void>;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}
const SessionContext = createContext<SessionContextValue | null>(null);
// The API decides whether a sign-in is allowed. Pending Readers can finish their
// verification profile, while mobile never exposes Admin or suspended accounts.
function canUseMobileSession(account: User) {
  return account.status === 'Active' || (account.role === 'Reader' && account.isVerified === false
    && ['PendingVerification', 'PendingActivation', 'PendingDocuments', 'PendingApproval'].includes(account.status));
}


export function SessionProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const currentToken = useRef<string | null>(null);
  const sessionVersion = useRef(0);
  const signedIn = useRef(false);
  const refreshFlight = useRef<{ version: number; promise: Promise<string> } | null>(null);
  const storageQueue = useRef(Promise.resolve());
  // A late refresh must not restore credentials after logout or overwrite a new login.
  const persist = useCallback((action: () => Promise<void>) => {
    const next = storageQueue.current.then(action, action);
    storageQueue.current = next.catch(() => {});
    return next;
  }, []);
  const clearSession = useCallback(async (announce = false) => {
    const showExpiry = announce && signedIn.current;
    sessionVersion.current++;
    signedIn.current = false;
    currentToken.current = null;
    setUser(null); setToken(null);
    await persist(async () => {
      await Promise.all(['sl_access_token', 'sl_refresh_token', 'sl_user'].map(key => SecureStore.deleteItemAsync(key)));
    });
    if (showExpiry) Alert.alert('Phiên đăng nhập đã hết hạn', 'Vui lòng đăng nhập lại để tiếp tục.');
  }, [persist]);
  const expireSession = useCallback(() => clearSession(true), [clearSession]);

  const getAccessToken = useCallback(async (forceRefresh = false): Promise<string> => {
    const saved = currentToken.current;
    if (!saved) throw new ApiError('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 401);
    const version = sessionVersion.current;
    if (refreshFlight.current?.version === version) return refreshFlight.current.promise;
    if (!forceRefresh && !isAccessTokenExpiring(saved)) return saved;
    const promise = (async () => {
      await storageQueue.current;
      const refreshToken = await SecureStore.getItemAsync('sl_refresh_token');
      if (version !== sessionVersion.current) throw new ApiError('Phiên đăng nhập đã thay đổi.', 401);
      if (!refreshToken) { await expireSession(); throw new ApiError('Phiên đăng nhập đã hết hạn.', 401); }
      try {
        const result = await apiRequest<{ accessToken?: string; refreshToken?: string }>('/api/v1/auth/refresh', {
          method: 'POST', headers: { 'X-Client-Type': 'mobile' }, body: JSON.stringify({ refreshToken }),
        });
        const nextToken = result.data?.accessToken;
        if (!nextToken) throw new ApiError('Không nhận được phiên đăng nhập mới.', 401);
        if (version !== sessionVersion.current) throw new ApiError('Phiên đăng nhập đã thay đổi.', 401);
        await persist(async () => {
          if (version !== sessionVersion.current) return;
          await SecureStore.setItemAsync('sl_access_token', nextToken);
          if (result.data?.refreshToken) await SecureStore.setItemAsync('sl_refresh_token', result.data.refreshToken);
        });
        if (version !== sessionVersion.current) throw new ApiError('Phiên đăng nhập đã thay đổi.', 401);
        currentToken.current = nextToken; setToken(nextToken);
        return nextToken;
      } catch (error) {
        if (version === sessionVersion.current && error instanceof ApiError && [400, 401].includes(error.status)) await expireSession();
        throw error;
      }
    })();
    refreshFlight.current = { version, promise };
    try { return await promise; }
    finally { if (refreshFlight.current?.promise === promise) refreshFlight.current = null; }
  }, [expireSession, persist]);

  useEffect(() => {
    setSessionTokenHandler(getAccessToken, expireSession);
    return () => setSessionTokenHandler(null);
  }, [getAccessToken, expireSession]);
  useEffect(() => {
    let active = true;
    const version = sessionVersion.current;
    void (async () => {
      try {
        const saved = await SecureStore.getItemAsync('sl_access_token');
        if (!saved || !active || version !== sessionVersion.current) return;
        currentToken.current = saved;
        // /auth/me now participates in refresh, including cold starts with an expired access token.
        const result = await apiRequest<{ user: User }>('/api/v1/auth/me', {}, saved);
        const verified = result.data?.user;
        if (!verified?.id || !canUseMobileSession(verified) || !['Reader', 'Librarian'].includes(verified.role)) throw new ApiError('Phiên đăng nhập không hợp lệ.', 401);
        if (active && version === sessionVersion.current) { signedIn.current = true; setToken(currentToken.current); setUser(verified); }
      } catch (error) {
        if (!active || version !== sessionVersion.current) return;
        const transient = error instanceof ApiError && (error.status === 0 || error.status >= 500);
        const cached = transient ? await SecureStore.getItemAsync('sl_user') : null;
        if (cached && currentToken.current) {
          try {
            const savedUser = JSON.parse(cached) as User;
            if (savedUser.id && canUseMobileSession(savedUser) && ['Reader', 'Librarian'].includes(savedUser.role)) {
              signedIn.current = true; setToken(currentToken.current); setUser(savedUser); return;
            }
          } catch { /* Remove invalid cache below. */ }
        }
        await clearSession();
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [clearSession]);
  useEffect(() => {
    if (!token) return;
    const refresh = () => { if (AppState.currentState === 'active') void getAccessToken().catch(() => {}); };
    const timer = setInterval(refresh, 30_000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void getAccessToken().catch(() => {}); });
    refresh();
    return () => { clearInterval(timer); listener.remove(); };
  }, [token, getAccessToken]);

  const signOut = useCallback(async () => {
    const saved = currentToken.current;
    // End the local session immediately so pending refresh cannot reauthenticate it.
    await clearSession();
    if (saved) {
      try { await apiRequest('/api/v1/auth/logout', { method: 'POST', body: JSON.stringify({}) }, saved); } catch { /* Local sign-out already succeeded. */ }
    }
  }, [clearSession]);
  const acceptSession = useCallback(async (version: number, data: { accessToken?: string; refreshToken?: string; user?: User }) => {
    if (version !== sessionVersion.current) return;
    const nextUser = data.user; const nextToken = data.accessToken;
    if (!nextUser?.id || !nextToken || !canUseMobileSession(nextUser)) throw new Error('Tài khoản chưa được kích hoạt hoặc thông tin đăng nhập không hợp lệ.');
    if (!['Reader', 'Librarian'].includes(nextUser.role)) throw new Error('Ứng dụng mobile chỉ hỗ trợ vai trò Reader và Thủ thư.');
    await persist(async () => {
      if (version !== sessionVersion.current) return;
      await SecureStore.setItemAsync('sl_access_token', nextToken);
      if (data.refreshToken) await SecureStore.setItemAsync('sl_refresh_token', data.refreshToken);
      else await SecureStore.deleteItemAsync('sl_refresh_token');
      await SecureStore.setItemAsync('sl_user', JSON.stringify(nextUser));
    });
    if (version !== sessionVersion.current) return;
    signedIn.current = true; currentToken.current = nextToken;
    setToken(nextToken); setUser({ ...nextUser, role: nextUser.role as AppRole });
  }, [persist]);
  const signIn = useCallback(async (email: string, password: string) => {
    const version = ++sessionVersion.current;
    const result = await apiRequest<{ accessToken?: string; refreshToken?: string; user?: User }>('/api/v1/auth/login', {
      method: 'POST', headers: { 'X-Client-Type': 'mobile' }, body: JSON.stringify({ email: email.trim(), password }),
    });
    await acceptSession(version, result.data || {});
  }, [acceptSession]);
  const signInWithGoogle = useCallback(async () => {
    const version = ++sessionVersion.current;
    const session = await googleSignIn();
    if (!session || version !== sessionVersion.current) return;
    const result = await apiRequest<{ user?: User }>('/api/v1/auth/google/exchange', {
      method: 'POST', body: JSON.stringify({ accessToken: session.accessToken, email: session.email, fullName: session.fullName, avatarUrl: session.avatarUrl }),
    });
    await acceptSession(version, { ...session, user: result.data?.user });
  }, [acceptSession]);
  const updateUser = useCallback(async (patch: Partial<Pick<User, 'email' | 'fullName' | 'avatarUrl' | 'isVerified' | 'phone' | 'address' | 'dateOfBirth'>>) => {
    const version = sessionVersion.current;
    await persist(async () => {
      if (version !== sessionVersion.current || !signedIn.current) return;
      const saved = await SecureStore.getItemAsync('sl_user');
      if (!saved || version !== sessionVersion.current) return;
      const next = { ...JSON.parse(saved), ...patch } as User;
      await SecureStore.setItemAsync('sl_user', JSON.stringify(next));
      if (version === sessionVersion.current) setUser(next);
    });
  }, [persist]);
  const refreshUser = useCallback(async () => {
    const version = sessionVersion.current;
    const saved = currentToken.current;
    if (!saved) return;
    const result = await apiRequest<{ user: User }>('/api/v1/auth/me', {}, saved);
    if (version === sessionVersion.current && result.data?.user) {
      const next = result.data.user;
      await updateUser({ email: next.email, fullName: next.fullName, avatarUrl: next.avatarUrl, isVerified: next.isVerified,
        phone: next.phone, address: next.address, dateOfBirth: next.dateOfBirth });
    }
  }, [updateUser]);
  const value = useMemo(() => ({ user, token, loading, signIn, signInWithGoogle, updateUser, refreshUser, signOut }), [user, token, loading, signIn, signInWithGoogle, updateUser, refreshUser, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
