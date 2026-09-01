import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, Task, User } from "../types";
import TaskDetail from "./TaskDetail";

const githubMocks = vi.hoisted(() => ({ getTaskDevelopment: vi.fn() }));
const workspaceMocks = vi.hoisted(() => ({
  listAcceptanceCriteria: vi.fn(),
  listComments: vi.fn(),
  listProjects: vi.fn(),
  listTasks: vi.fn()
}));

vi.mock("../api/github", () => ({ githubApi: githubMocks }));
vi.mock("../api/workspace", () => ({ workspaceApi: workspaceMocks }));

const user: User = {
  id: 1,
  name: "Hrithik Jadhav",
  email: "hrithik@example.com",
  role: "user",
  createdAt: "2026-08-01T00:00:00.000Z"
};

const task: Task = {
  id: 4,
  userId: 1,
  projectId: 2,
  projectName: "WorkflowHQ",
  projectKey: "WHQ",
  issueKey: "WHQ-142",
  taskType: "task",
  parentId: null,
  parentTitle: null,
  childCount: 0,
  completedChildCount: 0,
  title: "Verify GitHub webhook signatures",
  description: "Validate signed webhook payloads.",
  status: "in_progress",
  priority: "high",
  startDate: null,
  dueDate: null,
  assigneeId: 1,
  assigneeName: "Hrithik Jadhav",
  assigneeEmail: "hrithik@example.com",
  labels: [],
  rank: 1,
  sprintId: null,
  sprintName: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const project: Project = {
  id: 2,
  userId: 1,
  key: "WHQ",
  name: "WorkflowHQ",
  description: "",
  taskCount: 1,
  completedCount: 0,
  myRole: "owner",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

describe("Task detail GitHub development data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMocks.listTasks.mockResolvedValue({
      data: [task],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 }
    });
    workspaceMocks.listProjects.mockResolvedValue([project]);
    workspaceMocks.listComments.mockResolvedValue([]);
    workspaceMocks.listAcceptanceCriteria.mockResolvedValue([]);
  });

  it("renders verified live development links returned by the GitHub API", async () => {
    githubMocks.getTaskDevelopment.mockResolvedValue({
      task: { id: 4, issueKey: "WHQ-142", title: task.title },
      links: [
        {
          id: 9,
          type: "pull_request",
          externalId: "42",
          githubNumber: 42,
          title: "WHQ-142 Verify webhook signatures",
          url: "https://github.com/workflowhq/app/pull/42",
          state: "open",
          actorLogin: "hrithik",
          occurredAt: "2026-09-01T00:00:00.000Z",
          metadata: {},
          repositoryId: 5,
          repositoryFullName: "workflowhq/app",
          repositoryUrl: "https://github.com/workflowhq/app"
        }
      ]
    });

    render(
      <MemoryRouter initialEntries={["/tasks/4"]}>
        <Routes>
          <Route element={<Outlet context={{ isDemo: false, user }} />}>
            <Route path="/tasks/:id" element={<TaskDetail />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Verified GitHub activity")).toBeInTheDocument();
    expect(githubMocks.getTaskDevelopment).toHaveBeenCalledWith(4);
    expect(
      screen.getByRole("link", { name: /#42 whq-142 verify webhook signatures/i })
    ).toHaveAttribute("href", "https://github.com/workflowhq/app/pull/42");
    expect(
      screen.queryByText(/verified development data will appear after/i)
    ).not.toBeInTheDocument();
  });
});
