import { Bot, Check, KeyRound, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { aiPlannerApi } from "../api/aiPlanner";
import { getErrorMessage } from "../api/client";
import type { AiProvider, AiTaskPlan, Project } from "../types";

const providerDefaults: Record<AiProvider, string> = {
  openai: "gpt-5-mini",
  anthropic: "claude-sonnet-5",
  google: "gemini-3.8-flash"
};

interface AiPlanModalProps {
  initialProjectId?: number | null;
  onApplied: (count: number) => Promise<void> | void;
  onClose: () => void;
  projects: Project[];
}

function AiPlanModal({ initialProjectId, onApplied, onClose, projects }: AiPlanModalProps) {
  const [projectId, setProjectId] = useState(String(initialProjectId || projects[0]?.id || ""));
  const [provider, setProvider] = useState<AiProvider>("openai");
  const [model, setModel] = useState(providerDefaults.openai);
  const [apiKey, setApiKey] = useState("");
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [maxItems, setMaxItems] = useState(8);
  const [plan, setPlan] = useState<AiTaskPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const taskById = useMemo(
    () => new Map((plan?.tasks || []).map((task) => [task.tempId, task])),
    [plan]
  );

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId || !apiKey.trim() || !goal.trim() || !model.trim()) {
      setError("Choose a project and provide a model, API key, and planning goal.");
      return;
    }
    setBusy("preview");
    setError("");
    try {
      const preview = await aiPlannerApi.preview(Number(projectId), {
        provider,
        apiKey: apiKey.trim(),
        model: model.trim(),
        goal: goal.trim(),
        context: context.trim() || undefined,
        maxItems
      });
      setPlan(preview.plan);
      setSelected(new Set(preview.plan.tasks.map((task) => task.tempId)));
      setApiKey("");
    } catch (previewError) {
      setError(getErrorMessage(previewError, "Unable to generate a safe task preview."));
    } finally {
      setBusy(null);
    }
  };

  const toggle = (tempId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(tempId)) {
        next.delete(tempId);
        let changed = true;
        while (changed) {
          changed = false;
          for (const task of plan?.tasks || []) {
            if (task.parentTempId && !next.has(task.parentTempId) && next.delete(task.tempId)) {
              changed = true;
            }
          }
        }
      } else {
        let cursor = taskById.get(tempId);
        while (cursor) {
          next.add(cursor.tempId);
          cursor = cursor.parentTempId ? taskById.get(cursor.parentTempId) : undefined;
        }
      }
      return next;
    });
  };

  const approvedPlan = useMemo<AiTaskPlan | null>(() => {
    if (!plan) return null;
    return { ...plan, tasks: plan.tasks.filter((task) => selected.has(task.tempId)) };
  }, [plan, selected]);

  const apply = async () => {
    if (!approvedPlan?.tasks.length || !projectId) return;
    setBusy("apply");
    setError("");
    try {
      const created = await aiPlannerApi.apply(Number(projectId), approvedPlan);
      await onApplied(created.length);
      onClose();
    } catch (applyError) {
      setError(getErrorMessage(applyError, "Unable to apply the approved task plan."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="modal ai-plan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-plan-title"
      >
        <header className="modal-header">
          <div>
            <span className="overline">AI / Preview first</span>
            <h2 id="ai-plan-title">Plan issues with AI</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>

        <form className="modal-form ai-plan-form" onSubmit={generate}>
          <div className="ai-plan-safety-note">
            <KeyRound size={18} />
            <p>
              <strong>Your key is request-scoped.</strong> It is sent only to generate this preview,
              then cleared. WorkHQ does not store it.
            </p>
          </div>
          <div className="modal-form-grid">
            <label>
              <span>Project</span>
              <select
                aria-label="AI plan project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.key} — {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Provider</span>
              <select
                aria-label="AI provider"
                value={provider}
                onChange={(event) => {
                  const value = event.target.value as AiProvider;
                  setProvider(value);
                  setModel(providerDefaults[value]);
                  setPlan(null);
                }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <input
                aria-label="AI model"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </label>
            <label>
              <span>API key</span>
              <input
                aria-label="Provider API key"
                autoComplete="off"
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
          </div>
          <label>
            <span>What should we plan?</span>
            <textarea
              aria-label="Planning goal"
              maxLength={4000}
              rows={4}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Describe the outcome, users, constraints, and definition of done."
            />
          </label>
          <label>
            <span>
              Extra context <small>Optional</small>
            </span>
            <textarea
              aria-label="Planning context"
              maxLength={8000}
              rows={3}
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="Architecture notes, release constraints, or existing work."
            />
          </label>
          <label className="ai-plan-count">
            <span>Maximum issues: {maxItems}</span>
            <input
              aria-label="Maximum issues"
              min="1"
              max="30"
              type="range"
              value={maxItems}
              onChange={(event) => setMaxItems(Number(event.target.value))}
            />
          </label>
          <button className="button secondary" disabled={busy !== null} type="submit">
            <Sparkles size={16} /> {busy === "preview" ? "Generating preview…" : "Generate preview"}
          </button>
        </form>

        {error ? (
          <p className="form-error ai-plan-error" role="alert">
            {error}
          </p>
        ) : null}

        {plan ? (
          <section className="ai-plan-preview" aria-label="AI task plan preview">
            <header>
              <div>
                <span className="overline">Approval gate</span>
                <h3>{plan.summary}</h3>
              </div>
              <strong>
                {selected.size} / {plan.tasks.length} selected
              </strong>
            </header>
            <div className="ai-plan-items">
              {plan.tasks.map((task) => (
                <label
                  className="ai-plan-item"
                  key={task.tempId}
                  style={{ marginLeft: task.parentTempId ? 24 : 0 }}
                >
                  <input
                    checked={selected.has(task.tempId)}
                    type="checkbox"
                    onChange={() => toggle(task.tempId)}
                  />
                  <span>
                    <b>{task.taskType}</b>
                    <strong>{task.title}</strong>
                    <small>
                      {task.description || "No description"} · {task.acceptanceCriteria.length}{" "}
                      criteria{task.dueDate ? ` · due ${task.dueDate}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
            <footer>
              <p>Nothing is created until you apply this approved preview.</p>
              <button
                className="button primary"
                disabled={busy !== null || selected.size === 0}
                type="button"
                onClick={() => void apply()}
              >
                <Check size={16} />{" "}
                {busy === "apply" ? "Creating issues…" : `Create ${selected.size} issues`}
              </button>
            </footer>
          </section>
        ) : (
          <div className="ai-plan-empty">
            <Bot size={28} />
            <p>
              Generate a preview, inspect every proposed issue, then choose what WorkHQ may create.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

export default AiPlanModal;
