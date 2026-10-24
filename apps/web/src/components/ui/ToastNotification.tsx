import { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, LoaderCircle, TriangleAlert, X } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'loading';
  title: string;
  message: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

const DEFAULT_DURATIONS: Record<ToastMessage['type'], number> = {
  success: 4000,
  error: 6000,
  warning: 5000,
  info: 4000,
  loading: 0,
};

export const ToastNotification = ({ toast, onClose }: ToastProps) => {
  const duration = toast?.duration ?? (toast ? DEFAULT_DURATIONS[toast.type] : 0);

  useEffect(() => {
    if (!toast || duration <= 0) return;
    const timeout = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onClose, toast]);

  if (!toast) return null;

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: TriangleAlert,
    info: Info,
    loading: LoaderCircle,
  };
  const Icon = icons[toast.type];

  return (
    <section
      className={`toast-notification toast-notification--${toast.type}`}
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
    >
      <div className="toast-notification__content">
        <span className="toast-notification__icon" aria-hidden="true">
          <Icon
            size={17}
            className={toast.type === 'loading' ? 'toast-notification__spinner' : undefined}
          />
        </span>
        <div className="toast-notification__copy">
          <h4 className="toast-notification__title">{toast.title}</h4>
          {toast.message && <p className="toast-notification__message">{toast.message}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="toast-notification__close"
          aria-label="Đóng thông báo"
        >
          <X size={16} />
        </button>
      </div>
      {duration > 0 && (
        <span
          className="toast-notification__progress"
          style={{ animationDuration: `${duration}ms` }}
          aria-hidden="true"
        />
      )}
    </section>
  );
};
