export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskType = "initiative" | "epic" | "story" | "task" | "bug" | "subtask";
export type ProjectRole = "owner" | "editor" | "viewer";
export type WorkspaceRole = "user" | "admin" | "platform_owner";
export type GitHubSyncState =
  "never" | "queued" | "syncing" | "healthy" | "partial" | "failed" | "suspended";
export type DevelopmentLinkType =
  "branch" | "commit" | "pull_request" | "issue" | "deployment" | "release" | "check_run";

export interface User {
  id: number;
  name: string;
  email: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface Project {
  id: number;
  userId: number;
  key: string;
  name: string;
  description: string;
  taskCount: number;
  totalTaskCount?: number;
  completedCount: number;
  myRole: ProjectRole;
  archivedAt?: string | null;
  archivedBy?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  userId: number;
  name: string;
  email: string;
  role: ProjectRole;
  addedAt: string;
}

export interface GitHubInstallation {
  id: number;
  githubInstallationId: string;
  accountLogin: string;
  accountType: "User" | "Organization";
  repositorySelection: "all" | "selected";
  repositoryCount: number;
  selectedRepositoryCount: number;
  permissions: Record<string, string>;
  suspendedAt: string | null;
  syncState: GitHubSyncState;
  lastSyncedAt: string | null;
  lastError: string | null;
  manageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIntegrationStatus {
  connected: boolean;
  installations: GitHubInstallation[];
}

export interface GitHubSyncResult {
  runId: number;
  status: "completed" | "partial";
  repositoryCount: number;
  imported: number;
  failedRepositories: number;
  historySince: string | null;
}

export interface GitHubRepository {
  id: number;
  installationId: number;
  githubRepositoryId: string;
  ownerLogin: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  isArchived: boolean;
  selected: boolean;
  projectId: number | null;
  projectKey: string | null;
  projectName: string | null;
  syncState: GitHubSyncState;
  lastSyncedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopmentLink {
  id: number;
  type: DevelopmentLinkType;
  externalId: string;
  githubNumber: number | null;
  title: string;
  url: string;
  state: string | null;
  actorLogin: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
  repositoryId: number;
  repositoryFullName: string;
  repositoryUrl: string;
  linkSource: "automatic" | "manual";
}

export interface TaskDevelopment {
  task: { id: number; issueKey: string; title: string };
  links: DevelopmentLink[];
}

export interface GitHubDevelopmentEvent {
  id: number;
  type: DevelopmentLinkType;
  externalId: string;
  githubNumber: number | null;
  title: string;
  url: string;
  state: string | null;
  actorLogin: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
  repositoryFullName: string;
  projectId: number | null;
  projectKey: string | null;
  projectName: string | null;
}

export interface GitHubCommandSummary {
  connected: boolean;
  installationCount: number;
  repositoryCount: number;
  contributorCount: number;
  openPullRequestCount: number;
  failingCheckCount: number;
  deployedThisWeekCount: number;
  lastSyncedAt: string | null;
  recent: GitHubDevelopmentEvent[];
}

export interface ProjectDevelopment {
  project: {
    id: number;
    key: string;
    name: string;
    description: string;
    myRole: ProjectRole;
  };
  repositories: Array<{
    id: number;
    fullName: string;
    htmlUrl: string;
    defaultBranch: string;
    isPrivate: boolean;
    isArchived: boolean;
    syncState: GitHubSyncState;
    lastSyncedAt: string | null;
    lastError: string | null;
  }>;
  events: GitHubDevelopmentEvent[];
  taskLinks: Array<{
    eventId: number;
    linkSource: "automatic" | "manual";
    taskId: number;
    issueKey: string;
    taskTitle: string;
  }>;
}

export interface Label {
  id: number;
  projectId: number;
  name: string;
  color: string;
  createdAt: string;
}

export interface LabelInput {
  name: string;
  color: string;
}

export interface Comment {
  id: number;
  taskId: number;
  userId: number;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommentInput {
  body: string;
}

export interface AcceptanceCriterion {
  id: number;
  taskId: number;
  body: string;
  completed: boolean;
  position: number;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceCriterionInput {
  body: string;
}

export type SprintStatus = "planned" | "active" | "completed";

export interface Sprint {
  id: number;
  projectId: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: SprintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SprintInput {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface Task {
  id: number;
  userId: number;
  projectId: number | null;
  projectName: string | null;
  projectKey: string | null;
  issueKey: string;
  taskType: TaskType;
  parentId: number | null;
  parentTitle: string | null;
  childCount: number;
  completedChildCount: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  labels: Label[];
  rank: number | null;
  sprintId: number | null;
  sprintName: string | null;
  archivedAt?: string | null;
  archivedBy?: number | null;
  projectArchivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  projectId: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  taskType: TaskType;
  parentId: number | null;
  assigneeId: number | null;
  sprintId: number | null;
}

export interface ProjectInput {
  key: string;
  name: string;
  description: string;
}

export interface DailyCompletion {
  date: string;
  count: number;
}

export interface TaskStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  highPriorityTasks: number;
  mediumPriorityTasks: number;
  lowPriorityTasks: number;
  overdueTasks: number;
  dailyCompletions: DailyCompletion[];
}

export interface Activity {
  id: number;
  action:
    | "task_created"
    | "task_updated"
    | "task_completed"
    | "task_status_changed"
    | "task_priority_changed"
    | "task_parent_changed"
    | "task_label_added"
    | "task_comment_added"
    | "task_deleted"
    | "task_archived"
    | "task_restored"
    | "project_created"
    | "project_deleted"
    | "project_archived"
    | "project_restored";
  entityType: "task" | "project";
  entityId: number | null;
  entityTitle: string;
  details: Record<string, string>;
  createdAt: string;
}

export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface TaskQuery {
  page?: number;
  limit?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: number;
  archived?: boolean;
  search?: string;
  sort?: "updated_at" | "created_at" | "due_date" | "title" | "priority" | "rank";
  order?: "asc" | "desc";
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export interface Session {
  accessToken: string;
  user: User;
}

export type PermissionKey =
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  | "projects.members"
  | "tasks.create"
  | "tasks.edit"
  | "tasks.delete"
  | "github.manage";

export type PermissionSet = Record<PermissionKey, boolean>;

export interface WorkspaceRules {
  allow_task_deletion: boolean;
  allow_project_deletion: boolean;
  require_due_date_for_high_priority: boolean;
  max_open_tasks_per_user: number;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: WorkspaceRole;
  projectCount: number;
  taskCount: number;
  createdAt: string;
  permissions: PermissionSet;
}

export interface AdminAuditEntry {
  id: number;
  action: string;
  details: Record<string, unknown>;
  adminName: string;
  targetName: string | null;
  createdAt: string;
}

export interface AdminOverview {
  users: AdminUser[];
  rules: WorkspaceRules;
  audit: AdminAuditEntry[];
  permissionKeys: PermissionKey[];
}

export interface WorkspaceClient {
  listProjects(query?: { archived?: boolean }): Promise<Project[]>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: number, input: ProjectInput): Promise<Project>;
  archiveProject(id: number): Promise<Project>;
  restoreProject(id: number): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  listTasks(query?: TaskQuery): Promise<{ data: Task[]; pagination: PaginationMetadata }>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: number, input: TaskInput): Promise<Task>;
  archiveTask(id: number): Promise<Task>;
  restoreTask(id: number): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  getStats(projectId?: number): Promise<TaskStats>;
  getActivity(limit?: number): Promise<Activity[]>;
  listMembers(projectId: number): Promise<ProjectMember[]>;
  addMember(projectId: number, input: { email: string; role: "editor" | "viewer" }): Promise<void>;
  updateMemberRole(projectId: number, userId: number, role: ProjectRole): Promise<void>;
  removeMember(projectId: number, userId: number): Promise<void>;
  listLabels(projectId: number): Promise<Label[]>;
  createLabel(projectId: number, input: LabelInput): Promise<Label>;
  updateLabel(projectId: number, labelId: number, input: LabelInput): Promise<Label>;
  deleteLabel(projectId: number, labelId: number): Promise<void>;
  attachLabel(taskId: number, labelId: number): Promise<void>;
  detachLabel(taskId: number, labelId: number): Promise<void>;
  listComments(taskId: number): Promise<Comment[]>;
  createComment(taskId: number, input: CommentInput): Promise<Comment>;
  updateComment(taskId: number, commentId: number, input: CommentInput): Promise<Comment>;
  deleteComment(taskId: number, commentId: number): Promise<void>;
  listAcceptanceCriteria(taskId: number): Promise<AcceptanceCriterion[]>;
  createAcceptanceCriterion(
    taskId: number,
    input: AcceptanceCriterionInput
  ): Promise<AcceptanceCriterion>;
  updateAcceptanceCriterion(
    taskId: number,
    criterionId: number,
    input: AcceptanceCriterionInput & { completed: boolean }
  ): Promise<AcceptanceCriterion>;
  reorderAcceptanceCriteria(taskId: number, criterionIds: number[]): Promise<AcceptanceCriterion[]>;
  deleteAcceptanceCriterion(taskId: number, criterionId: number): Promise<void>;
  updateTaskRank(
    taskId: number,
    input: { previousTaskId: number | null; nextTaskId: number | null }
  ): Promise<Task>;
  listSprints(projectId: number): Promise<Sprint[]>;
  createSprint(projectId: number, input: SprintInput): Promise<Sprint>;
  updateSprint(
    projectId: number,
    sprintId: number,
    input: SprintInput & { status: SprintStatus }
  ): Promise<Sprint>;
  deleteSprint(projectId: number, sprintId: number): Promise<void>;
}
