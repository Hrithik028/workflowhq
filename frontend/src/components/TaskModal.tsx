import { CalendarDays, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import type { Project, Task, TaskInput, TaskPriority, TaskStatus, TaskType } from "../types";

interface TaskModalProps {
  initialDueDate?: string | null;
  initialParentTask?: Task | null;
  initialStatus?: TaskStatus;
  isSaving: boolean;
  onClose: () => void;
  onDelete: (task: Task) => Promise<void>;
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
  dueDate,
  taskType: parent ? childTypeFor(parent) : "task",
  parentId: parent?.id ?? null
});

const taskToInput = (task: Task): TaskInput => ({
  title: task.title,
  description: task.description,
  projectId: task.projectId,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  taskType: task.taskType,
  parentId: task.parentId
});

function TaskModal({
  initialDueDate = null,
  initialParentTask = null,
  initialStatus = "todo",
  isSaving,
  onClose,
  onDelete,
  onSave,
  projects,
  task,
  tasks = []
}: TaskModalProps) {
  const [form, setForm] = useState<TaskInput>(() =>
    task ? taskToInput(task) : emptyTask(initialStatus, initialDueDate, initialParentTask)
  );
  const [error, setError] = useState("");

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
          <div className="modal-form-grid">
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
          </div>
          <div className="modal-form-grid">
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

          {error ? <p className="form-alert error">{error}</p> : null}
          <footer className="modal-actions">
            {task ? (
              <button
                className="button danger ghost"
                disabled={isSaving}
                type="button"
                onClick={() => {
                  if (window.confirm(`Delete “${task.title}”? This cannot be undone.`))
                    void onDelete(task);
                }}
              >
                <Trash2 size={16} /> Delete
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
    </div>
  );
}

export default TaskModal;
