import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import { isAllowedGitHubInstallUrl } from "../utils/github";
import GitHubIntegration from "./GitHubIntegration";

const githubMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  getStatus: vi.fn(),
  getTaskDevelopment: vi.fn(),
  listRepositories: vi.fn(),
  setRepositorySelection: vi.fn(),
  syncInstallation: vi.fn()
}));
const workspaceMocks = vi.hoisted(() => ({ listProjects: vi.fn() }));

vi.mock("../api/github", () => ({ githubApi: githubMocks }));
vi.mock("../api/workspace", () => ({ workspaceApi: workspaceMocks }));

const user: User = {
  id: 1,
  name: "Hrithik Jadhav",
  email: "hrithik@example.com",
  role: "platform_owner",
  createdAt: "2026-08-01T00:00:00.000Z"
};

const renderPage = (isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/settings/integrations/github"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user }} />}>
          <Route path="/settings/integrations/github" element={<GitHubIntegration />} />
          <Route path="/settings" element={<p>Settings</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("GitHub integration page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMocks.listProjects.mockResolvedValue([]);
    githubMocks.listRepositories.mockResolvedValue([]);
  });

  it("shows a truthful disconnected state when no installation exists", async () => {
    githubMocks.getStatus.mockResolvedValue({ connected: false, installations: [] });
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /bring verified github activity/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect github/i })).toBeInTheDocument();
    expect(screen.queryByText(/sample repositories/i)).not.toBeInTheDocument();
    expect(githubMocks.listRepositories).not.toHaveBeenCalled();
  });

  it("renders server-provided failure and repository assignment state", async () => {
    githubMocks.getStatus.mockResolvedValue({
      connected: true,
      installations: [
        {
          id: 7,
          githubInstallationId: "7001",
          accountLogin: "workflowhq",
          accountType: "Organization",
          repositorySelection: "selected",
          repositoryCount: 1,
          selectedRepositoryCount: 1,
          permissions: {},
          suspendedAt: null,
          syncState: "failed",
          lastSyncedAt: null,
          lastError: "GitHub permission was revoked.",
          manageUrl: "https://github.com/settings/installations/7001",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z"
        }
      ]
    });
    workspaceMocks.listProjects.mockResolvedValue([
      {
        id: 4,
        userId: 1,
        key: "WHQ",
        name: "WorkflowHQ",
        description: "",
        taskCount: 1,
        completedCount: 0,
        myRole: "owner",
        createdAt: "",
        updatedAt: ""
      }
    ]);
    githubMocks.listRepositories.mockResolvedValue([
      {
        id: 5,
        installationId: 7,
        githubRepositoryId: "8001",
        ownerLogin: "workflowhq",
        name: "app",
        fullName: "workflowhq/app",
        htmlUrl: "https://github.com/workflowhq/app",
        defaultBranch: "main",
        isPrivate: true,
        isArchived: false,
        selected: true,
        projectId: 4,
        projectKey: "WHQ",
        projectName: "WorkflowHQ",
        syncState: "failed",
        lastSyncedAt: null,
        lastError: "Repository sync failed.",
        createdAt: "",
        updatedAt: ""
      }
    ]);

    renderPage();

    expect(await screen.findByText("Sync failed")).toBeInTheDocument();
    expect(screen.getByText("GitHub permission was revoked.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "workflowhq/app" })).toHaveAttribute(
      "href",
      "https://github.com/workflowhq/app"
    );
    expect(screen.getByRole("combobox", { name: /project for workflowhq\/app/i })).toHaveValue("4");
    expect(screen.getByText("Repository sync failed.")).toBeInTheDocument();
  });

  it("keeps preview mode separate from live GitHub APIs", async () => {
    renderPage(true);

    expect(
      screen.getByRole("heading", { name: /live github connection is disabled/i })
    ).toBeInTheDocument();
    await waitFor(() => expect(githubMocks.getStatus).not.toHaveBeenCalled());
    expect(
      screen.getByText(/illustrative and is never presented as synchronized/i)
    ).toBeInTheDocument();
  });

  it("accepts only secure github.com installation URLs", () => {
    expect(isAllowedGitHubInstallUrl("https://github.com/apps/workflowhq/installations/new")).toBe(
      true
    );
    expect(isAllowedGitHubInstallUrl("http://github.com/apps/workflowhq")).toBe(false);
    expect(isAllowedGitHubInstallUrl("https://github.example.com/apps/workflowhq")).toBe(false);
    expect(isAllowedGitHubInstallUrl("not a url")).toBe(false);
  });
});
