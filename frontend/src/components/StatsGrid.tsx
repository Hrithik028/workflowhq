import { AlertCircle, CheckCircle2, CircleDot, ListTodo, Timer, Zap } from "lucide-react";

import type { TaskStats } from "../types";

const stats = [
  { key: "totalTasks", label: "Total tasks", icon: ListTodo, tone: "navy" },
  { key: "todoTasks", label: "Ready", icon: CircleDot, tone: "slate" },
  { key: "inProgressTasks", label: "In motion", icon: Timer, tone: "amber" },
  { key: "completedTasks", label: "Shipped", icon: CheckCircle2, tone: "green" },
  { key: "highPriorityTasks", label: "High priority", icon: Zap, tone: "coral" },
  { key: "overdueTasks", label: "Overdue", icon: AlertCircle, tone: "red" }
] as const;

function StatsGrid({ values }: { values: TaskStats }) {
  return (
    <section className="stats-grid" aria-label="Task statistics">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <article className="stat-card" key={stat.key}>
            <span className={`stat-icon ${stat.tone}`}>
              <Icon size={17} />
            </span>
            <div>
              <strong>{values[stat.key]}</strong>
              <span>{stat.label}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

export default StatsGrid;
