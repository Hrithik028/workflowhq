import {
  ArrowLeft,
  CheckCircle2,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequest,
  Rocket,
  Save,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type {
  ProjectWorkflowRule,
  ProjectWorkflowStatus,
  ProjectWorkflowTransition,
  TaskStatus,
  WorkflowTrigger
} from "../types";

const triggerMeta: Record<
  WorkflowTrigger,
  { title: string; description: string; icon: typeof GitCommitHorizontal }
> = {
  commit_pushed: {
    title: "Commit pushed",
    description: "A linked commit contains this ticket's exact issue key.",
    icon: GitCommitHorizontal
  },
  pull_request_opened: {
    title: "Pull request opened",
    description: "An opened or reopened pull request links to this ticket.",
    icon: GitPullRequest
  },
  pull_request_merged: {
    title: "Pull request merged",
    description: "A linked pull request is merged into its base branch.",
    icon: GitMerge
  },
  check_run_succeeded: {
    title: "Checks succeeded",
    description: "A linked GitHub check run finishes successfully.",
    icon: CheckCircle2
  },
  deployment_succeeded: {
    title: "Deployment succeeded",
    description: "A linked GitHub deployment reports a successful status.",
    icon: Rocket
  }
};

const statuses: Array<{ value: TaskStatus; label: string; order: number }> = [
  { value: "todo", label: "Backlog", order: 1 },
  { value: "in_progress", label: "In progress", order: 2 },
  { value: "completed", label: "Released", order: 3 }
];

function ProjectWorkflowSettings() {
  const { id = "" } = useParams();
  const projectId = Number(id);
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [project, setProject] = useState<{ id: number; key: string; name: string } | null>(null);
  const [rules, setRules] = useState<ProjectWorkflowRule[]>([]);
  const [statusNames, setStatusNames] = useState<ProjectWorkflowStatus[]>([]);
  const [transitions, setTransitions] = useState<ProjectWorkflowTransition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const workflow = await client.getProjectWorkflow(projectId);
      setProject(workflow.project);
      setRules(workflow.rules);
      setStatusNames(workflow.statuses);
      setTransitions(workflow.transitions);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load workflow rules."));
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const updateRule = (
    trigger: WorkflowTrigger,
    change: Partial<Pick<ProjectWorkflowRule, "enabled" | "fromStatus" | "toStatus">>
  ) => {
    setRules((current) =>
      current.map((rule) => {
        if (rule.trigger !== trigger) return rule;
        const next = { ...rule, ...change };
        const fromOrder = statuses.find((status) => status.value === next.fromStatus)?.order || 1;
        const toOrder = statuses.find((status) => status.value === next.toStatus)?.order || 2;
        if (toOrder <= fromOrder) {
          next.toStatus =
            statuses.find((status) => status.order === fromOrder + 1)?.value || "completed";
        }
        return next;
      })
    );
    setNotice("");
  };

  const save = async () => {
    setIsSaving(true);
    try {
      const workflow = await client.updateProjectWorkflow(
        projectId,
        rules.map(({ trigger, enabled, fromStatus, toStatus }) => ({
          trigger,
          enabled,
          fromStatus,
          toStatus
        })),
        { statuses: statusNames, transitions }
      );
      setRules(workflow.rules);
      setStatusNames(workflow.statuses);
      setTransitions(workflow.transitions);
      setError("");
      setNotice(
        "Workflow saved. Status names and manual moves apply now; GitHub rules apply to future verified webhooks."
      );
    } catch (saveError) {
      setNotice("");
      setError(getErrorMessage(saveError, "Unable to save workflow rules."));
    } finally {
      setIsSaving(false);
    }
  };

  const labelFor = (status: TaskStatus) =>
    statusNames.find((item) => item.status === status)?.label ||
    statuses.find((item) => item.value === status)?.label ||
    status;

  const toggleTransition = (fromStatus: TaskStatus, toStatus: TaskStatus) => {
    setTransitions((current) => {
      const exists = current.some(
        (item) => item.fromStatus === fromStatus && item.toStatus === toStatus
      );
      return exists
        ? current.filter((item) => item.fromStatus !== fromStatus || item.toStatus !== toStatus)
        : [...current, { fromStatus, toStatus }];
    });
    setNotice("");
  };

  return (
    <main className="project-workflow-page">
      <header className="engineering-page-header workflow-settings-header">
        <div>
          <Link className="overline" to="/projects">
            <ArrowLeft size={13} /> Project register
          </Link>
          <h1>Workflow rules.</h1>
          <p>
            {project ? `${project.key} / ${project.name}` : "Project"} · Name the stages, set manual
            moves, and automate verified GitHub events.
          </p>
        </div>
        <button
          className="button primary"
          disabled={isLoading || isSaving}
          onClick={() => void save()}
          type="button"
        >
          <Save size={16} /> {isSaving ? "Saving…" : "Save rules"}
        </button>
      </header>

      <section className="workflow-safety-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Forward-only and project-scoped</strong>
          <p>
            Rules run only for future signed webhooks, exact issue-key matches, and repositories
            assigned to this project. Historical imports never change ticket status.
          </p>
        </div>
      </section>

      {error ? <p className="form-alert error">{error}</p> : null}
      {notice ? <p className="form-alert notice">{notice}</p> : null}
      {isLoading ? <p className="register-loading">Loading workflow rules…</p> : null}

      {!isLoading ? (
        <section className="workflow-customization" aria-label="Project status configuration">
          <div>
            <h2>Project stages</h2>
            <p>
              Rename the three existing stages. Ticket history and GitHub automation keep their
              stable underlying statuses.
            </p>
          </div>
          <div className="workflow-status-names">
            {statusNames.map((item) => (
              <label key={item.status}>
                <span>{item.status.replace("_", " ")}</span>
                <input
                  aria-label={`Name for ${item.status.replace("_", " ")}`}
                  maxLength={40}
                  onChange={(event) => {
                    setStatusNames((current) =>
                      current.map((status) =>
                        status.status === item.status
                          ? { ...status, label: event.target.value }
                          : status
                      )
                    );
                    setNotice("");
                  }}
                  value={item.label}
                />
              </label>
            ))}
          </div>
          <h3>Allowed manual moves</h3>
          <div className="workflow-transition-list">
            {statuses.flatMap((from) =>
              statuses
                .filter((to) => to.value !== from.value)
                .map((to) => (
                  <label key={`${from.value}-${to.value}`}>
                    <input
                      checked={transitions.some(
                        (item) => item.fromStatus === from.value && item.toStatus === to.value
                      )}
                      onChange={() => toggleTransition(from.value, to.value)}
                      type="checkbox"
                    />
                    {labelFor(from.value)} → {labelFor(to.value)}
                  </label>
                ))
            )}
          </div>
        </section>
      ) : null}

      {!isLoading ? (
        <section className="workflow-rule-register" aria-label="GitHub workflow automation rules">
          <header aria-hidden="true">
            <span>Automation</span>
            <span>GitHub signal</span>
            <span>Required state</span>
            <span>Move ticket to</span>
          </header>
          {rules.map((rule) => {
            const meta = triggerMeta[rule.trigger];
            const Icon = meta.icon;
            const fromOrder =
              statuses.find((status) => status.value === rule.fromStatus)?.order || 1;
            return (
              <article className={rule.enabled ? "enabled" : ""} key={rule.trigger}>
                <label className="workflow-rule-toggle">
                  <input
                    checked={rule.enabled}
                    onChange={(event) =>
                      updateRule(rule.trigger, { enabled: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <span>{rule.enabled ? "On" : "Off"}</span>
                </label>
                <div className="workflow-rule-signal">
                  <Icon aria-hidden="true" size={20} />
                  <div>
                    <strong>{meta.title}</strong>
                    <p>{meta.description}</p>
                  </div>
                </div>
                <label>
                  <span>When ticket is</span>
                  <select
                    aria-label={`Required state for ${meta.title}`}
                    disabled={!rule.enabled}
                    onChange={(event) =>
                      updateRule(rule.trigger, { fromStatus: event.target.value as TaskStatus })
                    }
                    value={rule.fromStatus}
                  >
                    {statuses
                      .filter((status) => status.order < 3)
                      .map((status) => (
                        <option key={status.value} value={status.value}>
                          {labelFor(status.value)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  <span>Move to</span>
                  <select
                    aria-label={`Target state for ${meta.title}`}
                    disabled={!rule.enabled}
                    onChange={(event) =>
                      updateRule(rule.trigger, { toStatus: event.target.value as TaskStatus })
                    }
                    value={rule.toStatus}
                  >
                    {statuses
                      .filter((status) => status.order > fromOrder)
                      .map((status) => (
                        <option key={status.value} value={status.value}>
                          {labelFor(status.value)}
                        </option>
                      ))}
                  </select>
                </label>
              </article>
            );
          })}
        </section>
      ) : null}

      <footer className="workflow-settings-footer">
        <strong>
          {rules.filter((rule) => rule.enabled).length} of {rules.length} automations enabled
        </strong>
        <span>Manual ticket movement remains available to project editors and owners.</span>
      </footer>
    </main>
  );
}

export default ProjectWorkflowSettings;
