import { ArrowUpRight, MoreHorizontal, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Activity, Project, Task, TaskInput, TaskStats, TaskStatus } from "../types";
import {
  activityCopy,
  formatDate,
  formatRelativeTime,
  greeting,
  statusLabel
} from "../utils/format";

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

const priorityNumber = { high: "1", medium: "2", low: "3" } as const;

const dueTime = (task: Task) =>
  task.dueDate ? new Date(`${task.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;

function OverviewTaskCard({ task, onOpen }: { task: Task; onOpen: (task: Task) => void }) {
  return (
    <button className="overview-task-card" type="button" onClick={() => onOpen(task)}>
      <span className="overview-task-ref">WHQ-{String(task.id).padStart(3, "0")}</span>
      <span className={`overview-task-priority ${task.priority}`}>
        {priorityNumber[task.priority]}
      </span>
      <strong>{task.title}</strong>
      <span className="overview-task-project">{task.projectName || "Inbox"}</span>
      <span className="overview-task-meta">
        <i>{statusLabel[task.status]}</i>
        <b>{formatDate(task.dueDate)}</b>
      </span>
    </button>
  );
}

function Overview() {
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<TaskStats>(emptyStats);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult, statsResult, activityResult] = await Promise.all([
        client.listTasks({ limit: 100, sort: "due_date", order: "asc" }),
        client.listProjects(),
        client.getStats(),
        client.getActivity(7)
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setStats(statsResult);
      setActivities(activityResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the overview."));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      if (editingTask) await client.updateTask(editingTask.id, input);
      else await client.createTask(input);
      setEditingTask(null);
      setIsModalOpen(false);
      await loadOverview();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async (task: Task) => {
    setIsSaving(true);
    try {
      await client.deleteTask(task.id);
      setEditingTask(null);
      setIsModalOpen(false);
      await loadOverview();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const openCreate = (status: TaskStatus = "todo") => {
    setEditingTask(null);
    setNewTaskStatus(status);
    setIsModalOpen(true);
  };

  const openTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = tasks.filter(
    (task) => task.dueDate === today && task.status !== "completed"
  ).length;
  const completionRate = stats.totalTasks
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
    : 0;
  const nextTasks = tasks
    .filter((task) => task.status !== "completed")
    .sort((left, right) => dueTime(left) - dueTime(right))
    .slice(0, 4);
  const movingTasks = tasks.filter((task) => task.status === "in_progress").slice(0, 4);
  const shippedTasks = [...tasks]
    .filter((task) => task.status === "completed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4);

  const lanes: Array<{
    key: string;
    label: string;
    count: number;
    status: TaskStatus;
    tasks: Task[];
  }> = [
    { key: "today", label: "Today", count: nextTasks.length, status: "todo", tasks: nextTasks },
    {
      key: "moving",
      label: "In motion",
      count: stats.inProgressTasks,
      status: "in_progress",
      tasks: movingTasks
    },
    {
      key: "shipped",
      label: "Shipped",
      count: stats.completedTasks,
      status: "completed",
      tasks: shippedTasks
    }
  ];

  return (
    <main className="workspace-page overview-command-page" aria-busy={isLoading}>
      <header className="overview-command-header">
        <div>
          <span className="overline">Overview / 01</span>
          <h1>
            {greeting()}, {user.name.split(" ")[0]}.
          </h1>
          <p>Here’s what’s moving across your delivery desk.</p>
        </div>
        <button className="button primary" type="button" onClick={() => openCreate()}>
          <Plus size={17} /> New task
        </button>
      </header>

      {error ? <p className="form-alert error">{error}</p> : null}

      <section className="overview-metrics" aria-label="Workspace delivery summary">
        <article>
          <span>Due today</span>
          <strong>{dueToday}</strong>
          <small>
            High priority <b>{stats.highPriorityTasks}</b>
          </small>
        </article>
        <article>
          <span>In motion</span>
          <strong>{stats.inProgressTasks}</strong>
          <small>{Math.max(stats.inProgressTasks - stats.overdueTasks, 0)} on track</small>
        </article>
        <article>
          <span>Ready</span>
          <strong>{stats.todoTasks}</strong>
          <small>Across {projects.length} projects</small>
        </article>
        <article>
          <span>Shipped</span>
          <strong>{stats.completedTasks}</strong>
          <small>
            Completion rate <b>{completionRate}%</b>
          </small>
        </article>
      </section>

      <section className="overview-work-grid" aria-label="Current work and activity">
        {lanes.map((lane) => (
          <section className={`overview-lane ${lane.key}`} key={lane.key}>
            <header>
              <h2>{lane.label}</h2>
              <span>{lane.count}</span>
              <MoreHorizontal size={15} />
            </header>
            <div className="overview-lane-list">
              {lane.tasks.map((task) => (
                <OverviewTaskCard key={task.id} task={task} onOpen={openTask} />
              ))}
              {lane.tasks.length === 0 ? <p>No tasks in this lane.</p> : null}
            </div>
            <button
              className="overview-add-task"
              type="button"
              onClick={() => openCreate(lane.status)}
            >
              <Plus size={13} /> Add task
            </button>
          </section>
        ))}

        <aside className="overview-activity">
          <header>
            <span className="overline">Live</span>
            <h2>Recent activity</h2>
          </header>
          <div className="overview-activity-list">
            {activities.map((activity) => (
              <article key={activity.id}>
                <i className={activity.action.includes("completed") ? "complete" : ""} />
                <span>{formatRelativeTime(activity.createdAt)}</span>
                <strong>{activityCopy(activity)}</strong>
              </article>
            ))}
            {activities.length === 0 ? <p>Your latest changes will appear here.</p> : null}
          </div>
          <Link to="/reports">
            View delivery report <ArrowUpRight size={14} />
          </Link>
        </aside>
      </section>

      {isModalOpen ? (
        <TaskModal
          client={client}
          initialStatus={newTaskStatus}
          isSaving={isSaving}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
          }}
          onDelete={deleteTask}
          onSave={saveTask}
          projects={projects}
          task={editingTask}
          tasks={tasks}
        />
      ) : null}
    </main>
  );
}

export default Overview;
