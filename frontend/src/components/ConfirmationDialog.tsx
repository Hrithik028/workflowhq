import { AlertTriangle, X } from "lucide-react";
import { createPortal } from "react-dom";

interface ConfirmationDialogProps {
  confirmLabel: string;
  description: string;
  isBusy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone?: "warning" | "danger";
}

function ConfirmationDialog({
  confirmLabel,
  description,
  isBusy = false,
  onCancel,
  onConfirm,
  title,
  tone = "warning"
}: ConfirmationDialogProps) {
  return createPortal(
    <div className="confirmation-backdrop" role="presentation">
      <section
        aria-describedby="confirmation-description"
        aria-labelledby="confirmation-title"
        aria-modal="true"
        className={`confirmation-dialog ${tone}`}
        role="alertdialog"
      >
        <header>
          <span className="confirmation-icon" aria-hidden="true">
            <AlertTriangle size={21} />
          </span>
          <div>
            <span className="overline">Confirm action</span>
            <h2 id="confirmation-title">{title}</h2>
          </div>
          <button
            aria-label="Close confirmation"
            disabled={isBusy}
            onClick={onCancel}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <p id="confirmation-description">{description}</p>
        <footer>
          <button className="button secondary" disabled={isBusy} onClick={onCancel} type="button">
            Keep it
          </button>
          <button
            className={`button ${tone === "danger" ? "danger" : "primary"}`}
            disabled={isBusy}
            onClick={onConfirm}
            type="button"
          >
            {isBusy ? "Working…" : confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

export default ConfirmationDialog;
