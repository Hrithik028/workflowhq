import { ArrowUpRight, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task, TaskInput, TaskPriority, TaskStatus } from "../types";
import { formatDate, statusLabel } from "../utils/format";

const priorityCode: Record<TaskPriority, string> = {
  high: "P1",
  medium: "P2",
  low: "P3"
};

function Tasks() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [priority, setPriority] = useState<"" | TaskPriority>("");
  const [projectId, setProjectId] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks({
          limit: 100,
          search: search || undefined,
          status: status || undefined,
          priority: priority || undefined,
          projectId: projectId ? Number(projectId) : undefined,
          sort: "due_date",
          order: "asc"
        }),
        client.listProjects()
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the task register."));
    } finally {
      setIsLoading(false);
    }
  }, [client, priority, projectId, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTasks(), search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadTasks, search]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      if (editingTask) await client.updateTask(editingTask.id, input);
      else await client.createTask(input);
      setEditingTask(null);
      setIsModalOpen(false);
      await loadTasks();
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
      await loadTasks();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const updateStatus = async (task: Task, nextStatus: TaskStatus) => {
    if (task.status === nextStatus) return;
    setTasks((items) =>
      items.map((item) => (item.id === task.id ? { ...item, status: nextStatus } : item))
    );
    try {
      await client.updateTask(task.id, {
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: nextStatus,
        priority: task.priority,
        dueDate: task.dueDate
      });
    } catch (statusError) {
      setError(getErrorMessage(statusError, "Unable to update the task status."));
      await loadTasks();
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const completed = tasks.filter((task) => task.status === "completed").length;
  const active = tasks.filter((task) => task.status === "in_progress").length;
  const overdue = tasks.filter(
    (task) => task.dueDate && task.dueDate < today && task.status !== "completed"
  ).length;

  return (
    <main className="workspace-page tasks-page editorial-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">Register / 04</span>
          <h1>Task register.</h1>
          <p>Search, prioritise, and move every commitment from ready to shipped.</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            setEditingTask(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={17} /> New task
        </button>
      </header>

      <section className="task-register-summary" aria-label="Visible task summary">
        <div>
          <span>Visible</span>
          <strong>{tasks.length}</strong>
        </div>
        <div>
          <span>Moving</span>
          <strong>{active}</strong>
        </div>
        <div>
          <span>Shipped</span>
          <strong>{completed}</strong>
        </div>
        <div className={overdue ? "attention" : ""}>
          <span>Overdue</span>
          <strong>{overdue}</strong>
        </div>
      </section>

      <div className="editorial-filter-row">
        <label className="editorial-search">
          <Search size={16} />
          <span className="sr-only">Search tasks</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SEARCH THE REGISTER"
            value={search}
          />
        </label>
        <select
          aria-label="Filter by status"
          onChange={(event) => setStatus(event.target.value as "" | TaskStatus)}
          value={status}
        >
          <option value="">ALL STATUS</option>
          <option value="todo">READY</option>
          <option value="in_progress">IN PROGRESS</option>
          <option value="completed">SHIPPED</option>
        </select>
        <select
          aria-label="Filter by priority"
          onChange={(event) => setPriority(event.target.value as "" | TaskPriority)}
          value={priority}
        >
          <option value="">ALL PRIORITIES</option>
          <option value="high">P1 / HIGH</option>
          <option value="medium">P2 / MEDIUM</option>
          <option value="low">P3 / LOW</option>
        </select>
        <select
          aria-label="Filter by project"
          onChange={(event) => setProjectId(event.target.value)}
          value={projectId}
        >
          <option value="">ALL PROJECTS</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="form-alert error">{error}</p> : null}

      <section className="task-register" aria-label="Task register">
        <div className="task-register-head" aria-hidden="true">
          <span>Ref</span>
          <span>Task / project</span>
          <span>Priority</span>
          <span>Status</span>
          <span>Due</span>
          <span />
        </div>
        {isLoading && tasks.length === 0 ? (
          <p className="register-loading">Loading register…</p>
        ) : null}
        {!isLoading && tasks.length === 0 ? (
          <div className="workspace-empty">
            <h2>No tasks match this register.</h2>
            <p>Change the filters or create the next piece of work.</p>
          </div>
        ) : null}
        {tasks.map((task) => {
          const isOverdue = Boolean(
            task.dueDate && task.dueDate < today && task.status !== "completed"
          );
          return (
            <article className="task-register-row" key={task.id}>
              <span className="task-reference">WHQ-{String(task.id).padStart(3, "0")}</span>
              <button
                className="register-task-title"
                type="button"
                onClick={() => {
                  setEditingTask(task);
                  setIsModalOpen(true);
                }}
              >
                <strong>{task.title}</strong>
                <span>{task.projectName || "Inbox"}</span>
              </button>
              <span className={`editorial-priority ${task.priority}`}>
                <strong>{priorityCode[task.priority]}</strong>
                {task.priority}
              </span>
              <label className={`editorial-status ${task.status}`}>
                <span className="sr-only">Change status for {task.title}</span>
                <select
                  aria-label={`Change status for ${task.title}`}
                  onChange={(event) => void updateStatus(task, event.target.value as TaskStatus)}
                  value={task.status}
                >
                  {(Object.keys(statusLabel) as TaskStatus[]).map((statusValue) => (
                    <option key={statusValue} value={statusValue}>
                      {statusLabel[statusValue]}
                    </option>
                  ))}
                </select>
              </label>
              <span className={isOverdue ? "register-due overdue" : "register-due"}>
                {formatDate(task.dueDate)}
              </span>
              <button
                className="register-open"
                type="button"
                aria-label={`Open ${task.title}`}
                onClick={() => {
                  setEditingTask(task);
                  setIsModalOpen(true);
                }}
              >
                <ArrowUpRight size={17} />
              </button>
            </article>
          );
        })}
      </section>

      {isModalOpen ? (
        <TaskModal
          isSaving={isSaving}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
          }}
          onDelete={deleteTask}
          onSave={saveTask}
          projects={projects}
          task={editingTask}
        />
      ) : null}
    </main>
  );
}

export default Tasks;
