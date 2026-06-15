const formatDate = (value) => {
  if (!value) {
    return "No due date";
  }

  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString();
};

function TaskCard({ task, onEdit, onDelete }) {
  return (
    <article className="task-card">
      <div className="task-card-header">
        <div>
          <h3>{task.title}</h3>
          <p className="task-meta">
            <span className={`badge badge-status status-${task.status}`}>{task.status.replace("_", " ")}</span>
            <span className={`badge badge-priority priority-${task.priority}`}>{task.priority} priority</span>
          </p>
        </div>
        <div className="task-card-actions">
          <button className="text-button" onClick={() => onEdit(task)} type="button">
            Edit
          </button>
          <button className="text-button danger-text" onClick={() => onDelete(task.id)} type="button">
            Delete
          </button>
        </div>
      </div>

      <p className="task-description">{task.description || "No description provided."}</p>

      <div className="task-card-footer">
        <span>Due: {formatDate(task.due_date)}</span>
        <span>Updated: {formatDate(task.updated_at)}</span>
      </div>
    </article>
  );
}

export default TaskCard;
