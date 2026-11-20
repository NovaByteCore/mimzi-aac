import { useRef } from 'react';
import { useDialogFocus } from '../lib/useDialogFocus';
interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onCancel);
  return (
    <div className="modal-backdrop" role="presentation">
      <div ref={ref} className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-msg">{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-quiet" onClick={onCancel} data-autofocus>
            Cancel
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
