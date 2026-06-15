import { useEffect, useState } from "react";

import api from "../api/api";
import TaskCard from "../components/TaskCard";
import TaskForm from "../components/TaskForm";

const initialStats = {
  total_tasks: 0,
  completed_tasks: 0,
  in_progress_tasks: 0,
  todo_tasks: 0,
  high_priority_tasks: 0
};

const statsConfig = [
  { key: "total_tasks", label: "Total Tasks" },
  { key: "completed_tasks", label: "Completed" },
  { key: "in_progress_tasks", label: "In Progress" },
  { key: "todo_tasks", label: "Todo" },
  { key: "high_priority_tasks", label: "High Priority" }
];

function Dashboard({ user }) {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(initialStats);
  const [filters, setFilters] = useState({ status: "", priority: "" });
  const [selectedTask, setSelectedTask] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDashboardData = async (activeFilters = filters) => {
    setError("");

    try {
      const [tasksResponse, statsResponse] = await Promise.all([
        api.get("/tasks", {
          params: {
            status: activeFilters.status || undefined,
            priority: activeFilters.priority || undefined
          }
        }),
        api.get("/tasks/stats")
      ]);

      setTasks(tasksResponse.data);
      setStats(statsResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleFilterChange = async (event) => {
    const { name, value } = event.target;
    const nextFilters = { ...filters, [name]: value };
    setFilters(nextFilters);
    setIsLoading(true);
    await fetchDashboardData(nextFilters);
  };

  const handleTaskSubmit = async (taskData) => {
    setIsSaving(true);
    setError("");
    setSuccessMessage("");

    try {
      if (selectedTask) {
        await api.put(`/tasks/${selectedTask.id}`, taskData);
        setSuccessMessage("Task updated successfully.");
      } else {
        await api.post("/tasks", taskData);
        setSuccessMessage("Task created successfully.");
      }

      setSelectedTask(null);
      setIsLoading(true);
      await fetchDashboardData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save the task.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    setError("");
    setSuccessMessage("");

    try {
      await api.delete(`/tasks/${taskId}`);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      setSuccessMessage("Task deleted successfully.");
      setIsLoading(true);
      await fetchDashboardData();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to delete the task.");
      setIsLoading(false);
    }
  };

  return (
    <main className="page-shell dashboard-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1>{user?.name ? `${user.name}'s workflow hub` : "Your workflow hub"}</h1>
          <p className="hero-copy">
            Track delivery across todo, in-progress, and completed work while keeping priority and due dates visible.
          </p>
        </div>

        <div className="filter-row">
          <label>
            Status
            <select name="status" onChange={handleFilterChange} value={filters.status}>
              <option value="">All</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </label>

          <label>
            Priority
            <select name="priority" onChange={handleFilterChange} value={filters.priority}>
              <option value="">All</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
      </section>

      <section className="stats-grid">
        {statsConfig.map((item) => (
          <article className="stat-card" key={item.key}>
            <p>{item.label}</p>
            <strong>{stats[item.key]}</strong>
          </article>
        ))}
      </section>

      {error ? <p className="form-error dashboard-message">{error}</p> : null}
      {successMessage ? <p className="form-success dashboard-message">{successMessage}</p> : null}

      <section className="dashboard-grid">
        <TaskForm
          initialTask={selectedTask}
          isSaving={isSaving}
          onCancel={() => setSelectedTask(null)}
          onSubmit={handleTaskSubmit}
        />

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Task list</p>
              <h2>Current tasks</h2>
            </div>
          </div>

          {isLoading ? <p className="muted-copy">Loading tasks...</p> : null}

          {!isLoading && tasks.length === 0 ? (
            <div className="empty-state">
              <h3>No tasks found</h3>
              <p>Create your first task or adjust the current filters.</p>
            </div>
          ) : null}

          <div className="task-list">
            {tasks.map((task) => (
              <TaskCard key={task.id} onDelete={handleDeleteTask} onEdit={setSelectedTask} task={task} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

export default Dashboard;

