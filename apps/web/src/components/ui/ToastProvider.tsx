import { useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastNotification, type ToastMessage } from './ToastNotification';
import { ToastContext, type ToastInput } from './ToastContext';
import './ToastNotification.css';

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const id = `toast-${Date.now()}-${nextId.current++}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    return id;
  }, []);

  const updateToast = useCallback((id: string, update: Partial<ToastInput>) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, ...update } : toast)),
    );
  }, []);

  const contextValue = useMemo(
    () => ({ showToast, updateToast, dismissToast }),
    [showToast, updateToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {createPortal(
        <div className="toast-viewport" aria-label="Thông báo">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} dismissToast={dismissToast} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

const ToastItem = ({
  toast,
  dismissToast,
}: {
  toast: ToastMessage;
  dismissToast: (id: string) => void;
}) => {
  const onClose = useCallback(() => dismissToast(toast.id), [dismissToast, toast.id]);
  return <ToastNotification toast={toast} onClose={onClose} />;
};
