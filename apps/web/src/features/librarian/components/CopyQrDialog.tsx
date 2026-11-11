import { useEffect, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import './CopyQrDialog.css';

export interface CopyQrLabel { barcode: string; bookTitle: string }

export function CopyQrDialog({ copy, onClose }: { copy: CopyQrLabel | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (copy) dialog.current?.showModal();
    else dialog.current?.close();
  }, [copy]);

  return <dialog ref={dialog} className="copy-qr-dialog" aria-labelledby="copy-qr-title"
    onCancel={onClose} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    {copy && <div className="copy-qr-body">
      <header><h2 id="copy-qr-title">Mã QR bản sao</h2><button type="button" onClick={onClose} aria-label="Đóng mã QR"><X size={20} /></button></header>
      <p className="copy-qr-book">{copy.bookTitle}</p>
      <div className="copy-qr-label">
        <span>SmartLibrary</span>
        <QRCodeSVG value={copy.barcode} size={224} level="M" marginSize={4} title={`Mã bản sao ${copy.barcode}`} />
        <strong>{copy.barcode}</strong>
      </div>
      <p className="copy-qr-hint">Mở mục Quét trên mobile thủ thư và hướng camera vào mã này. Bạn cũng có thể nhập mã bản sao bằng tay.</p>
      <button type="button" className="copy-qr-done" onClick={onClose}>Đóng</button>
    </div>}
  </dialog>;
}
