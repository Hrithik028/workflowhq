import { CalendarDays, Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import type { Project, Task, TaskInput, TaskPriority, TaskStatus } from "../types";

interface TaskModalProps {
  initialDueDate?: string | null;
  initialStatus?: TaskStatus;
  isSaving: boolean;
  onClose: () => void;
  onDelete: (task: Task) => Promise<void>;
  onSave: (input: TaskInput) => Promise<void>;
  projects: Project[];
  task: Task | null;
}

const emptyTask = (status: TaskStatus, dueDate: string | null = null): TaskInput => ({
  title: "",
  description: "",
  projectId: null,
  status,
  priority: "medium",
  dueDate
});

const taskToInput = (task: Task): TaskInput => ({
  title: task.title,
  description: task.description,
  projectId: task.projectId,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate
});

function TaskModal({
  initialDueDate = null,
  initialStatus = "todo",
  isSaving,
  onClose,
  onDelete,
  onSave,
  projects,
  task
}: TaskModalProps) {
  const [form, setForm] = useState<TaskInput>(() =>
    task ? taskToInput(task) : emptyTask(initialStatus, initialDueDate)
  );
  const [error, setError] = useState("");

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
            <span className="overline">{task ? "Task details" : "New work"}</span>
            <h2 id="task-modal-title">{task ? "Edit task" : "Create a task"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </header>

        <form className="modal-form" onSubmit={submit}>
          <label>
            <span>Task title</span>
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
              <span>Project</span>
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    projectId: event.target.value ? Number(event.target.value) : null
                  })
                }
                value={form.projectId ?? ""}
              >
                <option value="">Inbox</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
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
                {isSaving ? "Saving…" : task ? "Save changes" : "Create task"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default TaskModal;
