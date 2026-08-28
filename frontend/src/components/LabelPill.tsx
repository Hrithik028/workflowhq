import { X } from "lucide-react";

import type { Label } from "../types";

interface LabelPillProps {
  label: Label;
  onRemove?: (label: Label) => void;
}

function LabelPill({ label, onRemove }: LabelPillProps) {
  return (
    <span className="label-pill" style={{ background: `${label.color}22`, color: label.color }}>
      {label.name}
      {onRemove ? (
        <button
          aria-label={`Remove ${label.name} label`}
          onClick={() => onRemove(label)}
          type="button"
        >
          <X size={11} />
        </button>
      ) : null}
    </span>
  );
}

export default LabelPill;
