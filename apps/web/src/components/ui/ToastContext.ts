import { createContext } from 'react';
import type { ToastMessage } from './ToastNotification';

export type ToastInput = Omit<ToastMessage, 'id'>;

export interface ToastContextValue {
  showToast: (toast: ToastInput) => string;
  updateToast: (id: string, toast: Partial<ToastInput>) => void;
  dismissToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
