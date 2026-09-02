import {
  CalendarDays,
  ChevronDown,
  FolderKanban,
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
import { progressFor } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Sprint, SprintStatus, Task, TaskInput } from "../types";
import { formatDate, initialsFor } from "../utils/format";
import { persistedProgressFor } from "../utils/taskProgress";

type BoardStage = "backlog" | "progress" | "released";

const stageFor = (task: Task): BoardStage => {
  if (task.status === "completed") return "released";
  if (task.status === "todo") return "backlog";
  return "progress";
};

const visibleProgressFor = (task: Task, isDemo: boolean) =>
  isDemo ? progressFor(task) : persistedProgressFor(task);

const stageMeta = [
  { key: "backlog" as const, label: "Backlog", icon: ListFilter },
  { key: "progress" as const, label: "In progress", icon: CalendarDays },
  { key: "released" as const, label: "Released", icon: Rocket }
];

function EngineeringCard({ isDemo, task }: { isDemo: boolean; task: Task }) {
  const progress = visibleProgressFor(task, isDemo);
  return (
    <Link className="engineering-card" to={`/tasks/${task.id}`}>
      <div className="engineering-card-top">
        <span>{task.issueKey}</span>
        <b>{task.taskType}</b>
      </div>
      <strong>{task.title}</strong>
      <div className="engineering-card-signal">
        <span className="mini-avatar">{initialsFor(task.assigneeName)}</span>
        <span>{task.assigneeName || "Unassigned"}</span>
      </div>
      <footer>
        <span>{task.childCount ? `${task.completedChildCount} / ${task.childCount}` : "—"}</span>
        <i>
          <b style={{ width: `${progress}%` }} />
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
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintId, setSprintId] = useState("");
  const [isCreatingSprint, setIsCreatingSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const [isSprintBusy, setIsSprintBusy] = useState(false);

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

  const loadSprints = useCallback(async () => {
    if (!projectId) {
      setSprints([]);
      return;
    }
    try {
      setSprints(await client.listSprints(Number(projectId)));
    } catch (sprintError) {
      setError(getErrorMessage(sprintError, "Unable to load sprints."));
    }
  }, [client, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSprints(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSprints]);

  const selectedSprint = sprints.find((sprint) => String(sprint.id) === sprintId) || null;

  const createSprint = async () => {
    if (!projectId || !newSprintName.trim()) return;
    setIsSprintBusy(true);
    try {
      const sprint = await client.createSprint(Number(projectId), {
        name: newSprintName.trim(),
        startDate: newSprintStart || null,
        endDate: newSprintEnd || null
      });
      setSprints((current) => [...current, sprint]);
      setSprintId(String(sprint.id));
      setNewSprintName("");
      setNewSprintStart("");
      setNewSprintEnd("");
      setIsCreatingSprint(false);
    } catch (sprintError) {
      setError(getErrorMessage(sprintError, "Unable to create that sprint."));
    } finally {
      setIsSprintBusy(false);
    }
  };

  const changeSprintStatus = async (status: SprintStatus) => {
    if (!projectId || !selectedSprint) return;
    setIsSprintBusy(true);
    try {
      const updated = await client.updateSprint(Number(projectId), selectedSprint.id, {
        name: selectedSprint.name,
        startDate: selectedSprint.startDate,
        endDate: selectedSprint.endDate,
        status
      });
      setSprints((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (sprintError) {
      setError(getErrorMessage(sprintError, "Unable to update that sprint."));
    } finally {
      setIsSprintBusy(false);
    }
  };

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

  const visibleTasks = useMemo(
    () => (sprintId ? tasks.filter((task) => task.sprintId === Number(sprintId)) : tasks),
    [sprintId, tasks]
  );

  const groups = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const grouped = new Map<number, Task[]>();
    visibleTasks.forEach((task) => {
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
  }, [tasks, visibleTasks]);

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
          {projectId ? (
            <>
              <select
                aria-label="Select sprint"
                onChange={(event) => setSprintId(event.target.value)}
                value={sprintId}
              >
                <option value="">All sprints</option>
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name} ({sprint.status})
                  </option>
                ))}
              </select>
              <button
                className="button secondary"
                type="button"
                onClick={() => setIsCreatingSprint((current) => !current)}
              >
                <CalendarDays size={16} /> New sprint
              </button>
            </>
          ) : null}
          <button className="button primary" type="button">
            <SlidersHorizontal size={16} /> Group by epic <ChevronDown size={15} />
          </button>
        </div>
      </header>

      {isCreatingSprint && projectId ? (
        <section className="sprint-create-form">
          <input
            aria-label="New sprint name"
            disabled={isSprintBusy}
            maxLength={80}
            onChange={(event) => setNewSprintName(event.target.value)}
            placeholder="Sprint name"
            value={newSprintName}
          />
          <input
            aria-label="Sprint start date"
            disabled={isSprintBusy}
            onChange={(event) => setNewSprintStart(event.target.value)}
            type="date"
            value={newSprintStart}
          />
          <input
            aria-label="Sprint end date"
            disabled={isSprintBusy}
            onChange={(event) => setNewSprintEnd(event.target.value)}
            type="date"
            value={newSprintEnd}
          />
          <button
            className="button primary"
            disabled={isSprintBusy || !newSprintName.trim()}
            type="button"
            onClick={() => void createSprint()}
          >
            <Plus size={14} /> Add sprint
          </button>
          <button
            className="button secondary"
            disabled={isSprintBusy}
            type="button"
            onClick={() => setIsCreatingSprint(false)}
          >
            Cancel
          </button>
        </section>
      ) : null}

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
          onChange={(event) => {
            setProjectId(event.target.value);
            setSprintId("");
          }}
          value={projectId}
        >
          <option value="">WORKFLOWHQ</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.key}
            </option>
          ))}
        </select>
        <span className="sprint-status-readout">
          {selectedSprint
            ? `${selectedSprint.name}  ${formatDate(selectedSprint.startDate, "No start date")} – ${formatDate(selectedSprint.endDate)}`
            : "No sprint selected"}
        </span>
        {selectedSprint ? (
          <select
            aria-label="Sprint status"
            disabled={isSprintBusy}
            onChange={(event) => void changeSprintStatus(event.target.value as SprintStatus)}
            value={selectedSprint.status}
          >
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        ) : null}
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
              <span>{visibleTasks.filter((task) => stageFor(task) === key).length}</span>
            </div>
          ))}
        </header>
        {groups.map(({ root, items }) => (
          <section className="engineering-epic-row" key={root.id}>
            <header>
              <span>
                <ChevronDown size={15} /> ◆ {root.title}
              </span>
              <b>{visibleProgressFor(root, isDemo)}%</b>
              <small>
                {root.completedChildCount ||
                  items.filter((item) => item.status === "completed").length}{" "}
                / {Math.max(root.childCount, items.length)}
              </small>
              <i>
                <b style={{ width: `${visibleProgressFor(root, isDemo)}%` }} />
              </i>
              <MoreHorizontal size={17} />
            </header>
            <div className="engineering-epic-grid">
              {stageMeta.map(({ key }) => {
                const item = items.find((task) => stageFor(task) === key);
                return (
                  <div className="engineering-stage-cell" key={key}>
                    {item ? (
                      <EngineeringCard isDemo={isDemo} task={item} />
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
        <span>{visibleTasks.length} issues</span>
        <span className="high">
          ■ High&nbsp;&nbsp;{visibleTasks.filter((task) => task.priority === "high").length}
        </span>
        <span className="medium">
          ■ Medium&nbsp;&nbsp;{visibleTasks.filter((task) => task.priority === "medium").length}
        </span>
        <span className="low">
          ■ Low&nbsp;&nbsp;{visibleTasks.filter((task) => task.priority === "low").length}
        </span>
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
          client={client}
          isSaving={isSaving}
          onClose={() => setIsModalOpen(false)}
          onArchive={async () => undefined}
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
