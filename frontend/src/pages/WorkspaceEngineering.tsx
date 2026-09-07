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
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import PriorityIcon from "../components/PriorityIcon";
import TaskModal from "../components/TaskModal";
import { progressFor } from "../demo/engineeringMeta";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Sprint, SprintStatus, Task, TaskInput, TaskStatus } from "../types";
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

const statusForStage: Record<BoardStage, TaskStatus> = {
  backlog: "todo",
  progress: "in_progress",
  released: "completed"
};

function EngineeringCard({
  isDemo,
  task,
  canMove,
  busy,
  onMove,
  onDragStart,
  onDragEnd
}: {
  isDemo: boolean;
  task: Task;
  canMove: boolean;
  busy: boolean;
  onMove: (task: Task, stage: BoardStage) => void;
  onDragStart: (event: DragEvent, task: Task) => void;
  onDragEnd: () => void;
}) {
  const progress = visibleProgressFor(task, isDemo);
  return (
    <article
      className="engineering-card"
      aria-label={task.issueKey}
      draggable={canMove && !busy}
      onDragStart={(event) => onDragStart(event, task)}
      onDragEnd={onDragEnd}
    >
      <Link className="engineering-card-link" draggable={false} to={`/tasks/${task.id}`}>
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
      <label className="engineering-card-move">
        <span>Move to</span>
        <select
          aria-label={`Move ${task.issueKey} to`}
          value={stageFor(task)}
          disabled={!canMove || busy}
          onChange={(event) => onMove(task, event.target.value as BoardStage)}
        >
          {stageMeta.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </article>
  );
}

function WorkspaceEngineering() {
  const { isDemo, user } = useOutletContext<LayoutContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get("project") || "";
  const sprintId = searchParams.get("sprint") || "";
  const stageParam = searchParams.get("stage");
  const selectedStage = stageMeta.find((stage) => stage.key === stageParam)?.key || null;
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropStage, setDropStage] = useState<BoardStage | null>(null);
  const [notice, setNotice] = useState("");
  const [initialStatus, setInitialStatus] = useState<TaskStatus>("todo");
  const moving = useRef(false);
  const loadVersion = useRef(0);
  const dragId = useRef<number | null>(null);
  const invalidateLoad = useCallback(() => {
    loadVersion.current++;
  }, []);

  const updateFilters = (changes: Record<string, string | null>) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) =>
        value ? next.set(key, value) : next.delete(key)
      );
      return next;
    });
  };
  const [isCreatingSprint, setIsCreatingSprint] = useState(false);
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const [isSprintBusy, setIsSprintBusy] = useState(false);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setIsLoading(true);
    try {
      const query = {
        limit: 100,
        search: search || undefined,
        projectId: projectId ? Number(projectId) : undefined,
        sort: "updated_at" as const,
        order: "desc" as const
      };
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks(query),
        client.listProjects()
      ]);
      const allTasks = [...taskResult.data];
      for (let page = 2; page <= taskResult.pagination.pages; page++) {
        if (version !== loadVersion.current) return;
        const result = await client.listTasks({ ...query, page });
        allTasks.push(...result.data);
      }
      if (version !== loadVersion.current) return;
      setTasks(Array.from(new Map(allTasks.map((task) => [task.id, task])).values()));
      setProjects(projectResult);
      setError("");
    } catch (loadError) {
      if (version === loadVersion.current)
        setError(getErrorMessage(loadError, "Unable to load the engineering board."));
    } finally {
      if (version === loadVersion.current) setIsLoading(false);
    }
  }, [client, projectId, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 180 : 0);
    return () => {
      window.clearTimeout(timer);
      invalidateLoad();
    };
  }, [load, search, invalidateLoad]);

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
      updateFilters({ sprint: String(sprint.id) });
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

  const displayedTasks = useMemo(
    () =>
      selectedStage
        ? visibleTasks.filter((task) => stageFor(task) === selectedStage)
        : visibleTasks,
    [visibleTasks, selectedStage]
  );

  const canMove = (task: Task) => {
    if (task.archivedAt || task.projectArchivedAt) return false;
    if (isDemo) return true;
    if (!task.projectId) return task.userId === user.id;
    const role = projects.find((project) => project.id === task.projectId)?.myRole;
    return role === "owner" || role === "editor";
  };

  const moveTask = async (task: Task, stage: BoardStage) => {
    if (moving.current || isLoading || !canMove(task) || stageFor(task) === stage) return;
    moving.current = true;
    setMovingId(task.id);
    setError("");
    setNotice(`Moving ${task.issueKey}…`);
    // Keep the existing card in place until the server accepts the change.
    // Permissions and workspace rules are still enforced by the task API.
    try {
      const updated = await client.updateTask(task.id, {
        projectId: task.projectId,
        title: task.title,
        description: task.description,
        status: statusForStage[stage],
        priority: task.priority,
        startDate: task.startDate,
        dueDate: task.dueDate,
        taskType: task.taskType,
        parentId: task.parentId,
        assigneeId: task.assigneeId,
        sprintId: task.sprintId
      });
      setTasks((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(
        `${task.issueKey} moved to ${stageMeta.find((item) => item.key === stage)!.label}.`
      );
      await load();
    } catch (moveError) {
      setNotice("");
      setError(
        getErrorMessage(moveError, "Unable to confirm the move. Refresh the board before retrying.")
      );
    } finally {
      moving.current = false;
      setMovingId(null);
    }
  };

  const endDrag = () => {
    dragId.current = null;
    setDraggedId(null);
    setDropStage(null);
  };
  const startDrag = (event: DragEvent, task: Task) => {
    if (!canMove(task) || moving.current || isLoading) {
      event.preventDefault();
      return;
    }
    dragId.current = task.id;
    setDraggedId(task.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.issueKey);
  };
  const dragOver = (event: DragEvent, stage: BoardStage) => {
    if (dragId.current == null || moving.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropStage(stage);
  };
  const drop = (event: DragEvent, stage: BoardStage) => {
    event.preventDefault();
    const task = tasks.find((item) => item.id === dragId.current);
    endDrag();
    // Only drags originating from an editable card on this board are accepted.
    if (task) void moveTask(task, stage);
  };

  const groups = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const grouped = new Map<number, Task[]>();
    displayedTasks.forEach((task) => {
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
  }, [tasks, displayedTasks]);

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
                disabled={movingId !== null}
                onChange={(event) => updateFilters({ sprint: event.target.value })}
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
            disabled={movingId !== null}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="SEARCH ISSUES..."
            value={search}
          />
        </label>
        <select
          aria-label="Select project"
          disabled={movingId !== null}
          onChange={(event) => {
            updateFilters({ project: event.target.value, sprint: null });
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

      {error ? (
        <p role="alert" className="form-alert error">
          {error}
        </p>
      ) : null}
      <div className="engineering-board-instructions">
        <button
          type="button"
          aria-pressed={!selectedStage}
          onClick={() => updateFilters({ stage: null })}
        >
          All lanes
        </button>
        <p>Select a lane to focus. Drag a card onto a lane header, or use its Move to menu.</p>
      </div>
      <p role="status" className="engineering-board-status">
        {notice}
      </p>

      <section className="engineering-swimlanes">
        <header className="engineering-stage-head">
          {stageMeta.map(({ key, label, icon: Icon }) => (
            <button
              type="button"
              aria-pressed={selectedStage === key}
              aria-label={`${label} lane`}
              className={`${key}${dropStage === key ? " drop-active" : ""}`}
              key={key}
              onClick={() => updateFilters({ stage: selectedStage === key ? null : key })}
              onDragOver={(event) => dragOver(event, key)}
              onDrop={(event) => drop(event, key)}
            >
              <Icon size={18} />
              <strong>{label}</strong>
              <span>{visibleTasks.filter((task) => stageFor(task) === key).length}</span>
            </button>
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
            <div className={`engineering-epic-grid${selectedStage ? " focused-lane" : ""}`}>
              {stageMeta
                .filter(({ key }) => !selectedStage || key === selectedStage)
                .map(({ key, label }) => {
                  const laneItems = items.filter((task) => stageFor(task) === key);
                  return (
                    <div
                      className={`engineering-stage-cell${draggedId !== null && dropStage === key ? " drop-active" : ""}`}
                      role="region"
                      aria-label={`${root.issueKey} ${label}`}
                      key={key}
                      onDragOver={(event) => dragOver(event, key)}
                      onDrop={(event) => drop(event, key)}
                    >
                      {laneItems.map((item) => (
                        <EngineeringCard
                          key={item.id}
                          isDemo={isDemo}
                          task={item}
                          canMove={canMove(item)}
                          busy={movingId !== null || isLoading}
                          onMove={(task, stage) => void moveTask(task, stage)}
                          onDragStart={startDrag}
                          onDragEnd={endDrag}
                        />
                      ))}
                      {!laneItems.length ? (
                        <button
                          type="button"
                          onClick={() => {
                            setInitialStatus(statusForStage[key]);
                            setIsModalOpen(true);
                          }}
                        >
                          <Plus size={14} /> Add issue
                        </button>
                      ) : null}
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
        <span>
          {displayedTasks.length} of {visibleTasks.length} issues
        </span>
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
        onClick={() => {
          setInitialStatus(selectedStage ? statusForStage[selectedStage] : "todo");
          setIsModalOpen(true);
        }}
      >
        <Plus size={17} /> New issue
      </button>
      {isModalOpen ? (
        <TaskModal
          client={client}
          initialStatus={initialStatus}
          initialProjectId={projectId ? Number(projectId) : null}
          initialSprintId={sprintId ? Number(sprintId) : null}
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
