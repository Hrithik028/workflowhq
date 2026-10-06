import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectRoadmap } from "../types";
import ProjectRoadmapPage from "./ProjectRoadmap";

const api = vi.hoisted(() => ({
  getProjectRoadmap: vi.fn(),
  getProjectWorkflow: vi.fn(),
  createTaskDependency: vi.fn(),
  deleteTaskDependency: vi.fn()
}));
vi.mock("../api/workspace", () => ({ workspaceApi: api }));

const data: ProjectRoadmap = {
  project: { id: 4, key: "WHQ", name: "WorkflowHQ", myRole: "owner" },
  tasks: [
    {
      id: 1,
      issueKey: "WHQ-1",
      title: "Design",
      taskType: "task",
      status: "completed",
      startDate: null,
      dueDate: "2026-10-01",
      parentId: null
    },
    {
      id: 2,
      issueKey: "WHQ-2",
      title: "Build",
      taskType: "task",
      status: "todo",
      startDate: null,
      dueDate: "2026-10-08",
      parentId: null
    }
  ],
  dependencies: []
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/projects/4/roadmap"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo: false }} />}>
          <Route path="/projects/:id/roadmap" element={<ProjectRoadmapPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("project roadmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getProjectRoadmap.mockResolvedValue(data);
    api.getProjectWorkflow.mockResolvedValue({
      statuses: [
        { status: "todo", label: "Planned" },
        { status: "in_progress", label: "Building" },
        { status: "completed", label: "Done" }
      ]
    });
    api.createTaskDependency.mockResolvedValue(undefined);
  });

  it("shows the project timeline and adds a blocking relationship", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("WHQ-1")).toBeInTheDocument();
    expect(screen.getByText(/Planned/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Blocking ticket"), "1");
    await user.selectOptions(screen.getByLabelText("Waiting ticket"), "2");
    await user.click(screen.getByRole("button", { name: "Add dependency" }));
    await waitFor(() => expect(api.createTaskDependency).toHaveBeenCalledWith(4, 1, 2));
  });

  it("keeps viewer access read-only", async () => {
    api.getProjectRoadmap.mockResolvedValue({
      ...data,
      project: { ...data.project, myRole: "viewer" }
    });
    renderPage();
    expect(await screen.findByText("WHQ-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add dependency" })).not.toBeInTheDocument();
  });
});
