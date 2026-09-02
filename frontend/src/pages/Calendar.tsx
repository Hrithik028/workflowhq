import { ArrowLeft, ArrowRight, CalendarPlus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { getErrorMessage } from "../api/client";
import { workspaceApi } from "../api/workspace";
import type { LayoutContext } from "../components/AppLayout";
import TaskModal from "../components/TaskModal";
import { demoWorkspaceApi } from "../demo/workspaceDemo";
import type { Project, Task, TaskInput } from "../types";
import { formatDate } from "../utils/format";

const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthGrid = (visibleMonth: Date) => {
  const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};

function Calendar() {
  const { isDemo } = useOutletContext<LayoutContext>();
  const client = useMemo(() => (isDemo ? demoWorkspaceApi : workspaceApi), [isDemo]);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskDate, setNewTaskDate] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCalendar = useCallback(async () => {
    setIsLoading(true);
    try {
      const [taskResult, projectResult] = await Promise.all([
        client.listTasks({
          limit: 100,
          projectId: projectId ? Number(projectId) : undefined,
          sort: "due_date",
          order: "asc"
        }),
        client.listProjects()
      ]);
      setTasks(taskResult.data);
      setProjects(projectResult);
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load the calendar."));
    } finally {
      setIsLoading(false);
    }
  }, [client, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCalendar(), 0);
    return () => window.clearTimeout(timer);
  }, [loadCalendar]);

  const saveTask = async (input: TaskInput) => {
    setIsSaving(true);
    try {
      if (editingTask) await client.updateTask(editingTask.id, input);
      else await client.createTask(input);
      setEditingTask(null);
      setNewTaskDate(null);
      setIsModalOpen(false);
      await loadCalendar();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "Unable to save the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const archiveTask = async (task: Task) => {
    setIsSaving(true);
    try {
      await client.archiveTask(task.id);
      setEditingTask(null);
      setIsModalOpen(false);
      await loadCalendar();
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, "Unable to delete the task."));
    } finally {
      setIsSaving(false);
    }
  };

  const days = monthGrid(visibleMonth);
  const todayKey = toDateKey(new Date());
  const tasksByDate = tasks.reduce<Record<string, Task[]>>((groups, task) => {
    if (!task.dueDate) return groups;
    groups[task.dueDate] = [...(groups[task.dueDate] || []), task];
    return groups;
  }, {});
  const agenda = tasks
    .filter((task) => task.dueDate && task.dueDate >= todayKey && task.status !== "completed")
    .slice(0, 8);
  const monthLabel = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric"
  }).format(visibleMonth);

  const openCreate = (date = todayKey) => {
    setEditingTask(null);
    setNewTaskDate(date);
    setIsModalOpen(true);
  };

  return (
    <main className="workspace-page calendar-page editorial-page">
      <header className="workspace-header editorial-page-header">
        <div>
          <span className="overline">Schedule / 03</span>
          <h1>Delivery calendar.</h1>
          <p>See every deadline in context and turn any date into an actionable task.</p>
        </div>
        <button className="button primary" type="button" onClick={() => openCreate()}>
          <Plus size={17} /> New task
        </button>
      </header>

      <div className="calendar-toolbar">
        <div className="calendar-month-controls">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() =>
              setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ArrowLeft size={17} />
          </button>
          <h2>{monthLabel}</h2>
          <button
            type="button"
            aria-label="Next month"
            onClick={() =>
              setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ArrowRight size={17} />
          </button>
          <button
            className="calendar-today"
            type="button"
            onClick={() =>
              setVisibleMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
            }
          >
            Today
          </button>
        </div>
        <select
          aria-label="Filter calendar by project"
          onChange={(event) => setProjectId(event.target.value)}
          value={projectId}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {error ? <p className="form-alert error">{error}</p> : null}

      <div className="calendar-layout">
        <section className="month-calendar" aria-label={`${monthLabel} task calendar`}>
          <div className="calendar-weekdays" aria-hidden="true">
            {dayLabels.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((day) => {
              const key = toDateKey(day);
              const dayTasks = tasksByDate[key] || [];
              const muted = day.getMonth() !== visibleMonth.getMonth();
              return (
                <article
                  className={`calendar-day${muted ? " muted" : ""}${key === todayKey ? " today" : ""}`}
                  key={key}
                >
                  <header>
                    <span>{day.getDate()}</span>
                    <button
                      type="button"
                      aria-label={`Add task due ${key}`}
                      onClick={() => openCreate(key)}
                    >
                      <Plus size={13} />
                    </button>
                  </header>
                  <div className="calendar-day-tasks">
                    {dayTasks.slice(0, 3).map((task) => (
                      <button
                        className={`calendar-task ${task.priority} ${task.status}`}
                        key={task.id}
                        title={task.title}
                        type="button"
                        onClick={() => {
                          setEditingTask(task);
                          setNewTaskDate(null);
                          setIsModalOpen(true);
                        }}
                      >
                        <i />
                        <span>{task.title}</span>
                      </button>
                    ))}
                    {dayTasks.length > 3 ? (
                      <span className="calendar-more">+{dayTasks.length - 3} more</span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {isLoading ? <span className="calendar-loading">Updating schedule…</span> : null}
        </section>

        <aside className="calendar-agenda">
          <header>
            <span className="overline">Next in line</span>
            <h2>Upcoming</h2>
          </header>
          <div>
            {agenda.map((task, index) => (
              <button
                className="agenda-item"
                key={task.id}
                type="button"
                onClick={() => {
                  setEditingTask(task);
                  setNewTaskDate(null);
                  setIsModalOpen(true);
                }}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{task.title}</strong>
                  <small>
                    {formatDate(task.dueDate)} / {task.projectName || "Inbox"}
                  </small>
                </div>
                <i className={task.priority} />
              </button>
            ))}
            {agenda.length === 0 ? (
              <div className="agenda-empty">
                <CalendarPlus size={21} />
                <p>No upcoming deadlines in this view.</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {isModalOpen ? (
        <TaskModal
          client={client}
          initialDueDate={newTaskDate}
          isSaving={isSaving}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
            setNewTaskDate(null);
          }}
          onArchive={archiveTask}
          onSave={saveTask}
          projects={projects}
          task={editingTask}
          tasks={tasks}
        />
      ) : null}
    </main>
  );
}

export default Calendar;
