import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  FolderKanban,
  GitBranch,
  Github,
  ListFilter,
  MoreHorizontal,
  Plus,
  Rocket,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import PriorityIcon from "../components/PriorityIcon";
import TaskModal from "../components/TaskModal";
import { engineeringMetaFor, progressFor } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task, TaskInput } from "../types";

type BoardStage = "backlog" | "progress" | "review" | "released";

const stageFor = (task: Task): BoardStage => {
  if (task.status === "completed") return "released";
  if (task.status === "todo") return "backlog";
  return task.id % 2 === 0 ? "review" : "progress";
};

const stageMeta = [
  { key: "backlog" as const, label: "Backlog", icon: ListFilter },
  { key: "progress" as const, label: "In progress", icon: CalendarDays },
  { key: "review" as const, label: "In review", icon: Eye },
  { key: "released" as const, label: "Released", icon: Rocket }
];

function EngineeringCard({ task }: { task: Task }) {
  const meta = engineeringMetaFor(task);
  const stage = stageFor(task);
  return (
    <Link className="engineering-card" to={`/tasks/${task.id}`}>
      <div className="engineering-card-top">
        <span>{task.issueKey}</span>
        <b>{task.taskType}</b>
      </div>
      <strong>{task.title}</strong>
      <div className="engineering-card-signal">
        <span className="mini-avatar">{meta.initials}</span>
        {stage === "backlog" ? (
          <span>
            <GitBranch size={13} /> {meta.branch}
          </span>
        ) : null}
        {stage === "progress" ? (
          <span>
            <Github size={13} /> CI {meta.checksFailed ? "failing" : "running"}
          </span>
        ) : null}
        {stage === "review" ? <span className="pr-link">PR #{meta.pullRequest}</span> : null}
        {stage === "released" ? (
          <span className="deploy-ok">
            <CheckCircle2 size={13} /> Deployed to {meta.environment}
          </span>
        ) : null}
      </div>
      <footer>
        <span>
          {task.childCount
            ? `${task.completedChildCount} / ${task.childCount}`
            : `${Math.max(task.id % 5, 0)} / ${Math.max(task.id % 5, 0) + 3}`}
        </span>
        <i>
          <b style={{ width: `${progressFor(task)}%` }} />
        </i>
        <em className={task.priority}>
          <PriorityIcon priority={task.priority} />
          {task.priority}
        </em>
      </footer>
    </Link>
  );
}

function WorkspaceEngineering() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const [searchParams] = useSearchParams();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState(searchParams.get("project") || "");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks({
          limit: 100,
          search: search || undefined,
          projectId: projectId ? Number(projectId) : undefined,
          sort: "updated_at",
          order: "desc"
        }),
        client.listProjects()
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the engineering board."));
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      await client.createTask(input);
      setIsModalOpen(false);
      await load();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to create the issue."));
    } finally {
      setIsSaving(false);
    }
  };

  const groups = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const grouped = new Map<number, Task[]>();
    tasks.forEach((task) => {
      let root = task;
      const visited = new Set<number>();
      while (root.parentId && byId.has(root.parentId) && !visited.has(root.id)) {
        visited.add(root.id);
        root = byId.get(root.parentId)!;
      }
      grouped.set(root.id, [...(grouped.get(root.id) || []), task]);
    });
    return Array.from(grouped.entries()).map(([rootId, items]) => ({
      root: byId.get(rootId) || items[0],
      items
    }));
  }, [tasks]);

  return (
    <main className="workspace-page engineering-board-page" aria-busy={isLoading}>
      <header className="engineering-page-header engineering-board-header">
        <div>
          <span className="overline">Workflow / Engineering</span>
          <h1>Engineering board.</h1>
          <p>Ship reliable code. Fast feedback. Quality by default.</p>
        </div>
        <div className="engineering-header-actions">
          <Link className="button secondary" to="/projects">
            <FolderKanban size={16} /> Projects
          </Link>
          <button className="button secondary" type="button">
            <CalendarDays size={16} /> Sprint 24 <ChevronDown size={15} />
          </button>
          <button className="button primary" type="button">
            <SlidersHorizontal size={16} /> Group by epic <ChevronDown size={15} />
          </button>
        </div>
      </header>

      <section className="engineering-board-toolbar">
        <label>
          <Search size={18} />
          <input
            aria-label="Search issues"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SEARCH ISSUES..."
            value={search}
          />
        </label>
        <select
          aria-label="Select project"
          onChange={(event) => setProjectId(event.target.value)}
          value={projectId}
        >
          <option value="">WORKFLOWHQ</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.key}
            </option>
          ))}
        </select>
        <button type="button">
          <SlidersHorizontal size={16} /> Sprint 24&nbsp;&nbsp;8 Aug – 22 Aug{" "}
          <ChevronDown size={15} />
        </button>
        <span>Group by</span>
        <button type="button">
          Epic <ChevronDown size={15} />
        </button>
      </section>

      {error ? <p className="form-alert error">{error}</p> : null}

      <section className="engineering-swimlanes">
        <header className="engineering-stage-head">
          {stageMeta.map(({ key, label, icon: Icon }) => (
            <div className={key} key={key}>
              <Icon size={18} />
              <strong>{label}</strong>
              <span>{tasks.filter((task) => stageFor(task) === key).length}</span>
            </div>
          ))}
        </header>
        {groups.map(({ root, items }) => (
          <section className="engineering-epic-row" key={root.id}>
            <header>
              <span>
                <ChevronDown size={15} /> ◆ {root.title}
              </span>
              <b>{progressFor(root)}%</b>
              <small>
                {root.completedChildCount ||
                  items.filter((item) => item.status === "completed").length}{" "}
                / {Math.max(root.childCount, items.length)}
              </small>
              <i>
                <b style={{ width: `${progressFor(root)}%` }} />
              </i>
              <MoreHorizontal size={17} />
            </header>
            <div className="engineering-epic-grid">
              {stageMeta.map(({ key }) => {
                const item = items.find((task) => stageFor(task) === key);
                return (
                  <div className="engineering-stage-cell" key={key}>
                    {item ? (
                      <EngineeringCard task={item} />
                    ) : (
                      <button type="button" onClick={() => setIsModalOpen(true)}>
                        <Plus size={14} /> Add issue
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {!isLoading && !groups.length ? (
          <div className="workspace-empty">
            <h2>No issues match this board.</h2>
            <p>Change the filters or create an engineering issue.</p>
          </div>
        ) : null}
      </section>

      <footer className="engineering-board-footer">
        <span>{tasks.length} issues</span>
        <span className="high">
          ■ High&nbsp;&nbsp;{tasks.filter((task) => task.priority === "high").length}
        </span>
        <span className="medium">
          ■ Medium&nbsp;&nbsp;{tasks.filter((task) => task.priority === "medium").length}
        </span>
        <span className="low">
          ■ Low&nbsp;&nbsp;{tasks.filter((task) => task.priority === "low").length}
        </span>
        <span>
          CI status&nbsp;&nbsp;●{" "}
          {tasks.filter((task) => !engineeringMetaFor(task).checksFailed).length}
        </span>
        <span>Last updated&nbsp;&nbsp;1 min ago</span>
      </footer>

      <button
        className="engineering-floating-new"
        type="button"
        onClick={() => setIsModalOpen(true)}
      >
        <Plus size={17} /> New issue
      </button>
      {isModalOpen ? (
        <TaskModal
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

export default WorkspaceEngineering;
