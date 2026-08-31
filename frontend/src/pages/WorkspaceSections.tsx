import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  FileText,
  Inbox as InboxIcon,
  Settings2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import { CategoryBarChart, TrendBarChart } from "../components/AnalyticsCharts";
import type { LayoutContext } from "../components/AppLayout";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Activity, Project, Task, TaskStats } from "../types";
import { activityCopy, formatDate, formatRelativeTime, statusLabel } from "../utils/format";

const emptyStats: TaskStats = {
  totalTasks: 0,
  completedTasks: 0,
  inProgressTasks: 0,
  todoTasks: 0,
  highPriorityTasks: 0,
  mediumPriorityTasks: 0,
  lowPriorityTasks: 0,
  overdueTasks: 0,
  dailyCompletions: []
};

// Chart-only palette, separate from the app's own chrome colors (--carbon,
// --blueprint) which failed the dataviz skill's validator (lightness/chroma
// floor) - see the skill's default categorical slots and fixed status roles.
const statusChartColors = { todo: "#2a78d6", in_progress: "#eb6834", completed: "#1baf7a" };
const priorityChartColors = { high: "#d03b3b", medium: "#fab219", low: "#0ca30c" };

function useSectionData() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<TaskStats>(emptyStats);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult, activityResult, statsResult] = await Promise.all([
        client.listTasks({ limit: 100, sort: "updated_at", order: "desc" }),
        client.listProjects(),
        client.getActivity(10),
        client.getStats()
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setActivities(activityResult);
      setStats(statsResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load this workspace section."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  return { activities, error, isLoading, projects, stats, tasks };
}

function SectionHeader({
  action,
  copy,
  index,
  title
}: {
  action?: ReactNode;
  copy: string;
  index: string;
  title: string;
}) {
  return (
    <header className="workspace-header editorial-page-header section-page-header">
      <div>
        <span className="overline">Section / {index}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </header>
  );
}

function SectionState({ error, isLoading }: { error: string; isLoading: boolean }) {
  if (error) return <p className="form-alert error">{error}</p>;
  if (isLoading) return <p className="register-loading">Updating live workspace data…</p>;
  return null;
}

export function Content() {
  const { error, isLoading, projects, tasks } = useSectionData();
  const documentedTasks = tasks.filter((task) => task.description.trim()).slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  const updatedToday = tasks.filter((task) => task.updatedAt.slice(0, 10) === today).length;

  return (
    <main className="workspace-page editorial-page section-dashboard content-section">
      <SectionHeader
        index="05"
        title="Content library."
        copy="Project briefs and task context, organised as a practical delivery reference."
        action={
          <Link className="button secondary" to="/projects">
            Project register <ArrowUpRight size={15} />
          </Link>
        }
      />
      <SectionState error={error} isLoading={isLoading} />

      <section className="section-stat-strip" aria-label="Content summary">
        <article>
          <span>Project briefs</span>
          <strong>{projects.length}</strong>
        </article>
        <article>
          <span>Task notes</span>
          <strong>{tasks.filter((task) => task.description.trim()).length}</strong>
        </article>
        <article className="signal">
          <span>Updated today</span>
          <strong>{updatedToday}</strong>
        </article>
      </section>

      <div className="content-section-grid">
        <section className="content-briefs">
          <header>
            <span className="overline">Project briefs</span>
            <h2>Active outcomes</h2>
          </header>
          {projects.map((project, index) => {
            const progress = project.taskCount
              ? Math.round((project.completedCount / project.taskCount) * 100)
              : 0;
            return (
              <article key={project.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{project.name}</strong>
                  <p>{project.description || "No project brief has been added yet."}</p>
                </div>
                <b>{progress}%</b>
              </article>
            );
          })}
        </section>

        <section className="content-notes">
          <header>
            <span className="overline">Task notes</span>
            <h2>Latest context</h2>
          </header>
          {documentedTasks.map((task) => (
            <article key={task.id}>
              <FileText size={16} />
              <div>
                <strong>{task.title}</strong>
                <p>{task.description}</p>
                <span>{task.projectName || "Inbox"}</span>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export function Analytics() {
  const { error, isLoading, projects, stats } = useSectionData();
  const completionRate = stats.totalTasks
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0;

  return (
    <main className="workspace-page editorial-page section-dashboard analytics-section">
      <SectionHeader
        index="06"
        title="Delivery analytics."
        copy="A factual view of workload, completion, and project momentum."
        action={<BarChart3 size={29} strokeWidth={1.5} />}
      />
      <SectionState error={error} isLoading={isLoading} />

      <section className="section-stat-strip four" aria-label="Delivery analytics summary">
        <article>
          <span>Total tasks</span>
          <strong>{stats.totalTasks}</strong>
        </article>
        <article>
          <span>Completion</span>
          <strong>{completionRate}%</strong>
        </article>
        <article>
          <span>In motion</span>
          <strong>{stats.inProgressTasks}</strong>
        </article>
        <article className="signal">
          <span>Overdue</span>
          <strong>{stats.overdueTasks}</strong>
        </article>
      </section>

      <div className="analytics-charts-grid">
        <CategoryBarChart
          title="Status breakdown"
          categories={[
            { key: "todo", label: "Ready", value: stats.todoTasks, color: statusChartColors.todo },
            {
              key: "in_progress",
              label: "In motion",
              value: stats.inProgressTasks,
              color: statusChartColors.in_progress
            },
            {
              key: "completed",
              label: "Shipped",
              value: stats.completedTasks,
              color: statusChartColors.completed
            }
          ]}
        />
        <CategoryBarChart
          title="Priority breakdown"
          categories={[
            {
              key: "high",
              label: "High",
              value: stats.highPriorityTasks,
              color: priorityChartColors.high
            },
            {
              key: "medium",
              label: "Medium",
              value: stats.mediumPriorityTasks,
              color: priorityChartColors.medium
            },
            { key: "low", label: "Low", value: stats.lowPriorityTasks, color: priorityChartColors.low }
          ]}
        />
        <TrendBarChart
          caption="Tasks marked shipped each day, by last-updated date."
          color="#ff4d00"
          data={stats.dailyCompletions}
          title="Completion trend (14 days)"
        />
      </div>

      <section className="analytics-ledger">
        <header>
          <span>Project</span>
          <span>Tasks</span>
          <span>Shipped</span>
          <span>Progress</span>
        </header>
        {projects.map((project) => {
          const progress = project.taskCount
            ? Math.round((project.completedCount / project.taskCount) * 100)
            : 0;
          return (
            <article key={project.id}>
              <strong>{project.name}</strong>
              <span>{project.taskCount}</span>
              <span>{project.completedCount}</span>
              <div>
                <b>{progress}%</b>
                <div className="progress-track">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

export function Reports() {
  const { activities, error, isLoading, stats, tasks } = useSectionData();
  const today = new Date().toISOString().slice(0, 10);
  const risks = tasks
    .filter(
      (task) =>
        task.status !== "completed" &&
        (task.priority === "high" || Boolean(task.dueDate && task.dueDate < today))
    )
    .slice(0, 6);
  const completionRate = stats.totalTasks
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0;

  return (
    <main className="workspace-page editorial-page section-dashboard reports-section">
      <SectionHeader
        index="07"
        title="Delivery report."
        copy="A concise operating snapshot built from current tasks and recorded activity."
        action={
          <Link className="button secondary" to="/analytics">
            Open analytics <ArrowUpRight size={15} />
          </Link>
        }
      />
      <SectionState error={error} isLoading={isLoading} />

      <section className="report-hero">
        <div>
          <span className="overline">Current completion</span>
          <strong>{completionRate}%</strong>
          <p>{stats.completedTasks} tasks shipped across the active workspace.</p>
        </div>
        <dl>
          <div>
            <dt>Ready</dt>
            <dd>{stats.todoTasks}</dd>
          </div>
          <div>
            <dt>In motion</dt>
            <dd>{stats.inProgressTasks}</dd>
          </div>
          <div>
            <dt>High priority</dt>
            <dd>{stats.highPriorityTasks}</dd>
          </div>
          <div>
            <dt>Overdue</dt>
            <dd>{stats.overdueTasks}</dd>
          </div>
        </dl>
      </section>

      <div className="report-columns">
        <section className="report-risks">
          <header>
            <CircleAlert size={17} />
            <h2>Needs attention</h2>
          </header>
          {risks.map((task) => (
            <article key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.projectName || "Inbox"}</span>
              </div>
              <b>{formatDate(task.dueDate)}</b>
            </article>
          ))}
          {risks.length === 0 ? <p>No high-priority or overdue work.</p> : null}
        </section>

        <section className="report-activity">
          <header>
            <CheckCircle2 size={17} />
            <h2>Recorded movement</h2>
          </header>
          {activities.slice(0, 6).map((activity) => (
            <article key={activity.id}>
              <span>{formatRelativeTime(activity.createdAt)}</span>
              <strong>{activityCopy(activity)}</strong>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

export function Inbox() {
  const { error, isLoading, tasks } = useSectionData();
  const inboxTasks = tasks.filter((task) => task.projectId === null);

  return (
    <main className="workspace-page editorial-page section-dashboard inbox-section">
      <SectionHeader
        index="08"
        title="Inbox."
        copy="Unassigned work waits here until it has the right project and priority."
        action={<InboxIcon size={29} strokeWidth={1.5} />}
      />
      <SectionState error={error} isLoading={isLoading} />

      {inboxTasks.length === 0 && !isLoading ? (
        <section className="inbox-clear">
          <CheckCircle2 size={30} />
          <span className="overline">Inbox zero</span>
          <h2>Everything has a home.</h2>
          <p>There are no unassigned tasks in the current workspace.</p>
          <Link className="button secondary" to="/tasks">
            Open task register <ArrowUpRight size={15} />
          </Link>
        </section>
      ) : (
        <section className="inbox-list">
          {inboxTasks.map((task) => (
            <article key={task.id}>
              <span>{task.issueKey}</span>
              <div>
                <strong>{task.title}</strong>
                <p>{task.description || "No context added yet."}</p>
              </div>
              <b>{statusLabel[task.status]}</b>
              <small>{formatDate(task.dueDate)}</small>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export function Settings() {
  const { user } = useOutletContext<LayoutContext>();
  const [compact, setCompact] = useState(
    () => localStorage.getItem("workflowhq-density") === "compact"
  );
  const [reduceMotion, setReduceMotion] = useState(
    () => localStorage.getItem("workflowhq-motion") === "reduced"
  );

  useEffect(() => {
    document.documentElement.dataset.density = compact ? "compact" : "comfortable";
    localStorage.setItem("workflowhq-density", compact ? "compact" : "comfortable");
  }, [compact]);

  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? "reduced" : "full";
    localStorage.setItem("workflowhq-motion", reduceMotion ? "reduced" : "full");
  }, [reduceMotion]);

  return (
    <main className="workspace-page editorial-page section-dashboard settings-section">
      <SectionHeader
        index="09"
        title="Settings."
        copy="Account details and local interface preferences for this workspace."
        action={<Settings2 size={29} strokeWidth={1.5} />}
      />

      <div className="settings-grid">
        <section>
          <span className="overline">Account</span>
          <h2>Profile</h2>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role}</dd>
            </div>
          </dl>
        </section>

        <section>
          <span className="overline">Interface</span>
          <h2>Preferences</h2>
          <label className="settings-toggle">
            <span>
              <strong>Compact task density</strong>
              <small>Fit more work into task registers and overview lanes.</small>
            </span>
            <input
              checked={compact}
              type="checkbox"
              onChange={(event) => setCompact(event.target.checked)}
            />
          </label>
          <label className="settings-toggle">
            <span>
              <strong>Reduce interface motion</strong>
              <small>Disable non-essential transitions and entrance animation.</small>
            </span>
            <input
              checked={reduceMotion}
              type="checkbox"
              onChange={(event) => setReduceMotion(event.target.checked)}
            />
          </label>
          <p className="settings-note">Preferences are stored only in this browser.</p>
        </section>
      </div>
    </main>
  );
}
