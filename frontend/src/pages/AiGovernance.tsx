import { Activity, Check, Cpu, Save, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { adminApi } from "../api/admin";
import { getErrorMessage } from "../api/client";
import type { LayoutContext } from "../components/AppLayout";
import type {
  AiGovernanceSettings,
  AiGovernanceSnapshot,
  AiGovernanceUpdate,
  AiProviderPolicy
} from "../types";

const labels: Record<AiProviderPolicy["provider"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google"
};

const editableSettings = (settings: AiGovernanceSettings): AiGovernanceUpdate => ({
  providerPolicies: settings.providerPolicies.map((policy) => ({
    ...policy,
    allowedModels: [...policy.allowedModels]
  })),
  dailyRunLimit: settings.dailyRunLimit,
  maxPromptCharacters: settings.maxPromptCharacters,
  maxOutputTokens: settings.maxOutputTokens,
  maxProposedActions: settings.maxProposedActions,
  requestTimeoutMs: settings.requestTimeoutMs,
  retentionDays: settings.retentionDays
});

function AiGovernance() {
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const isOwner = user.role === "platform_owner";
  const [snapshot, setSnapshot] = useState<AiGovernanceSnapshot | null>(null);
  const [draft, setDraft] = useState<AiGovernanceUpdate | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner || isDemo) return;
    let active = true;
    adminApi
      .getAiGovernance()
      .then((next) => {
        if (!active) return;
        setSnapshot(next);
        setDraft(editableSettings(next.settings));
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "Unable to load AI governance."));
      });
    return () => {
      active = false;
    };
  }, [isDemo, isOwner]);

  const updatePolicy = (index: number, next: Partial<AiProviderPolicy>) =>
    setDraft((current) => {
      if (!current) return current;
      const providerPolicies = current.providerPolicies.map((policy, policyIndex) =>
        policyIndex === index ? { ...policy, ...next } : policy
      );
      return { ...current, providerPolicies };
    });

  const updateLimit = (key: keyof Omit<AiGovernanceUpdate, "providerPolicies">, value: string) =>
    setDraft((current) => (current ? { ...current, [key]: Number(value) } : current));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || isDemo) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await adminApi.updateAiGovernance(draft);
      setSnapshot(next);
      setDraft(editableSettings(next.settings));
      setNotice("AI governance policy saved and recorded in the administrator audit log.");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to save AI governance."));
    } finally {
      setBusy(false);
    }
  };

  if (!isOwner) {
    return (
      <main className="workspace-page admin-settings-page">
        <section className="admin-denied">
          <ShieldAlert size={34} />
          <span className="overline">Platform owner only</span>
          <h2>AI governance is protected.</h2>
          <p>Only the platform owner can choose providers, models, quotas, and safety ceilings.</p>
          <Link className="button secondary" to="/settings">
            Return to settings
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-page admin-settings-page ai-governance-page">
      <header className="engineering-page-header ai-governance-header">
        <div>
          <span className="overline">Settings / AI governance</span>
          <h1>Provider control.</h1>
          <p>
            Choose approved models, enforce usage limits, and inspect sanitized provider health.
          </p>
        </div>
        <Link className="button secondary" to="/settings">
          Rules &amp; access
        </Link>
      </header>

      {error ? <p className="admin-notice error">{error}</p> : null}
      {notice ? <p className="admin-notice success">{notice}</p> : null}
      {isDemo ? (
        <section className="admin-denied">
          <Cpu size={34} />
          <span className="overline">Preview mode</span>
          <h2>Live provider policy is unavailable in the demo.</h2>
          <p>Sign in as the platform owner to manage server-enforced AI settings.</p>
        </section>
      ) : !snapshot || !draft ? (
        <p className="empty-copy">Loading server policy…</p>
      ) : (
        <form onSubmit={save}>
          <section className="ai-governance-metrics">
            <article>
              {snapshot.settings.deploymentEnabled ? (
                <Check size={18} />
              ) : (
                <ShieldAlert size={18} />
              )}
              <span>Planner deployment</span>
              <strong>{snapshot.settings.deploymentEnabled ? "On" : "Off"}</strong>
              <small>Controlled by Render environment</small>
            </article>
            <article>
              {snapshot.settings.enforcementEnabled ? (
                <ShieldCheck size={18} />
              ) : (
                <ShieldAlert size={18} />
              )}
              <span>Policy enforcement</span>
              <strong>{snapshot.settings.enforcementEnabled ? "On" : "Off"}</strong>
              <small>Fails closed when enabled</small>
            </article>
            <article>
              <Activity size={18} />
              <span>Runs / 24 hours</span>
              <strong>{snapshot.usage.totalRuns}</strong>
              <small>{snapshot.usage.failedRuns} unsuccessful</small>
            </article>
          </section>

          <section className="ai-governance-section">
            <header>
              <span className="overline">Provider allowlist</span>
              <h2>Approved AI operators</h2>
              <p>API keys are supplied separately and are never returned by this page.</p>
            </header>
            <div className="ai-provider-grid">
              {draft.providerPolicies.map((policy, index) => (
                <article key={policy.provider}>
                  <header>
                    <div>
                      <span className="overline">{labels[policy.provider]}</span>
                      <h3>{policy.provider}</h3>
                    </div>
                    <label className="ai-provider-toggle">
                      <input
                        checked={policy.enabled}
                        type="checkbox"
                        onChange={(event) => updatePolicy(index, { enabled: event.target.checked })}
                      />
                      Enabled
                    </label>
                  </header>
                  <label>
                    <span>Allowed models</span>
                    <textarea
                      aria-label={`${labels[policy.provider]} allowed models`}
                      placeholder="One model per line"
                      value={policy.allowedModels.join("\n")}
                      onChange={(event) => {
                        const allowedModels = event.target.value
                          .split(/\r?\n|,/u)
                          .map((model) => model.trim())
                          .filter(Boolean);
                        updatePolicy(index, {
                          allowedModels,
                          defaultModel: allowedModels.includes(policy.defaultModel || "")
                            ? policy.defaultModel
                            : allowedModels[0] || null
                        });
                      }}
                    />
                  </label>
                  <label>
                    <span>Default model</span>
                    <select
                      aria-label={`${labels[policy.provider]} default model`}
                      disabled={!policy.allowedModels.length}
                      value={policy.defaultModel || ""}
                      onChange={(event) =>
                        updatePolicy(index, { defaultModel: event.target.value })
                      }
                    >
                      {!policy.allowedModels.length ? (
                        <option value="">Add a model first</option>
                      ) : null}
                      {policy.allowedModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <footer data-status={snapshot.usage.providerHealth[index]?.status || "unknown"}>
                    {snapshot.usage.providerHealth[index]?.status || "unknown"} ·{" "}
                    {snapshot.usage.providerHealth[index]?.averageLatencyMs || 0} ms average
                  </footer>
                </article>
              ))}
            </div>
          </section>

          <section className="ai-governance-section">
            <header>
              <span className="overline">Runtime guardrails</span>
              <h2>Usage and safety limits</h2>
              <p>Every value must remain at or below its server-defined ceiling.</p>
            </header>
            <div className="ai-limit-grid">
              {(
                [
                  ["dailyRunLimit", "Daily runs"],
                  ["maxPromptCharacters", "Prompt characters"],
                  ["maxOutputTokens", "Output tokens"],
                  ["maxProposedActions", "Proposed actions"],
                  ["requestTimeoutMs", "Timeout (ms)"],
                  ["retentionDays", "Usage retention (days)"]
                ] as Array<[keyof Omit<AiGovernanceUpdate, "providerPolicies">, string]>
              ).map(([key, label]) => (
                <label key={key}>
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    max={snapshot.settings.serverCeilings[key]}
                    min="1"
                    type="number"
                    value={draft[key]}
                    onChange={(event) => updateLimit(key, event.target.value)}
                  />
                  <small>Server max {snapshot.settings.serverCeilings[key].toLocaleString()}</small>
                </label>
              ))}
            </div>
          </section>

          <footer className="ai-governance-save">
            <span>Changes affect new planning requests immediately after saving.</span>
            <button className="button primary" disabled={busy} type="submit">
              <Save size={16} /> {busy ? "Saving…" : "Save governance policy"}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}

export default AiGovernance;
