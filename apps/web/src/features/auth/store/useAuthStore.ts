import { create } from 'zustand';

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
  hydrate: () => void;
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

  hydrate: () => {
    try {
      const userStr = localStorage.getItem('sl_user');
      const token = localStorage.getItem('sl_token');
      const permsStr = localStorage.getItem('sl_perms');
      if (userStr && token) {
        set({
          user: JSON.parse(userStr),
          accessToken: token,
          permissions: permsStr ? JSON.parse(permsStr) : [],
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },
}));
