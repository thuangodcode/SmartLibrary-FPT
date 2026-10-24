import './AiConfirmDialog.css';

interface AiConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  tone?: 'danger' | 'primary';
  hideCancel?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const AiConfirmDialog = ({
  title,
  message,
  confirmLabel,
  busy,
  tone = 'danger',
  hideCancel,
  onCancel,
  onConfirm,
}: AiConfirmDialogProps) => (
  <div className="ai-dlg-scrim" role="presentation" onClick={() => { if (!busy) onCancel(); }}>
    <section
      className="ai-dlg"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ai-dlg-title"
      onClick={(event) => event.stopPropagation()}
    >
      <h3 id="ai-dlg-title">{title}</h3>
      <p>{message}</p>
      <div className="ai-dlg-actions">
        {!hideCancel && (
          <button type="button" className="ai-btn" disabled={busy} onClick={onCancel}>Hủy</button>
        )}
        <button
          type="button"
          className={tone === 'primary' ? 'ai-btn ai-btn--primary' : 'ai-btn ai-btn--danger'}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'Đang xử lý…' : confirmLabel}
        </button>
      </div>
    </section>
  </div>
);

export default AiConfirmDialog;
