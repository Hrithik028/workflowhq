import { Archive, CalendarDays, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { getErrorMessage } from "../api/client";
import type {
  Label,
  Project,
  ProjectMember,
  Sprint,
  Task,
  TaskInput,
  TaskPriority,
  TaskStatus,
  TaskType,
  WorkspaceClient
} from "../types";
import LabelPill from "./LabelPill";
import ConfirmationDialog from "./ConfirmationDialog";

interface TaskModalProps {
  client: WorkspaceClient;
  initialDueDate?: string | null;
  initialParentTask?: Task | null;
  initialStatus?: TaskStatus;
  isSaving: boolean;
  onClose: () => void;
  onArchive: (task: Task) => Promise<void>;
  onSave: (input: TaskInput) => Promise<void>;
  projects: Project[];
  task: Task | null;
  tasks?: Task[];
}

const typeRank: Record<TaskType, number> = {
  initiative: 5,
  epic: 4,
  story: 3,
  task: 2,
  bug: 2,
  subtask: 1
};

const childTypeFor = (parent: Task): TaskType => {
  if (parent.taskType === "initiative") return "epic";
  if (parent.taskType === "epic") return "story";
  if (parent.taskType === "story") return "task";
  return "subtask";
};

const typeLabel: Record<TaskType, string> = {
  initiative: "Initiative",
  epic: "Epic",
  story: "Story",
  task: "Task",
  bug: "Bug",
  subtask: "Subtask"
};

const emptyTask = (
  status: TaskStatus,
  dueDate: string | null = null,
  parent: Task | null = null
): TaskInput => ({
  title: "",
  description: "",
  projectId: parent?.projectId ?? null,
  status,
  priority: "medium",
  startDate: null,
  dueDate,
  taskType: parent ? childTypeFor(parent) : "task",
  parentId: parent?.id ?? null,
  assigneeId: null,
  sprintId: null
});

const taskToInput = (task: Task): TaskInput => ({
  title: task.title,
  description: task.description,
  projectId: task.projectId,
  status: task.status,
  priority: task.priority,
  startDate: task.startDate,
  dueDate: task.dueDate,
  taskType: task.taskType,
  parentId: task.parentId,
  assigneeId: task.assigneeId,
  sprintId: task.sprintId
});

function TaskModal({
  client,
  initialDueDate = null,
  initialParentTask = null,
  initialStatus = "todo",
  isSaving,
  onClose,
  onArchive,
  onSave,
  projects,
  task,
  tasks = []
}: TaskModalProps) {
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [form, setForm] = useState<TaskInput>(() =>
    task ? taskToInput(task) : emptyTask(initialStatus, initialDueDate, initialParentTask)
  );
  const [error, setError] = useState("");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);
  const [attachedLabels, setAttachedLabels] = useState<Label[]>(() => task?.labels ?? []);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#4c6ef5");
  const [isLabelBusy, setIsLabelBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const projectId = form.projectId;
    const timer = window.setTimeout(() => {
      if (!projectId) {
        setMembers([]);
        return;
      }
      setIsLoadingMembers(true);
      client
        .listMembers(projectId)
        .then((data) => {
          if (!active) return;
          setMembers(data);
          setForm((current) =>
            current.assigneeId != null &&
            !data.some((member) => member.userId === current.assigneeId)
              ? { ...current, assigneeId: null }
              : current
          );
        })
        .catch((loadError: unknown) => {
          if (active) setError(getErrorMessage(loadError, "Unable to load project members."));
        })
        .finally(() => {
          if (active) setIsLoadingMembers(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, form.projectId]);

  useEffect(() => {
    let active = true;
    const projectId = form.projectId;
    const timer = window.setTimeout(() => {
      if (!projectId) {
        setSprints([]);
        return;
      }
      client
        .listSprints(projectId)
        .then((data) => {
          if (!active) return;
          setSprints(data);
          setForm((current) =>
            current.sprintId != null && !data.some((sprint) => sprint.id === current.sprintId)
              ? { ...current, sprintId: null }
              : current
          );
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, form.projectId]);

  useEffect(() => {
    let active = true;
    const projectId = form.projectId;
    const timer = window.setTimeout(() => {
      if (!task || !projectId) {
        setAvailableLabels([]);
        return;
      }
      client
        .listLabels(projectId)
        .then((data) => {
          if (active) setAvailableLabels(data);
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, form.projectId, task]);

  const attachExistingLabel = async (label: Label) => {
    if (!task) return;
    setIsLabelBusy(true);
    try {
      await client.attachLabel(task.id, label.id);
      setAttachedLabels((current) => [...current, label]);
    } catch (labelError) {
      setError(getErrorMessage(labelError, "Unable to attach that label."));
    } finally {
      setIsLabelBusy(false);
    }
  };

  const removeLabel = async (label: Label) => {
    if (!task) return;
    setIsLabelBusy(true);
    try {
      await client.detachLabel(task.id, label.id);
      setAttachedLabels((current) => current.filter((item) => item.id !== label.id));
    } catch (labelError) {
      setError(getErrorMessage(labelError, "Unable to remove that label."));
    } finally {
      setIsLabelBusy(false);
    }
  };

  const createAndAttachLabel = async () => {
    if (!task || !form.projectId || !newLabelName.trim()) return;
    setIsLabelBusy(true);
    try {
      const label = await client.createLabel(form.projectId, {
        name: newLabelName.trim(),
        color: newLabelColor
      });
      setAvailableLabels((current) => [...current, label]);
      await client.attachLabel(task.id, label.id);
      setAttachedLabels((current) => [...current, label]);
      setNewLabelName("");
    } catch (labelError) {
      setError(getErrorMessage(labelError, "Unable to create that label."));
    } finally {
      setIsLabelBusy(false);
    }
  };

  const attachableLabels = availableLabels.filter(
    (label) => !attachedLabels.some((attached) => attached.id === label.id)
  );

  const descendantIds = useMemo(() => {
    const descendants = new Set<number>();
    if (!task) return descendants;
    let frontier = [task.id];
    while (frontier.length > 0) {
      const children = tasks.filter(
        (candidate) => candidate.parentId != null && frontier.includes(candidate.parentId)
      );
      frontier = children.map((child) => child.id).filter((id) => !descendants.has(id));
      frontier.forEach((id) => descendants.add(id));
    }
    return descendants;
  }, [task, tasks]);

  const availableParents = useMemo(
    () =>
      tasks.filter(
        (candidate) =>
          candidate.id !== task?.id &&
          !descendantIds.has(candidate.id) &&
          candidate.projectId === form.projectId &&
          typeRank[candidate.taskType] > typeRank[form.taskType]
      ),
    [descendantIds, form.projectId, form.taskType, task?.id, tasks]
  );

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Give the task a clear title.");
      return;
    }
    if (form.startDate && form.dueDate && form.startDate > form.dueDate) {
      setError("Start date must be on or before the due date.");
      return;
    }
    setError("");
    await onSave({ ...form, title: form.title.trim(), description: form.description.trim() });
  };

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
        <header className="modal-header">
          <div>
            <span className="overline">
              {task?.issueKey ||
                (initialParentTask ? `Child of ${initialParentTask.issueKey}` : "New work")}
            </span>
            <h2 id="task-modal-title">{task ? "Edit ticket" : "Create a ticket"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>

        <form className="modal-form" onSubmit={submit}>
          <label>
            <span>Ticket title</span>
            <input
              autoFocus
              maxLength={200}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="What needs to move forward?"
              value={form.title}
            />
          </label>
          <label>
            <span>
              Description <small>Optional</small>
            </span>
            <textarea
              maxLength={5000}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Add the context someone needs to complete this task."
              rows={4}
              value={form.description}
            />
          </label>
          <div className="modal-form-grid">
            <label>
              <span>Issue type</span>
              <select
                onChange={(event) => {
                  const taskType = event.target.value as TaskType;
                  const parent = tasks.find((candidate) => candidate.id === form.parentId);
                  setForm({
                    ...form,
                    taskType,
                    parentId:
                      parent && typeRank[parent.taskType] > typeRank[taskType]
                        ? form.parentId
                        : null
                  });
                }}
                value={form.taskType}
              >
                {(Object.keys(typeLabel) as TaskType[]).map((value) => (
                  <option key={value} value={value}>
                    {typeLabel[value]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Project</span>
              <select
                onChange={(event) => {
                  const projectId = event.target.value ? Number(event.target.value) : null;
                  const parent = tasks.find((candidate) => candidate.id === form.parentId);
                  setForm({
                    ...form,
                    projectId,
                    parentId: parent?.projectId === projectId ? form.parentId : null
                  });
                }}
                value={form.projectId ?? ""}
              >
                <option value="">Inbox</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.key} · {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-form-grid three">
            <label>
              <span>
                Parent ticket <small>Optional</small>
              </span>
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    parentId: event.target.value ? Number(event.target.value) : null
                  })
                }
                value={form.parentId ?? ""}
              >
                <option value="">No parent / top level</option>
                {availableParents.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.issueKey} · {candidate.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                onChange={(event) => setForm({ ...form, status: event.target.value as TaskStatus })}
                value={form.status}
              >
                <option value="todo">Ready</option>
                <option value="in_progress">In motion</option>
                <option value="completed">Shipped</option>
              </select>
            </label>
            <label>
              <span>
                Assignee <small>Optional</small>
              </span>
              <select
                disabled={!form.projectId || isLoadingMembers}
                onChange={(event) =>
                  setForm({
                    ...form,
                    assigneeId: event.target.value ? Number(event.target.value) : null
                  })
                }
                value={form.assigneeId ?? ""}
              >
                <option value="">
                  {form.projectId ? "Unassigned" : "Inbox tickets can't be assigned"}
                </option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-form-grid three">
            <label>
              <span>Priority</span>
              <select
                onChange={(event) =>
                  setForm({ ...form, priority: event.target.value as TaskPriority })
                }
                value={form.priority}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              <span>
                Start date <small>Optional</small>
              </span>
              <span className="date-input">
                <CalendarDays size={16} />
                <input
                  onChange={(event) => setForm({ ...form, startDate: event.target.value || null })}
                  type="date"
                  value={form.startDate ?? ""}
                />
              </span>
            </label>
            <label>
              <span>Due date</span>
              <span className="date-input">
                <CalendarDays size={16} />
                <input
                  onChange={(event) => setForm({ ...form, dueDate: event.target.value || null })}
                  type="date"
                  value={form.dueDate ?? ""}
                />
              </span>
            </label>
          </div>

          {form.projectId ? (
            <label>
              <span>
                Sprint <small>Optional</small>
              </span>
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    sprintId: event.target.value ? Number(event.target.value) : null
                  })
                }
                value={form.sprintId ?? ""}
              >
                <option value="">No sprint / backlog</option>
                {sprints.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name} ({sprint.status})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {task && form.projectId ? (
            <label>
              <span>
                Labels <small>Optional</small>
              </span>
              <div className="label-row">
                {attachedLabels.map((label) => (
                  <LabelPill
                    key={label.id}
                    label={label}
                    onRemove={() => void removeLabel(label)}
                  />
                ))}
                {attachedLabels.length === 0 ? (
                  <span className="no-labels">No labels yet.</span>
                ) : null}
              </div>
              <div className="label-picker">
                {attachableLabels.length > 0 ? (
                  <select
                    disabled={isLabelBusy}
                    onChange={(event) => {
                      const label = attachableLabels.find(
                        (item) => item.id === Number(event.target.value)
                      );
                      if (label) void attachExistingLabel(label);
                      event.target.value = "";
                    }}
                    value=""
                  >
                    <option value="">Add an existing label…</option>
                    {attachableLabels.map((label) => (
                      <option key={label.id} value={label.id}>
                        {label.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <span className="label-create">
                  <input
                    aria-label="New label name"
                    disabled={isLabelBusy}
                    maxLength={40}
                    onChange={(event) => setNewLabelName(event.target.value)}
                    placeholder="New label name"
                    value={newLabelName}
                  />
                  <input
                    aria-label="New label color"
                    disabled={isLabelBusy}
                    onChange={(event) => setNewLabelColor(event.target.value)}
                    type="color"
                    value={newLabelColor}
                  />
                  <button
                    disabled={isLabelBusy || !newLabelName.trim()}
                    type="button"
                    onClick={() => void createAndAttachLabel()}
                  >
                    <Plus size={14} /> Add
                  </button>
                </span>
              </div>
            </label>
          ) : null}

          {error ? <p className="form-alert error">{error}</p> : null}
          <footer className="modal-actions">
            {task ? (
              <button
                className="button danger ghost"
                disabled={isSaving}
                type="button"
                onClick={() => setIsArchiveConfirmOpen(true)}
              >
                <Archive size={16} /> Archive
              </button>
            ) : (
              <span />
            )}
            <div>
              <button
                className="button secondary"
                disabled={isSaving}
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button className="button primary" disabled={isSaving} type="submit">
                {isSaving ? "Saving…" : task ? "Save changes" : "Create ticket"}
              </button>
            </div>
          </footer>
        </form>
      </section>
      {task && isArchiveConfirmOpen ? (
        <ConfirmationDialog
          confirmLabel="Archive ticket"
          description={`“${task.title}” will leave active boards and reports, but its history, comments, criteria, and project link will be preserved. You can restore it later.`}
          isBusy={isSaving}
          onCancel={() => setIsArchiveConfirmOpen(false)}
          onConfirm={() => void onArchive(task)}
          title="Archive this ticket?"
        />
      ) : null}
    </div>
  );
}

export default TaskModal;
