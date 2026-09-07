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
import type { ProjectWorkflowRule, TaskStatus, WorkflowTrigger } from "../types";

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
  { value: "todo", label: "Ready", order: 1 },
  { value: "in_progress", label: "In motion", order: 2 },
  { value: "completed", label: "Shipped", order: 3 }
];

function ProjectWorkflowSettings() {
  const { id = "" } = useParams();
  const projectId = Number(id);
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [project, setProject] = useState<{ id: number; key: string; name: string } | null>(null);
  const [rules, setRules] = useState<ProjectWorkflowRule[]>([]);
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
          next.toStatus = statuses.find((status) => status.order === fromOrder + 1)?.value || "completed";
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
        }))
      );
      setRules(workflow.rules);
      setError("");
      setNotice("Workflow rules saved. They apply to future verified GitHub webhooks.");
    } catch (saveError) {
      setNotice("");
      setError(getErrorMessage(saveError, "Unable to save workflow rules."));
    } finally {
      setIsSaving(false);
    }
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
            {project ? `${project.key} / ${project.name}` : "Project"} · Let verified GitHub events move linked tickets.
          </p>
        </div>
        <button className="button primary" disabled={isLoading || isSaving} onClick={() => void save()} type="button">
          <Save size={16} /> {isSaving ? "Saving…" : "Save rules"}
        </button>
      </header>

      <section className="workflow-safety-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Forward-only and project-scoped</strong>
          <p>
            Rules run only for future signed webhooks, exact issue-key matches, and repositories assigned to this project. Historical imports never change ticket status.
          </p>
        </div>
      </section>

      {error ? <p className="form-alert error">{error}</p> : null}
      {notice ? <p className="form-alert notice">{notice}</p> : null}
      {isLoading ? <p className="register-loading">Loading workflow rules…</p> : null}

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
            const fromOrder = statuses.find((status) => status.value === rule.fromStatus)?.order || 1;
            return (
              <article className={rule.enabled ? "enabled" : ""} key={rule.trigger}>
                <label className="workflow-rule-toggle">
                  <input
                    checked={rule.enabled}
                    onChange={(event) => updateRule(rule.trigger, { enabled: event.target.checked })}
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
                    onChange={(event) => updateRule(rule.trigger, { fromStatus: event.target.value as TaskStatus })}
                    value={rule.fromStatus}
                  >
                    {statuses.filter((status) => status.order < 3).map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Move to</span>
                  <select
                    aria-label={`Target state for ${meta.title}`}
                    disabled={!rule.enabled}
                    onChange={(event) => updateRule(rule.trigger, { toStatus: event.target.value as TaskStatus })}
                    value={rule.toStatus}
                  >
                    {statuses.filter((status) => status.order > fromOrder).map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
        </section>
      ) : null}

      <footer className="workflow-settings-footer">
        <strong>{rules.filter((rule) => rule.enabled).length} of {rules.length} automations enabled</strong>
        <span>Manual ticket movement remains available to project editors and owners.</span>
      </footer>
    </main>
  );
}

export default ProjectWorkflowSettings;
