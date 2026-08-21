import { ChevronDown, FolderKanban, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import ActivityFeed from "../components/ActivityFeed";
import type { LayoutContext } from "../components/AppLayout";
import FilterBar, { type Filters } from "../components/FilterBar";
import KanbanBoard from "../components/KanbanBoard";
import StatsGrid from "../components/StatsGrid";
import TaskModal from "../components/TaskModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Activity, Project, Task, TaskInput, TaskStats, TaskStatus } from "../types";
import { greeting } from "../utils/format";

const emptyStats: TaskStats = {
  totalTasks: 0,
  completedTasks: 0,
  inProgressTasks: 0,
  todoTasks: 0,
  highPriorityTasks: 0,
  overdueTasks: 0
};

const initialFilters: Filters = {
  search: "",
  projectId: "",
  priority: "",
  sort: "updated_at"
};

function Workspace() {
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const [searchParams] = useSearchParams();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<TaskStats>(emptyStats);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [filters, setFilters] = useState<Filters>({
    ...initialFilters,
    projectId: searchParams.get("project") || ""
  });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    try {
      const projectId = filters.projectId ? Number(filters.projectId) : undefined;
      const [taskResult, projectResult, statsResult, activityResult] = await Promise.all([
        client.listTasks({
          limit: 100,
          search: filters.search || undefined,
          priority: filters.priority || undefined,
          projectId,
          sort: filters.sort,
          order: filters.sort === "title" || filters.sort === "due_date" ? "asc" : "desc"
        }),
        client.listProjects(),
        client.getStats(projectId),
        client.getActivity(8)
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setStats(statsResult);
      setActivities(activityResult);
    } catch (error) {
      setNotice({
        tone: "error",
        message: getErrorMessage(error, "Unable to load the workspace.")
      });
    } finally {
      setIsLoading(false);
    }
  }, [client, filters]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), filters.search ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace, filters.search]);

  const openCreate = (status: TaskStatus = "todo") => {
    setEditingTask(null);
    setNewTaskStatus(status);
    setIsTaskModalOpen(true);
  };

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      if (editingTask) {
        await client.updateTask(editingTask.id, input);
        setNotice({ tone: "success", message: "Task updated." });
      } else {
        await client.createTask(input);
        setNotice({ tone: "success", message: "Task created." });
      }
      setIsTaskModalOpen(false);
      setEditingTask(null);
      await loadWorkspace();
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "Unable to save the task.") });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async (task: Task) => {
    setIsSaving(true);
    try {
      await client.deleteTask(task.id);
      setIsTaskModalOpen(false);
      setEditingTask(null);
      setNotice({ tone: "success", message: "Task deleted." });
      await loadWorkspace();
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "Unable to delete the task.") });
    } finally {
      setIsSaving(false);
    }
  };

  const moveTask = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    const previous = tasks;
    setTasks((items) => items.map((item) => (item.id === task.id ? { ...item, status } : item)));
    try {
      await client.updateTask(task.id, {
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status,
        priority: task.priority,
        dueDate: task.dueDate
      });
      setNotice({ tone: "success", message: `Moved “${task.title}”.` });
      await loadWorkspace();
    } catch (error) {
      setTasks(previous);
      setNotice({ tone: "error", message: getErrorMessage(error, "Unable to move the task.") });
    }
  };

  const selectedProject = filters.projectId
    ? projects.find((project) => project.id === Number(filters.projectId))
    : null;

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <div>
          <span className="overline">{selectedProject?.name || "Workflow / 02"}</span>
          <h1>Workflow board.</h1>
          <p>
            {greeting()}, {user.name.split(" ")[0]}. Move work from ready to shipped without losing
            the delivery signal.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button secondary" to="/projects">
            <FolderKanban size={16} /> Projects
          </Link>
          <button
            className="button secondary refresh-button"
            disabled={isLoading}
            type="button"
            onClick={() => void loadWorkspace()}
          >
            <RefreshCw className={isLoading ? "spin" : ""} size={16} /> Refresh
          </button>
          <button className="button primary" type="button" onClick={() => openCreate()}>
            <Plus size={17} /> New task
          </button>
        </div>
      </header>

      <StatsGrid values={stats} />

      <section className="board-section">
        <div className="board-title-row">
          <div>
            <span className="overline">Current workflow / live</span>
            <h2>
              Delivery board <ChevronDown size={17} />
            </h2>
          </div>
          <span className="task-count">{tasks.length} visible tasks</span>
        </div>
        <FilterBar filters={filters} projects={projects} onChange={setFilters} />

        {notice ? (
          <button className={`toast ${notice.tone}`} type="button" onClick={() => setNotice(null)}>
            {notice.message}
            <span>×</span>
          </button>
        ) : null}

        <div className="workspace-content-grid">
          <div className="board-wrap">
            {isLoading && tasks.length === 0 ? (
              <div className="board-skeleton">
                <span />
                <span />
                <span />
              </div>
            ) : tasks.length === 0 ? (
              <div className="workspace-empty">
                <h3>No tasks match this view</h3>
                <p>Adjust the filters or create a task to start moving work.</p>
                <button className="button primary" type="button" onClick={() => openCreate()}>
                  <Plus size={16} /> New task
                </button>
              </div>
            ) : (
              <KanbanBoard
                tasks={tasks}
                onCreate={openCreate}
                onEdit={(task) => {
                  setEditingTask(task);
                  setIsTaskModalOpen(true);
                }}
                onMove={(task, status) => void moveTask(task, status)}
              />
            )}
          </div>
          <ActivityFeed activities={activities} />
        </div>
      </section>

      {isTaskModalOpen ? (
        <TaskModal
          initialStatus={newTaskStatus}
          isSaving={isSaving}
          onClose={() => {
            setIsTaskModalOpen(false);
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

export default Workspace;
