import { create } from 'zustand';
import { API_BASE_URL } from '../../../config';

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
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  permissions: [],
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, token, permissions = []) => {
    localStorage.setItem('sl_user', JSON.stringify(user));
    localStorage.setItem('sl_token', token);
    localStorage.setItem('sl_perms', JSON.stringify(permissions));
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
    localStorage.removeItem('sl_user');
    localStorage.removeItem('sl_token');
    localStorage.removeItem('sl_perms');
    set({
      user: null,
      accessToken: null,
      permissions: [],
      isAuthenticated: false,
      isLoading: false,
    });
  },

  hydrate: async () => {
    const token = localStorage.getItem('sl_token');
    if (!token) {
      localStorage.removeItem('sl_user');
      localStorage.removeItem('sl_perms');
      set({ user: null, accessToken: null, permissions: [], isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json() as {
        success?: boolean;
        data?: { user?: User & { permissions?: string[] } };
      };
      const user = result.data?.user;
      if (
        !response.ok ||
        !result.success ||
        !user?.id ||
        user.status !== 'Active' ||
        !['Admin', 'Librarian', 'Reader'].includes(user.role)
      ) {
        throw new Error('The saved session is no longer valid.');
      }

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
      localStorage.removeItem('sl_user');
      localStorage.removeItem('sl_token');
      localStorage.removeItem('sl_perms');
      set({ user: null, accessToken: null, permissions: [], isAuthenticated: false, isLoading: false });
    }
  },
}));
