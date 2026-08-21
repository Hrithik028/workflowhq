import { Circle, CircleCheck, Timer, Plus } from "lucide-react";

import type { Task, TaskStatus } from "../types";
import TaskCard from "./TaskCard";

const columns: Array<{
  status: TaskStatus;
  title: string;
  icon: typeof Circle;
  accent: string;
}> = [
  { status: "todo", title: "To do", icon: Circle, accent: "slate" },
  { status: "in_progress", title: "In progress", icon: Timer, accent: "amber" },
  { status: "completed", title: "Completed", icon: CircleCheck, accent: "green" }
];

interface KanbanBoardProps {
  tasks: Task[];
  onCreate: (status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onMove: (task: Task, status: TaskStatus) => void;
}

function KanbanBoard({ tasks, onCreate, onEdit, onMove }: KanbanBoardProps) {
  return (
    <div className="kanban-board" aria-label="Task board">
      {columns.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        const Icon = column.icon;
        return (
          <section
            className={`kanban-column ${column.accent}`}
            key={column.status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const taskId = Number(event.dataTransfer.getData("text/task-id"));
              const task = tasks.find((item) => item.id === taskId);
              if (task && task.status !== column.status) onMove(task, column.status);
            }}
          >
            <header className="kanban-column-header">
              <div>
                <Icon size={17} />
                <h3>{column.title}</h3>
                <span>{columnTasks.length}</span>
              </div>
              <button
                type="button"
                onClick={() => onCreate(column.status)}
                aria-label={`Add ${column.title} task`}
              >
                <Plus size={18} />
              </button>
            </header>
            <div className="kanban-card-list">
              {columnTasks.map((task) => (
                <TaskCard key={task.id} task={task} onEdit={onEdit} onMove={onMove} />
              ))}
              {columnTasks.length === 0 ? (
                <button
                  className="column-empty"
                  type="button"
                  onClick={() => onCreate(column.status)}
                >
                  <Plus size={17} /> Add a task
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default KanbanBoard;
