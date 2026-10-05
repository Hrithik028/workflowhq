import { useState } from "react";
import { Link } from "react-router-dom";
import type { Task, TaskStats } from "../types";
import { CategoryBarChart } from "./AnalyticsCharts";

export function DeliveryInsights({
  stats,
  tasks,
  projectId = ""
}: {
  stats: TaskStats;
  tasks: Task[];
  projectId?: string;
}) {
  const active = tasks.filter((task) => task.status !== "completed");
  const ageBands = [0, 0, 0, 0];
  let unknownAge = 0;
  const [now] = useState(() => Date.now());
  for (const task of active) {
    const created = Date.parse(task.createdAt);
    if (!Number.isFinite(created)) {
      unknownAge++;
      continue;
    }
    const age = Math.max(0, Math.floor((now - created) / 86_400_000));
    ageBands[age < 7 ? 0 : age < 14 ? 1 : age < 30 ? 2 : 3]++;
  }
  const owners = new Map<string, number>();
  for (const task of active) {
    const owner = task.assigneeId == null ? "unassigned" : String(task.assigneeId);
    owners.set(owner, (owners.get(owner) || 0) + 1);
  }
  const ownerLabels = new Map(
    active.map((task) => [
      task.assigneeId == null ? "unassigned" : String(task.assigneeId),
      task.assigneeName || "Unassigned"
    ])
  );
  const ownerCounts = [...owners.entries()].sort((a, b) => b[1] - a[1]);
  const visibleOwners = ownerCounts.slice(0, 7);
  const otherOwners = ownerCounts.slice(7).reduce((sum, [, count]) => sum + count, 0);
  const lanes = [
    {
      key: "backlog",
      label: "Backlog",
      count: stats.todoTasks,
      color: "#2a78d6",
      hint: "Work waiting to start"
    },
    {
      key: "progress",
      label: "In progress",
      count: stats.inProgressTasks,
      color: "#eb6834",
      hint: "Work currently in motion"
    },
    {
      key: "released",
      label: "Released",
      count: stats.completedTasks,
      color: "#1baf7a",
      hint: "Currently completed issues"
    }
  ];
  const total = stats.totalTasks || 1;
  return (
    <>
      <section className="delivery-flow" aria-label="Workflow snapshot">
        <header>
          <span className="overline">Your delivery system</span>
          <h2>See where work stands.</h2>
          <p>
            Current issue counts, not historical transitions. Select a stage to explore its tickets.
          </p>
        </header>
        <div className="delivery-flow-lanes">
          {lanes.map((lane, index) => (
            <Link
              key={lane.key}
              to={`/workflow?stage=${lane.key}${projectId ? `&project=${projectId}` : ""}`}
              className="delivery-flow-stage"
              style={{ borderTopColor: lane.color }}
            >
              <span>
                0{index + 1} / {lane.label}
              </span>
              <strong>{lane.count}</strong>
              <small>{lane.hint}</small>
              <div className="delivery-flow-track">
                <i
                  style={{
                    width: `${Math.min(100, (lane.count / total) * 100)}%`,
                    background: lane.color
                  }}
                />
              </div>
              <b>
                {Math.round((lane.count / total) * 100)}% of issues{" "}
                <span aria-hidden="true">↗</span>
              </b>
            </Link>
          ))}
        </div>
        <p className="delivery-flow-note">
          Includes initiatives, epics and subtasks. Counts describe issues, not effort or team
          productivity.
        </p>
      </section>
      <div className="analytics-charts-grid delivery-insights-grid">
        <CategoryBarChart
          title="Open work age"
          caption={`Elapsed time since creation, not time in stage or cycle time.${unknownAge ? ` ${unknownAge} issues have no valid creation date.` : ""}`}
          categories={["Under 7 days", "7–13 days", "14–29 days", "30+ days"].map(
            (label, index) => ({
              key: String(index),
              label,
              value: ageBands[index],
              color: ["#2a78d6", "#eb6834", "#9b58ae", "#cf433e"][index]
            })
          )}
        />
        <CategoryBarChart
          title="Open work by owner"
          caption="Issue counts, not performance rankings. Unassigned work is included."
          categories={[
            ...visibleOwners.map(([key, value]) => ({
              key,
              label: ownerLabels.get(key)!,
              value,
              color: key === "unassigned" ? "#77736c" : "#2a78d6"
            })),
            ...(otherOwners
              ? [{ key: "other", label: "Other owners", value: otherOwners, color: "#9b58ae" }]
              : [])
          ]}
        />
      </div>
    </>
  );
}
