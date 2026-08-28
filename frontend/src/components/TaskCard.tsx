import { CalendarDays, MoreHorizontal } from "lucide-react";

import type { Task, TaskStatus } from "../types";
import { formatDate, statusLabel } from "../utils/format";
import LabelPill from "./LabelPill";

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

function TaskCard({ task, onEdit, onMove }: TaskCardProps) {
  return (
    <article
      className="kanban-card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/task-id", String(task.id));
        event.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="card-topline">
        <span className={`priority-pill ${task.priority}`}>{task.priority}</span>
        <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`}>
          <MoreHorizontal size={18} />
        </button>
      </div>
      <button className="task-title-button" type="button" onClick={() => onEdit(task)}>
        {task.title}
      </button>
      {task.description ? <p className="task-summary">{task.description}</p> : null}
      {task.labels.length > 0 ? (
        <div className="label-row">
          {task.labels.map((label) => (
            <LabelPill key={label.id} label={label} />
          ))}
        </div>
      ) : null}
      <div className="task-project-row">
        <span className="project-dot" />
        <span>{task.projectName || "Inbox"}</span>
      </div>
      <div className="task-card-footer">
        <span
          className={
            task.dueDate &&
            task.dueDate < new Date().toISOString().slice(0, 10) &&
            task.status !== "completed"
              ? "date overdue"
              : "date"
          }
        >
          <CalendarDays size={14} />
          {formatDate(task.dueDate)}
        </span>
        <label className="status-select-label">
          <span className="sr-only">Move {task.title}</span>
          <select
            aria-label={`Move ${task.title}`}
            onChange={(event) => onMove(task, event.target.value as TaskStatus)}
            value={task.status}
          >
            {(Object.keys(statusLabel) as TaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabel[status]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}

export default TaskCard;
