import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import ProjectDevelopment from "./ProjectDevelopment";

const githubMocks = vi.hoisted(() => ({ getProjectDevelopment: vi.fn() }));
vi.mock("../api/github", () => ({ githubApi: githubMocks }));

const user: User = {
  id: 1,
  name: "Hrithik Jadhav",
  email: "hrithik@example.com",
  role: "user",
  createdAt: "2026-08-01T00:00:00.000Z"
};

const renderPage = (isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/projects/4/development"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user }} />}>
          <Route path="/projects/:id/development" element={<ProjectDevelopment />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("Project development history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.getProjectDevelopment.mockResolvedValue({
      project: {
        id: 4,
        key: "WHQ",
        name: "WorkflowHQ",
        description: "Developer command center",
        myRole: "owner"
      },
      repositories: [
        {
          id: 5,
          fullName: "workflowhq/app",
          htmlUrl: "https://github.com/workflowhq/app",
          defaultBranch: "main",
          isPrivate: true,
          isArchived: false,
          syncState: "healthy",
          lastSyncedAt: "2026-09-01T00:00:00.000Z",
          lastError: null
        }
      ],
      events: [
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
          repositoryFullName: "workflowhq/app",
          projectId: null,
          projectKey: null,
          projectName: null
        }
      ],
      taskLinks: [
        {
          eventId: 9,
          linkSource: "automatic",
          taskId: 142,
          issueKey: "WHQ-142",
          taskTitle: "Verify webhook signatures"
        }
      ]
    });
  });

  it("renders repository, event, and automatic ticket-link evidence", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "WorkflowHQ" })).toBeInTheDocument();
    expect(githubMocks.getProjectDevelopment).toHaveBeenCalledWith(4);
    expect(screen.getByRole("link", { name: /workflowhq\/app/i })).toHaveAttribute(
      "href",
      "https://github.com/workflowhq/app"
    );
    expect(
      screen.getByRole("link", { name: /whq-142 verify webhook signatures/i })
    ).toHaveAttribute("href", "https://github.com/workflowhq/app/pull/42");
    expect(screen.getByRole("link", { name: /whq-142automatic/i })).toHaveAttribute(
      "href",
      "/tasks/142"
    );
  });

  it("does not call live GitHub APIs in demo mode", () => {
    renderPage(true);

    expect(screen.getByText(/live repository data is unavailable/i)).toBeInTheDocument();
    expect(githubMocks.getProjectDevelopment).not.toHaveBeenCalled();
  });
});
