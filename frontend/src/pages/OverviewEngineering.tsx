import {
  ArrowUpRight,
  CheckCircle2,
  Github,
  GitBranch,
  MoreHorizontal,
  Plus,
  ShieldAlert,
  UserRound
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Activity, Project, Task, TaskInput, TaskStatus } from "../types";
import { activityCopy, formatRelativeTime } from "../utils/format";

type CommandLane = "building" | "release";

const laneFor = (task: Task): CommandLane => (task.status === "completed" ? "release" : "building");

function CommandTicket({ isDemo, task }: { isDemo: boolean; task: Task }) {
  return (
    <Link className="command-ticket" to={`/tasks/${task.id}`}>
      <span className="command-ticket-key">{task.issueKey}</span>
      <strong>{task.title}</strong>
      <small>{task.projectName || "Inbox"}</small>
      <div className="command-ticket-footer">
        {isDemo && task.status === "completed" ? (
          <span className="command-check-badge">
            <CheckCircle2 size={13} /> checks passed
          </span>
        ) : (
          <span className="command-branch-badge">
            <UserRound size={13} /> {task.assigneeName || "Unassigned"}
          </span>
        )}
      </div>
      <b className={`command-priority-number ${task.priority}`}>
        {task.priority === "high" ? 1 : task.priority === "medium" ? 2 : 3}
      </b>
    </Link>
  );
}

function OverviewEngineering() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult, activityResult] = await Promise.all([
        client.listTasks({ limit: 100, sort: "updated_at", order: "desc" }),
        client.listProjects(),
        client.getActivity(12)
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setActivities(activityResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the command center."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      await client.createTask(input);
      setIsModalOpen(false);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to create the ticket."));
    } finally {
      setIsSaving(false);
    }
  };

  const lanes: Array<{ key: CommandLane; label: string; status: TaskStatus; tasks: Task[] }> = [
    {
      key: "building",
      label: "Building",
      status: "in_progress",
      tasks: tasks.filter((task) => laneFor(task) === "building").slice(0, 4)
    },
    {
      key: "release",
      label: "Ready to release",
      status: "completed",
      tasks: tasks.filter((task) => laneFor(task) === "release").slice(0, 4)
    }
  ];
  const openPrs = isDemo ? tasks.filter((task) => task.status === "in_progress").length : null;
  const failingChecks = isDemo ? 0 : null;
  const deployed = isDemo ? tasks.filter((task) => task.status === "completed").length : null;

  return (
    <main className="workspace-page engineering-command-page" aria-busy={isLoading}>
      <header className="engineering-page-header">
        <div>
          <span className="overline">Engineering / Command center</span>
          <h1>Engineering command center</h1>
          <p>Your GitHub-native command center. Plan, build, ship.</p>
        </div>
        <button className="button primary" type="button" onClick={() => setIsModalOpen(true)}>
          <Plus size={17} /> New ticket
        </button>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}

      {isDemo ? (
        <p className="sample-data-notice">
          Sample engineering data — repository, pull request, check, and deployment signals are
          illustrative.
        </p>
      ) : null}

      <section className="command-metrics" aria-label="Engineering delivery metrics">
        <article>
          <span>Active tickets</span>
          <strong>{tasks.filter((task) => task.status !== "completed").length}</strong>
          <small>Across {projects.length} projects</small>
        </article>
        <article>
          <span>Open PRs</span>
          <strong className={!isDemo ? "metric-unavailable" : ""}>{openPrs ?? "—"}</strong>
          <small>{isDemo ? "Awaiting review" : "Connect GitHub to track"}</small>
        </article>
        <article className="attention">
          <span>Failing checks</span>
          <strong className={!isDemo ? "metric-unavailable" : ""}>{failingChecks ?? "—"}</strong>
          <small>{isDemo ? "Requiring attention" : "Connect GitHub to track"}</small>
        </article>
        <article>
          <span>Deployed this week</span>
          <strong className={!isDemo ? "metric-unavailable" : ""}>{deployed ?? "—"}</strong>
          <small>{isDemo ? "Sample deployments" : "Connect GitHub to track"}</small>
        </article>
      </section>

      <section className="command-grid">
        <div className="command-board">
          {lanes.map((lane) => (
            <section className={`command-lane ${lane.key}`} key={lane.key}>
              <header>
                <h2>{lane.label}</h2>
                <span>{lane.tasks.length}</span>
                <MoreHorizontal size={17} />
              </header>
              <div className="command-ticket-list">
                {lane.tasks.map((task) => (
                  <CommandTicket isDemo={isDemo} key={task.id} task={task} />
                ))}
                {!lane.tasks.length ? (
                  <p className="command-empty">No tickets in this lane.</p>
                ) : null}
              </div>
              <button
                className="command-new-ticket"
                type="button"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus size={14} /> New ticket
              </button>
            </section>
          ))}
        </div>

        <aside className="live-development">
          <header>
            <span>{isDemo ? "Sample development" : "Workflow activity"}</span>
          </header>
          <div>
            {activities.slice(0, 6).map((activity) => {
              const task = tasks.find((item) => item.id === activity.entityId);
              return (
                <article key={activity.id}>
                  {activity.action.includes("deleted") ? (
                    <ShieldAlert size={25} />
                  ) : activity.action === "task_created" || activity.action === "project_created" ? (
                    <GitBranch size={25} />
                  ) : isDemo ? (
                    <Github size={25} />
                  ) : (
                    <CheckCircle2 size={25} />
                  )}
                  <div>
                    <time>{formatRelativeTime(activity.createdAt)}</time>
                    <strong>{activityCopy(activity)}</strong>
                    <small>{task?.projectKey?.toLowerCase() || "workflowhq"}</small>
                  </div>
                </article>
              );
            })}
          </div>
          <Link to="/reports">
            View full activity <ArrowUpRight size={14} />
          </Link>
        </aside>
      </section>

      <footer className={`command-footer${isDemo ? "" : " disconnected"}`}>
        <span>
          <Github size={18} /> {isDemo ? "Sample GitHub connection" : "GitHub not connected"}
        </span>
        <span>
          {isDemo
            ? `${projects.length} sample repositories`
            : "No repositories or contributors imported"}
        </span>
        <span>
          {isDemo ? (
            <>
              Sample sync <i />
            </>
          ) : (
            "Not synced"
          )}
        </span>
      </footer>

      {isModalOpen ? (
        <TaskModal
          client={client}
          isSaving={isSaving}
          onClose={() => setIsModalOpen(false)}
          onDelete={async () => undefined}
          onSave={saveTask}
          projects={projects}
          task={null}
          tasks={tasks}
        />
      ) : null}
    </main>
  );
}

export default OverviewEngineering;
