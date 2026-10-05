import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DeliveryInsights } from "./DeliveryInsights";
import { TrendBarChart } from "./AnalyticsCharts";
import type { Task, TaskStats } from "../types";

const stats: TaskStats = {
  totalTasks: 4,
  completedTasks: 1,
  inProgressTasks: 1,
  todoTasks: 2,
  highPriorityTasks: 1,
  mediumPriorityTasks: 2,
  lowPriorityTasks: 1,
  overdueTasks: 0,
  dailyCompletions: []
};
describe("Delivery insights", () => {
  it("links real workflow counts to project-scoped lanes", () => {
    render(
      <MemoryRouter>
        <DeliveryInsights stats={stats} tasks={[]} projectId="4" />
      </MemoryRouter>
    );
    const lane = screen.getByRole("link", { name: /01.*Backlog/i });
    expect(lane).toHaveAttribute("href", "/workflow?stage=backlog&project=4");
    expect(within(lane).getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/not historical transitions/i)).toBeInTheDocument();
  });
  it("includes unassigned work and excludes completed work from age/owner charts", () => {
    const tasks = [
      { id: 1, status: "todo", assigneeId: null, createdAt: new Date().toISOString() },
      {
        id: 2,
        status: "completed",
        assigneeId: 1,
        assigneeName: "Completed owner",
        createdAt: "2020-01-01"
      }
    ] as Task[];
    render(
      <MemoryRouter>
        <DeliveryInsights stats={stats} tasks={tasks} />
      </MemoryRouter>
    );
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.queryByText("Completed owner")).not.toBeInTheDocument();
    expect(screen.getByText(/not time in stage or cycle time/i)).toBeInTheDocument();
  });
  it("renders empty and all-zero trends without invalid SVG coordinates", () => {
    const { rerender, container } = render(<TrendBarChart title="Trend" color="#111" data={[]} />);
    expect(screen.getByText("No completion data recorded.")).toBeInTheDocument();
    rerender(
      <TrendBarChart title="Trend" color="#111" data={[{ date: "2026-10-01", count: 0 }]} />
    );
    expect(screen.getByRole("img")).toHaveAccessibleName(/0 completed issues/);
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});
