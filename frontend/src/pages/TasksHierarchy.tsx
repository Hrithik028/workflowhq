import {
  Bug,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Layers3,
  List,
  ListTree,
  Plus,
  RefreshCw,
  Search,
  Square,
  Tag
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { issueTypeLabel, progressFor } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task, TaskInput, TaskPriority, TaskStatus, TaskType } from "../types";
import { formatDate, initialsFor, statusLabel } from "../utils/format";

const typeIcon: Record<TaskType, typeof Square> = {
  initiative: Layers3,
  epic: Tag,
  story: ListTree,
  task: CheckSquare2,
  bug: Bug,
  subtask: Square
};

const statusClass = (status: TaskStatus) => (status === "completed" ? "done" : status);

function TasksHierarchy() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState<"" | TaskStatus>("");
  const [priority, setPriority] = useState<"" | TaskPriority>("");
  const [taskType, setTaskType] = useState<"" | TaskType>("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [view, setView] = useState<"list" | "tree">("list");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [initialParentTask, setInitialParentTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks({
          limit: 100,
          search: search || undefined,
          projectId: projectId ? Number(projectId) : undefined,
          status: status || undefined,
          priority: priority || undefined,
          sort: "created_at",
          order: "asc"
        }),
        client.listProjects()
      ]);
      const filtered = taskType
        ? taskResult.data.filter((task) => task.taskType === taskType)
        : taskResult.data;
      setTasks(filtered);
      setProjects(projectResult);
      setSelectedId((current) =>
        current && filtered.some((task) => task.id === current)
          ? current
          : [...filtered]
              .filter((task) => task.taskType === "epic")
              .sort((left, right) => right.childCount - left.childCount)[0]?.id ||
            filtered[0]?.id ||
            null
      );
      setExpanded(new Set(filtered.filter((task) => task.childCount > 0).map((task) => task.id)));
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the work hierarchy."));
    } finally {
      setIsLoading(false);
    }
  }, [client, priority, projectId, search, status, taskType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      if (editingTask) await client.updateTask(editingTask.id, input);
      else await client.createTask(input);
      setEditingTask(null);
      setInitialParentTask(null);
      setIsModalOpen(false);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the issue."));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTask = async (task: Task) => {
    setIsSaving(true);
    try {
      await client.deleteTask(task.id);
      setIsModalOpen(false);
      setEditingTask(null);
      await load();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete the issue."));
    } finally {
      setIsSaving(false);
    }
  };

  const rows = useMemo(() => {
    if (view === "list") return tasks.map((task) => ({ task, depth: 0 }));
    const byParent = new Map<number | null, Task[]>();
    tasks.forEach((task) =>
      byParent.set(task.parentId, [...(byParent.get(task.parentId) || []), task])
    );
    const result: Array<{ task: Task; depth: number }> = [];
    const visited = new Set<number>();
    const add = (task: Task, depth: number) => {
      if (visited.has(task.id)) return;
      visited.add(task.id);
      result.push({ task, depth });
      if (expanded.has(task.id))
        (byParent.get(task.id) || []).forEach((child) => add(child, depth + 1));
    };
    (
      byParent.get(null) || tasks.filter((task) => !tasks.some((item) => item.id === task.parentId))
    ).forEach((task) => add(task, 0));
    tasks.forEach((task) => {
      if (!visited.has(task.id)) add(task, 0);
    });
    return result;
  }, [expanded, tasks, view]);

  const selected = tasks.find((task) => task.id === selectedId) || null;
  const children = selected ? tasks.filter((task) => task.parentId === selected.id) : [];

  const openCreate = (parent: Task | null = null) => {
    setEditingTask(null);
    setInitialParentTask(parent);
    setIsModalOpen(true);
  };

  return (
    <main className="workspace-page hierarchy-page" aria-busy={isLoading}>
      <header className="engineering-page-header hierarchy-header">
        <div>
          <span className="overline">Workflow / Hierarchy</span>
          <h1>Work hierarchy</h1>
          <p>
            Visualize and manage work across initiatives, epics, stories, tasks, bugs, and subtasks.
          </p>
        </div>
        <div className="engineering-header-actions">
          <Link className="button secondary" to="/projects">
            <FolderKanban size={16} /> Projects
          </Link>
          <button className="button secondary" type="button" onClick={() => void load()}>
            <RefreshCw className={isLoading ? "spin" : ""} size={16} /> Refresh
          </button>
          <div className="hierarchy-view-toggle">
            <button
              className={view === "list" ? "active" : ""}
              type="button"
              onClick={() => setView("list")}
            >
              <List size={15} /> List
            </button>
            <button
              className={view === "tree" ? "active" : ""}
              type="button"
              onClick={() => setView("tree")}
            >
              <ListTree size={15} /> Tree
            </button>
          </div>
          <button className="button primary" type="button" onClick={() => openCreate()}>
            <Plus size={17} /> New issue
          </button>
        </div>
      </header>

      <section className="hierarchy-layout">
        <div className="hierarchy-main">
          <div className="hierarchy-filters">
            <label>
              <Search size={17} />
              <input
                aria-label="Search issues"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SEARCH ISSUES..."
                value={search}
              />
            </label>
            <select
              aria-label="Project"
              onChange={(event) => setProjectId(event.target.value)}
              value={projectId}
            >
              <option value="">ALL PROJECTS</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key}
                </option>
              ))}
            </select>
            <select
              aria-label="Issue type"
              onChange={(event) => setTaskType(event.target.value as "" | TaskType)}
              value={taskType}
            >
              <option value="">ALL TYPES</option>
              <option value="epic">EPICS</option>
              <option value="story">STORIES</option>
              <option value="task">TASKS</option>
              <option value="bug">BUGS</option>
              <option value="subtask">SUBTASKS</option>
            </select>
            <select
              aria-label="Status"
              onChange={(event) => setStatus(event.target.value as "" | TaskStatus)}
              value={status}
            >
              <option value="">ALL STATUSES</option>
              <option value="todo">TO DO</option>
              <option value="in_progress">IN PROGRESS</option>
              <option value="completed">DONE</option>
            </select>
            <select
              aria-label="Priority"
              onChange={(event) => setPriority(event.target.value as "" | TaskPriority)}
              value={priority}
            >
              <option value="">ALL PRIORITIES</option>
              <option value="high">P1 / HIGH</option>
              <option value="medium">P2 / MEDIUM</option>
              <option value="low">P3 / LOW</option>
            </select>
            <button type="button">
              Group by: hierarchy <ChevronDown size={14} />
            </button>
          </div>

          {error ? <p className="form-alert error">{error}</p> : null}
          <section className="hierarchy-table" aria-label="Work hierarchy">
            <header>
              <span>Type</span>
              <span>Key</span>
              <span>Title</span>
              <span>Assignee</span>
              <span>Progress</span>
              <span>Status</span>
              <span>Children</span>
            </header>
            {rows.map(({ task, depth }) => {
              const Icon = typeIcon[task.taskType];
              const hasChildren =
                task.childCount > 0 || tasks.some((item) => item.parentId === task.id);
              const progress = progressFor(task);
              return (
                <article
                  className={`${selectedId === task.id ? "selected" : ""} hierarchy-depth-${Math.min(depth, 5)}`}
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                >
                  <span className={`hierarchy-type ${task.taskType}`}>
                    {hasChildren ? (
                      <button
                        aria-label={`${expanded.has(task.id) ? "Collapse" : "Expand"} ${task.issueKey}`}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(task.id)) next.delete(task.id);
                            else next.add(task.id);
                            return next;
                          });
                        }}
                      >
                        {expanded.has(task.id) ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </button>
                    ) : (
                      <i />
                    )}
                    <b>
                      <Icon size={15} />
                    </b>
                  </span>
                  <span className="hierarchy-key">{task.issueKey}</span>
                  <span className="hierarchy-title">
                    <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                    <small>
                      {task.description ||
                        `${issueTypeLabel(task)} in ${task.projectName || "Inbox"}.`}
                    </small>
                  </span>
                  <span className="hierarchy-assignee">
                    <i>{initialsFor(task.assigneeName)}</i>
                    {task.assigneeName || "Unassigned"}
                  </span>
                  <span className="hierarchy-progress">
                    <i>
                      <b style={{ width: `${progress}%` }} />
                    </i>
                    {progress}%
                  </span>
                  <span className={`hierarchy-status ${statusClass(task.status)}`}>
                    <i />
                    {statusLabel[task.status]}
                  </span>
                  <span className="hierarchy-children">{task.childCount || "—"}</span>
                </article>
              );
            })}
            {!isLoading && !rows.length ? (
              <div className="workspace-empty">
                <h2>No issues found.</h2>
                <p>Change the filters or create a new issue.</p>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="hierarchy-summary">
          {selected ? (
            <>
              <span className="overline">{issueTypeLabel(selected)} summary</span>
              <div className={`summary-type-mark ${selected.taskType}`}>
                <Tag size={17} />
              </div>
              <span className="hierarchy-key">{selected.issueKey}</span>
              <h2>{selected.title}</h2>
              <div className="summary-progress">
                <i>
                  <b style={{ width: `${progressFor(selected)}%` }} />
                </i>
                <span>
                  {selected.completedChildCount ||
                    children.filter((task) => task.status === "completed").length}{" "}
                  of {Math.max(selected.childCount, children.length)} complete
                </span>
                <strong>{progressFor(selected)}%</strong>
              </div>
              <section>
                <h3>Description</h3>
                <p>{selected.description || "No description has been added yet."}</p>
              </section>
              <section>
                <h3>Status</h3>
                <span className={`hierarchy-status ${statusClass(selected.status)}`}>
                  <i />
                  {statusLabel[selected.status]}
                </span>
                <h3>Assignee</h3>
                <span className="hierarchy-assignee">
                  <i>{initialsFor(selected.assigneeName)}</i>
                  {selected.assigneeName || "Unassigned"}
                </span>
                <h3>Dates</h3>
                <p>
                  {formatDate(selected.createdAt)} → {formatDate(selected.dueDate)}
                </p>
              </section>
              <section>
                <h3>Child summary</h3>
                <ul className="child-summary">
                  <li>
                    <span>Stories</span>
                    <b>{children.filter((task) => task.taskType === "story").length}</b>
                  </li>
                  <li>
                    <span>Tasks</span>
                    <b>{children.filter((task) => task.taskType === "task").length}</b>
                  </li>
                  <li>
                    <span>Bugs</span>
                    <b>{children.filter((task) => task.taskType === "bug").length}</b>
                  </li>
                  <li>
                    <span>Subtasks</span>
                    <b>{children.filter((task) => task.taskType === "subtask").length}</b>
                  </li>
                </ul>
              </section>
              <Link className="summary-open-link" to={`/tasks/${selected.id}`}>
                <ListTree size={16} /> Open full issue <ChevronRight size={16} />
              </Link>
              <button
                className="button secondary summary-add-child"
                type="button"
                onClick={() => openCreate(selected)}
              >
                <Plus size={15} /> Add child issue
              </button>
            </>
          ) : (
            <p>Select an issue to inspect its hierarchy.</p>
          )}
        </aside>
      </section>

      {isModalOpen ? (
        <TaskModal
          client={client}
          initialParentTask={initialParentTask}
          isSaving={isSaving}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
            setInitialParentTask(null);
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

export default TasksHierarchy;
