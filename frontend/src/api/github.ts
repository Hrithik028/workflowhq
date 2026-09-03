import { api } from "./client";
import type {
  DevelopmentLink,
  GitHubInstallation,
  GitHubCommandSummary,
  GitHubDevelopmentEvent,
  GitHubIntegrationStatus,
  GitHubRepository,
  GitHubSyncResult,
  GitHubSyncState,
  Project,
  ProjectDevelopment,
  TaskDevelopment
} from "../types";

type Raw = Record<string, unknown>;

const syncStateFor = (value: unknown, suspendedAt: unknown): GitHubSyncState => {
  if (suspendedAt) return "suspended";
  const state = String(value || "never");
  if (state === "succeeded") return "healthy";
  return ["never", "queued", "syncing", "healthy", "partial", "failed"].includes(state)
    ? (state as GitHubSyncState)
    : "never";
};

export const mapGitHubInstallation = (installation: Raw): GitHubInstallation => ({
  id: Number(installation.id),
  githubInstallationId: String(installation.github_installation_id),
  accountLogin: String(installation.account_login),
  accountType: installation.account_type as GitHubInstallation["accountType"],
  repositorySelection:
    installation.repository_selection as GitHubInstallation["repositorySelection"],
  repositoryCount: Number(installation.repository_count || 0),
  selectedRepositoryCount: Number(installation.selected_repository_count || 0),
  permissions: (installation.permissions || {}) as Record<string, string>,
  suspendedAt: installation.suspended_at == null ? null : String(installation.suspended_at),
  syncState: syncStateFor(
    installation.sync_state ?? installation.sync_status,
    installation.suspended_at
  ),
  lastSyncedAt: installation.last_synced_at == null ? null : String(installation.last_synced_at),
  lastError:
    installation.last_error == null && installation.last_sync_error == null
      ? null
      : String(installation.last_error ?? installation.last_sync_error),
  manageUrl: installation.manage_url == null ? null : String(installation.manage_url),
  createdAt: String(installation.created_at),
  updatedAt: String(installation.updated_at)
});

export const mapGitHubRepository = (repository: Raw): GitHubRepository => ({
  id: Number(repository.id),
  installationId: Number(repository.installation_id),
  githubRepositoryId: String(repository.github_repository_id),
  ownerLogin: String(repository.owner_login),
  name: String(repository.name),
  fullName: String(repository.full_name),
  htmlUrl: String(repository.html_url),
  defaultBranch: String(repository.default_branch || "main"),
  isPrivate: Boolean(repository.is_private),
  isArchived: Boolean(repository.is_archived),
  selected: Boolean(repository.selected),
  projectId: repository.project_id == null ? null : Number(repository.project_id),
  projectKey: repository.project_key == null ? null : String(repository.project_key),
  projectName: repository.project_name == null ? null : String(repository.project_name),
  syncState: syncStateFor(repository.sync_state ?? repository.sync_status, null),
  lastSyncedAt: repository.last_synced_at == null ? null : String(repository.last_synced_at),
  lastError:
    repository.last_error == null && repository.last_sync_error == null
      ? null
      : String(repository.last_error ?? repository.last_sync_error),
  createdAt: String(repository.created_at),
  updatedAt: String(repository.updated_at)
});

export const mapDevelopmentLink = (link: Raw): DevelopmentLink => ({
  id: Number(link.id),
  type: link.link_type as DevelopmentLink["type"],
  externalId: String(link.external_id),
  githubNumber: link.github_number == null ? null : Number(link.github_number),
  title: String(link.title),
  url: String(link.url),
  state: link.state == null ? null : String(link.state),
  actorLogin: link.actor_login == null ? null : String(link.actor_login),
  occurredAt: String(link.occurred_at),
  metadata: (link.metadata || {}) as Record<string, unknown>,
  repositoryId: Number(link.repository_id),
  repositoryFullName: String(link.repository_full_name),
  repositoryUrl: String(link.repository_url),
  linkSource: link.link_source === "manual" ? "manual" : "automatic"
});

const mapDevelopmentEvent = (event: Raw): GitHubDevelopmentEvent => ({
  id: Number(event.id),
  type: event.event_type as GitHubDevelopmentEvent["type"],
  externalId: String(event.external_id),
  githubNumber: event.github_number == null ? null : Number(event.github_number),
  title: String(event.title),
  url: String(event.url),
  state: event.state == null ? null : String(event.state),
  actorLogin: event.actor_login == null ? null : String(event.actor_login),
  occurredAt: String(event.occurred_at),
  metadata: (event.metadata || {}) as Record<string, unknown>,
  repositoryFullName: String(event.repository_full_name),
  projectId: event.project_id == null ? null : Number(event.project_id),
  projectKey: event.project_key == null ? null : String(event.project_key),
  projectName: event.project_name == null ? null : String(event.project_name)
});

export const githubApi = {
  async getStatus(): Promise<GitHubIntegrationStatus> {
    const response = await api.get<{ data: { connected: boolean; installations: Raw[] } }>(
      "/github/status"
    );
    return {
      connected: response.data.data.connected,
      installations: response.data.data.installations.map(mapGitHubInstallation)
    };
  },

  async connect(): Promise<string> {
    const response = await api.post<{ data: { installUrl: string } }>("/github/connect");
    return response.data.data.installUrl;
  },

  async listRepositories(): Promise<GitHubRepository[]> {
    const response = await api.get<{ data: Raw[] }>("/github/repositories");
    return response.data.data.map(mapGitHubRepository);
  },

  async setRepositorySelection(repositoryId: number, selected: boolean, projectId: number) {
    const response = await api.put<{ data: Raw }>(
      `/github/repositories/${repositoryId}/selection`,
      { selected, projectId }
    );
    return mapGitHubRepository(response.data.data);
  },

  async syncInstallation(installationId: number): Promise<GitHubSyncResult> {
    const response = await api.post<{ data: Raw }>(
      `/github/installations/${installationId}/sync`,
      {},
      { timeout: 120_000 }
    );
    const result = response.data.data;
    return {
      runId: Number(result.runId),
      status: result.status === "partial" ? "partial" : "completed",
      repositoryCount: Number(result.repositoryCount || 0),
      imported: Number(result.imported || 0),
      failedRepositories: Number(result.failedRepositories || 0),
      historySince: result.historySince == null ? null : String(result.historySince)
    };
  },

  async getTaskDevelopment(taskId: number): Promise<TaskDevelopment> {
    const response = await api.get<{
      data: { task: Raw; links: Raw[] };
    }>(`/github/tasks/${taskId}/development`);
    return {
      task: {
        id: Number(response.data.data.task.id),
        issueKey: String(response.data.data.task.issue_key),
        title: String(response.data.data.task.title)
      },
      links: response.data.data.links.map(mapDevelopmentLink)
    };
  },

  async getCommandSummary(): Promise<GitHubCommandSummary> {
    const response = await api.get<{ data: Raw }>("/github/summary");
    const summary = response.data.data;
    return {
      connected: Boolean(summary.connected),
      installationCount: Number(summary.installation_count || 0),
      repositoryCount: Number(summary.repository_count || 0),
      contributorCount: Number(summary.contributor_count || 0),
      openPullRequestCount: Number(summary.open_pull_request_count || 0),
      failingCheckCount: Number(summary.failing_check_count || 0),
      deployedThisWeekCount: Number(summary.deployed_this_week_count || 0),
      lastSyncedAt: summary.last_synced_at == null ? null : String(summary.last_synced_at),
      recent: ((summary.recent as Raw[] | undefined) || []).map(mapDevelopmentEvent)
    };
  },

  async getProjectDevelopment(projectId: number): Promise<ProjectDevelopment> {
    const response = await api.get<{
      data: { project: Raw; repositories: Raw[]; events: Raw[]; task_links: Raw[] };
    }>(`/github/projects/${projectId}/development`);
    const data = response.data.data;
    return {
      project: {
        id: Number(data.project.id),
        key: String(data.project.key),
        name: String(data.project.name),
        description: String(data.project.description || ""),
        myRole: data.project.my_role as ProjectDevelopment["project"]["myRole"]
      },
      repositories: data.repositories.map((repository) => ({
        id: Number(repository.id),
        fullName: String(repository.full_name),
        htmlUrl: String(repository.html_url),
        defaultBranch: String(repository.default_branch || "main"),
        isPrivate: Boolean(repository.is_private),
        isArchived: Boolean(repository.is_archived),
        syncState: syncStateFor(repository.sync_status, null),
        lastSyncedAt: repository.last_synced_at == null ? null : String(repository.last_synced_at),
        lastError: repository.last_sync_error == null ? null : String(repository.last_sync_error)
      })),
      events: data.events.map(mapDevelopmentEvent),
      taskLinks: data.task_links.map((link) => ({
        eventId: Number(link.event_id),
        linkSource: link.link_source === "manual" ? "manual" : "automatic",
        taskId: Number(link.task_id),
        issueKey: String(link.issue_key),
        taskTitle: String(link.task_title)
      }))
    };
  }
};

export type GitHubIntegrationClient = typeof githubApi;

export interface GitHubIntegrationDependencies {
  github: GitHubIntegrationClient;
  listProjects(): Promise<Project[]>;
}
