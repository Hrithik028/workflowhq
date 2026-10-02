import { useState } from "react";
import type { AiProvider } from "../types";
import { budgetModels } from "../lib/aiModels";

export function AiModelPicker({
  provider,
  value,
  onChange
}: {
  provider: AiProvider;
  value: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  const budget = budgetModels[provider];
  const useCustom = custom || value !== budget;
  return (
    <div>
      <label>
        <span>Model preference</span>
        <select
          aria-label="Model preference"
          value={useCustom ? "custom" : "budget"}
          onChange={(event) => {
            const nextCustom = event.target.value === "custom";
            setCustom(nextCustom);
            onChange(nextCustom ? "" : budget);
          }}
        >
          <option value="budget">Budget default — {budget}</option>
          <option value="custom">Choose another model</option>
        </select>
      </label>
      {useCustom ? (
        <label>
          <span>Custom model ID</span>
          <input
            aria-label="AI model"
            required
            maxLength={120}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
      ) : null}
      <p>
        Budget models are selected by default. Other models may cost more; no automatic upgrade is
        made.
      </p>
    </div>
  );
}
