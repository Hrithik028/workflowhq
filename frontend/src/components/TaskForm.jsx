import { useEffect, useState } from "react";

const defaultValues = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  due_date: ""
};

function TaskForm({ initialTask, onSubmit, onCancel, isSaving }) {
  const [formData, setFormData] = useState(defaultValues);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!initialTask) {
      setFormData(defaultValues);
      setError("");
      return;
    }

    setFormData({
      title: initialTask.title || "",
      description: initialTask.description || "",
      status: initialTask.status || "todo",
      priority: initialTask.priority || "medium",
      due_date: initialTask.due_date ? initialTask.due_date.slice(0, 10) : ""
    });
    setError("");
  }, [initialTask]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.title.trim()) {
      setError("Task title is required.");
      return;
    }

    setError("");
    await onSubmit({
      ...formData,
      title: formData.title.trim(),
      description: formData.description.trim()
    });

    if (!initialTask) {
      setFormData(defaultValues);
    }
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{initialTask ? "Edit task" : "New task"}</p>
          <h2>{initialTask ? "Update task details" : "Create a new task"}</h2>
        </div>
        {initialTask ? (
          <button className="secondary-button" onClick={onCancel} type="button">
            Cancel edit
          </button>
        ) : null}
      </div>

      <form className="task-form" onSubmit={handleSubmit}>
        <label>
          Title
          <input name="title" onChange={handleChange} placeholder="Ship dashboard stats" value={formData.title} />
        </label>

        <label>
          Description
          <textarea
            name="description"
            onChange={handleChange}
            placeholder="Add a concise summary of the task work."
            rows="4"
            value={formData.description}
          />
        </label>

        <div className="form-grid">
          <label>
            Status
            <select name="status" onChange={handleChange} value={formData.status}>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>

          <label>
            Priority
            <select name="priority" onChange={handleChange} value={formData.priority}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label>
            Due date
            <input name="due_date" onChange={handleChange} type="date" value={formData.due_date} />
          </label>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <button className="primary-button" disabled={isSaving} type="submit">
          {isSaving ? "Saving..." : initialTask ? "Update task" : "Add task"}
        </button>
      </form>
    </section>
  );
}

export default TaskForm;

