import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, Task, User } from "../types";
import ArchivePage from "./ArchivePage";

const workspaceMocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  listTasks: vi.fn(),
  restoreProject: vi.fn(),
  restoreTask: vi.fn()
}));

vi.mock("../api/workspace", () => ({ workspaceApi: workspaceMocks }));

const user: User = {
  id: 1,
  name: "Hrithik Jadhav",
  email: "hrithik@example.com",
  role: "platform_owner",
  createdAt: "2026-08-01T00:00:00.000Z"
};

const project: Project = {
  id: 2,
  userId: 1,
  key: "WHQ",
  name: "WorkflowHQ",
  description: "Developer platform",
  taskCount: 1,
  totalTaskCount: 1,
  completedCount: 0,
  myRole: "owner",
  archivedAt: "2026-09-01T00:00:00.000Z",
  archivedBy: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const task: Task = {
  id: 4,
  userId: 1,
  projectId: null,
  projectName: null,
  projectKey: null,
  issueKey: "INB-4",
  taskType: "task",
  parentId: null,
  parentTitle: null,
  childCount: 0,
  completedChildCount: 0,
  title: "Archived ticket",
  description: "Retained context",
  status: "todo",
  priority: "medium",
  startDate: null,
  dueDate: null,
  assigneeId: null,
  assigneeName: null,
  assigneeEmail: null,
  labels: [],
  rank: null,
  sprintId: null,
  sprintName: null,
  archivedAt: "2026-09-01T00:00:00.000Z",
  archivedBy: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/archive"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo: false, user }} />}>
          <Route path="/archive" element={<ArchivePage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("Archive page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMocks.listProjects.mockResolvedValue([project]);
    workspaceMocks.listTasks.mockResolvedValue({
      data: [task],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 }
    });
    workspaceMocks.restoreProject.mockResolvedValue({ ...project, archivedAt: null });
    workspaceMocks.restoreTask.mockResolvedValue({ ...task, archivedAt: null });
  });

  it("shows retained projects and tickets and restores them", async () => {
    const browser = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Archived projects" })).toBeInTheDocument();
    expect(screen.getByText("WorkflowHQ")).toBeInTheDocument();
    expect(screen.getByText("Archived ticket")).toBeInTheDocument();
    expect(workspaceMocks.listProjects).toHaveBeenCalledWith({ archived: true });
    expect(workspaceMocks.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ archived: true })
    );
    expect(screen.getByLabelText("Permanently delete WorkflowHQ")).toBeDisabled();

    await browser.click(screen.getAllByRole("button", { name: /restore/i })[0]);
    expect(workspaceMocks.restoreProject).toHaveBeenCalledWith(2);
  });
});
