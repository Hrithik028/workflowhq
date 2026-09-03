import { describe, expect, it, vi } from "vitest";

import { api } from "./client";
import {
  githubApi,
  mapDevelopmentLink,
  mapGitHubInstallation,
  mapGitHubRepository
} from "./github";

describe("GitHub API mappers", () => {
  it("maps an installation and treats suspension as the authoritative state", () => {
    const installation = mapGitHubInstallation({
      id: "7",
      github_installation_id: "9007199254740993",
      account_login: "workflowhq",
      account_type: "Organization",
      repository_selection: "selected",
      repository_count: "12",
      selected_repository_count: "3",
      permissions: { contents: "read" },
      sync_state: "healthy",
      suspended_at: "2026-09-01T00:00:00.000Z",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z"
    });

    expect(installation).toMatchObject({
      id: 7,
      githubInstallationId: "9007199254740993",
      accountLogin: "workflowhq",
      repositoryCount: 12,
      selectedRepositoryCount: 3,
      syncState: "suspended"
    });
  });

  it("maps repository assignment and verified development links without inventing values", () => {
    const repository = mapGitHubRepository({
      id: 5,
      installation_id: 7,
      github_repository_id: "8001",
      owner_login: "workflowhq",
      name: "app",
      full_name: "workflowhq/app",
      html_url: "https://github.com/workflowhq/app",
      default_branch: "main",
      is_private: true,
      is_archived: false,
      selected: true,
      project_id: 4,
      project_key: "WHQ",
      project_name: "WorkflowHQ",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z"
    });
    const link = mapDevelopmentLink({
      id: 12,
      link_type: "pull_request",
      external_id: "42",
      github_number: 42,
      title: "WHQ-142 Verify webhook signatures",
      url: "https://github.com/workflowhq/app/pull/42",
      state: "open",
      actor_login: "hrithik",
      occurred_at: "2026-09-01T00:00:00.000Z",
      metadata: { review: "changes_requested" },
      repository_id: 5,
      repository_full_name: "workflowhq/app",
      repository_url: "https://github.com/workflowhq/app"
    });

    expect(repository).toMatchObject({
      fullName: "workflowhq/app",
      projectId: 4,
      projectKey: "WHQ",
      selected: true
    });
    expect(link).toMatchObject({
      type: "pull_request",
      githubNumber: 42,
      repositoryFullName: "workflowhq/app"
    });
  });

  it("allows bounded history imports to outlive the default request timeout", async () => {
    const post = vi.spyOn(api, "post").mockResolvedValue({
      data: {
        data: {
          runId: 9,
          status: "completed",
          repositoryCount: 1,
          imported: 66,
          failedRepositories: 0,
          historySince: "2026-06-05T00:00:00.000Z"
        }
      }
    });

    await expect(githubApi.syncInstallation(7)).resolves.toMatchObject({
      runId: 9,
      status: "completed",
      imported: 66,
      failedRepositories: 0
    });
    expect(post).toHaveBeenCalledWith(
      "/github/installations/7/sync",
      {},
      { timeout: 120_000 }
    );
    post.mockRestore();
  });
});
