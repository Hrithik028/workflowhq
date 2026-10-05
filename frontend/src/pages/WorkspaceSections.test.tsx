import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics } from "./WorkspaceSections";

const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listProjects: vi.fn(),
  getActivity: vi.fn(),
  getStats: vi.fn()
}));
vi.mock("../api/workspace", () => ({ workspaceApi: api }));
const stats = {
  totalTasks: 2,
  completedTasks: 0,
  inProgressTasks: 0,
  todoTasks: 2,
  highPriorityTasks: 2,
  mediumPriorityTasks: 0,
  lowPriorityTasks: 0,
  overdueTasks: 0,
  dailyCompletions: []
};
const task = (id: number, name: string) => ({
  id,
  status: "todo",
  createdAt: "2026-10-01",
  assigneeId: id,
  assigneeName: name
});
function showAnalytics() {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ isDemo: false }} />}>
          <Route path="/" element={<Analytics />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.getActivity.mockResolvedValue([]);
  api.getStats.mockResolvedValue(stats);
  api.listProjects.mockResolvedValue([
    { id: 4, name: "WorkflowHQ", taskCount: 2, completedCount: 0 }
  ]);
});
describe("Analytics data scope", () => {
  it("loads every task page for owner and age charts", async () => {
    api.listTasks.mockImplementation(async ({ page = 1 }) => ({
      data: [task(page, page === 1 ? "First owner" : "Second owner")],
      pagination: { pages: 2 }
    }));
    showAnalytics();
    const owners = await screen.findByRole("region", { name: "Open work by owner" });
    expect(within(owners).getAllByText("Second owner").length).toBeGreaterThan(0);
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 100 }));
  });
  it("scopes tasks, totals and lane links to the selected project", async () => {
    api.listTasks.mockImplementation(async ({ projectId }) => ({
      data: [task(1, projectId ? "Project owner" : "All owner")],
      pagination: { pages: 1 }
    }));
    showAnalytics();
    await screen.findByRole("region", { name: "Workflow snapshot" });
    fireEvent.change(screen.getByRole("combobox", { name: "Analytics project" }), {
      target: { value: "4" }
    });
    await waitFor(() => expect(api.getStats).toHaveBeenCalledWith(4));
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /01.*Backlog/ })).toHaveAttribute(
        "href",
        "/workflow?stage=backlog&project=4"
      )
    );
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ projectId: 4 }));
    expect(screen.queryByText("All owner")).not.toBeInTheDocument();
  });
});
