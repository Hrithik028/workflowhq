export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskType = "initiative" | "epic" | "story" | "task" | "bug" | "subtask";
export type AiProvider = "openai" | "anthropic" | "google";
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
  emailVerified?: boolean;
  createdAt: string;
}

export interface AccountSession {
  id: number;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
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

export interface AiPlannedTask {
  tempId: string;
  parentTempId: string | null;
  taskType: TaskType;
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  evidenceIds: string[];
  acceptanceCriteria: string[];
}

export interface AiTaskPlan {
  summary: string;
  tasks: AiPlannedTask[];
}

export type AiTaskReference = number | `new:${string}`;
export interface AiActionFields {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  taskType?: TaskType;
  parentRef?: AiTaskReference | null;
  assigneeId?: number | null;
  sprintId?: number | null;
}
interface AiActionBase {
  id: string;
  evidenceIds: string[];
}
interface AiActionTarget {
  taskRef: AiTaskReference;
  expectedVersion?: number;
}
export type AiPlannedAction =
  | (AiActionBase & {
      type: "task.create";
      tempId: AiTaskReference;
      fields: AiActionFields & { title: string };
    })
  | (AiActionBase & AiActionTarget & { type: "task.update"; fields: AiActionFields })
  | (AiActionBase & AiActionTarget & { type: "task.archive" | "task.restore" })
  | (AiActionBase & AiActionTarget & { type: "criterion.add"; body: string })
  | (AiActionBase &
      AiActionTarget & {
        type: "criterion.update";
        criterionId: number;
        fields: { body?: string; completed?: boolean };
      })
  | (AiActionBase &
      AiActionTarget & { type: "criterion.complete" | "criterion.remove"; criterionId: number })
  | (AiActionBase & AiActionTarget & { type: "criterion.reorder"; criterionIds: number[] });
export interface AiActionPlan {
  summary: string;
  actions: AiPlannedAction[];
}
export type AiProposalPlan = AiTaskPlan | AiActionPlan;
export interface AiActionExecution {
  executionId: number;
  idempotent: boolean;
  results: Array<{ actionId: string; type: string; taskId: number }>;
  references: Record<string, number>;
}

export interface AiPlanPreviewInput {
  provider: AiProvider;
  model: string;
  goal: string;
  context?: string;
  maxItems: number;
  contextOptions: {
    includeProjectTasks: boolean;
    includeGithubActivity: boolean;
    repositoryIds: number[];
  };
}

export interface AiCredentialStatus {
  provider: AiProvider;
  configured: boolean;
  maskedSuffix: string | null;
  keyVersion: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AiContextSource {
  id: string;
  type: "task" | "github";
  label: string;
  occurredAt: string | null;
}

export interface AiPlanPreview {
  provider: AiProvider;
  model: string;
  approval: {
    id: string;
    expiresAt: string;
  };
  plan: AiTaskPlan;
  context: {
    taskCount: number;
    eventCount: number;
    repositories: Array<{ id: number; fullName: string; lastSyncedAt: string | null }>;
    sources: AiContextSource[];
    duplicates: Array<{ tempId: string; issueKey: string; title: string }>;
  };
}

export type AiProposalState = "pending" | "superseded" | "discarded" | "applied";

export interface AiConversation {
  id: string;
  projectId: number;
  createdBy: number;
  title: string;
  provider: AiProvider;
  model: string;
  status: "active" | "discarded";
  runCount: number;
  proposalCount: number;
  detailExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string | null;
  expired: boolean;
  contentSha256: string | null;
  detailExpiresAt: string;
  createdAt: string;
}

export interface AiProposalDiff {
  added: string[];
  changed: Array<{ from: string; to: string }>;
  removed: string[];
}

export interface AiProposalRevision {
  id: string;
  runId: string;
  revisionNumber: number;
  state: AiProposalState;
  summary: string | null;
  plan: AiProposalPlan | null;
  diff: AiProposalDiff | null;
  evidenceSummary: {
    taskCount: number;
    githubCount: number;
    items: AiContextSource[];
  } | null;
  approvalId: string | null;
  canApprove: boolean;
  expired: boolean;
  expiresAt: string;
  detailExpiresAt: string;
  createdAt: string;
}

export interface AiConversationRun {
  id: string;
  status: "running" | "completed" | "failed";
  provider: AiProvider;
  model: string;
  errorCode: string | null;
  evidenceCounts: { taskCount?: number; githubCount?: number };
  startedAt: string;
  completedAt: string | null;
}

export interface AiConversationDetail {
  conversation: AiConversation;
  messages: AiConversationMessage[];
  runs: AiConversationRun[];
  proposals: AiProposalRevision[];
}

export interface ProjectMember {
  userId: number;
  name: string;
  email: string;
  role: ProjectRole;
  addedAt: string;
}

export type ProjectInvitationStatus = "pending" | "accepted" | "declined" | "revoked" | "expired";
export type InvitationDeliveryStatus = "pending" | "sent" | "failed" | "not_configured";

export interface ProjectInvitation {
  id: number;
  projectId: number;
  projectKey: string;
  projectName: string;
  email: string;
  role: "editor" | "viewer";
  status: ProjectInvitationStatus;
  invitedByName: string | null;
  deliveryStatus: InvitationDeliveryStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInvitationReceipt {
  invitation: ProjectInvitation;
  inviteUrl: string;
  deliveryStatus: InvitationDeliveryStatus;
}

export interface InvitationAcceptance {
  workspaceId?: number;
  projectId: number;
  projectKey: string;
  projectName: string;
  role: "editor" | "viewer";
  alreadyAccepted: boolean;
}

export type WorkflowTrigger =
  | "commit_pushed"
  | "pull_request_opened"
  | "pull_request_merged"
  | "check_run_succeeded"
  | "deployment_succeeded";

export interface ProjectWorkflowRule {
  id: number;
  trigger: WorkflowTrigger;
  enabled: boolean;
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
  updatedAt: string;
}

export interface ProjectWorkflowStatus {
  status: TaskStatus;
  label: string;
}

export interface ProjectWorkflowTransition {
  fromStatus: TaskStatus;
  toStatus: TaskStatus;
}

export interface ProjectWorkflow {
  project: { id: number; key: string; name: string };
  rules: ProjectWorkflowRule[];
  statuses: ProjectWorkflowStatus[];
  transitions: ProjectWorkflowTransition[];
}

export interface RoadmapTask {
  id: number;
  issueKey: string;
  title: string;
  taskType: TaskType;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  parentId: number | null;
}

export interface TaskDependency {
  blockerTaskId: number;
  blockedTaskId: number;
  createdAt: string;
}

export interface ProjectRoadmap {
  project: { id: number; key: string; name: string; myRole: ProjectRole };
  tasks: RoadmapTask[];
  dependencies: TaskDependency[];
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

export interface GitHubIdentityMapping {
  id: number;
  installationId: number;
  githubLogin: string;
  mappedUserId: number;
  mappedUserName: string;
  mappedUserEmail: string;
  updatedAt: string;
}

export interface GitHubActorIdentity {
  installationId: number;
  accountLogin: string;
  actorLogin: string;
  eventCount: number;
  lastSeenAt: string;
  mapping: GitHubIdentityMapping | null;
}

export interface GitHubIdentityMember {
  installationId: number;
  userId: number;
  name: string;
  email: string;
}

export interface GitHubIdentityDirectory {
  actors: GitHubActorIdentity[];
  members: GitHubIdentityMember[];
}

export interface GitHubWebhookFailure {
  id: number;
  githubDeliveryId: string;
  eventName: string;
  eventAction: string | null;
  status: "failed";
  attemptCount: number;
  errorMessage: string;
  receivedAt: string;
  processedAt: string | null;
  redeliveryRequestedAt: string | null;
  redeliveryRequestCount: number;
  redeliveryAvailable: boolean;
  redeliveryBlockedReason: "expired" | "limit_reached" | "cooldown" | null;
  accountLogin: string;
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
  actorUserId: number | null;
  actorName: string | null;
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
  actorUserId: number | null;
  actorName: string | null;
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
    | "project_restored"
    | "project_workflow_updated"
    | "task_dependency_added"
    | "task_dependency_removed"
    | "task_workflow_automated"
    | "github_identity_mapped"
    | "github_identity_unmapped"
    | "github_webhook_redelivery_requested";
  entityType: "task" | "project" | "github";
  entityId: number | null;
  entityTitle: string;
  details: Record<string, unknown>;
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

export interface AiProviderPolicy {
  provider: AiProvider;
  enabled: boolean;
  allowedModels: string[];
  defaultModel: string | null;
}

export interface AiGovernanceSettings {
  deploymentEnabled: boolean;
  enforcementEnabled: boolean;
  providerPolicies: AiProviderPolicy[];
  dailyRunLimit: number;
  maxPromptCharacters: number;
  maxOutputTokens: number;
  maxProposedActions: number;
  requestTimeoutMs: number;
  retentionDays: number;
  updatedBy: number | null;
  updatedAt: string;
  serverCeilings: Pick<
    AiGovernanceSettings,
    | "dailyRunLimit"
    | "maxPromptCharacters"
    | "maxOutputTokens"
    | "maxProposedActions"
    | "requestTimeoutMs"
    | "retentionDays"
  >;
}

export interface AiProviderHealth {
  provider: AiProvider;
  status: "unknown" | "healthy" | "degraded";
  succeeded: number;
  failed: number;
  averageLatencyMs: number;
  lastFailureCode: string | null;
  lastFailureAt: string | null;
}

export interface AiUsageSummary {
  windowHours: number;
  totalRuns: number;
  succeededRuns: number;
  failedRuns: number;
  providerHealth: AiProviderHealth[];
}

export interface AiGovernanceSnapshot {
  settings: AiGovernanceSettings;
  usage: AiUsageSummary;
}

export type AiGovernanceUpdate = Omit<
  AiGovernanceSettings,
  "deploymentEnabled" | "enforcementEnabled" | "updatedBy" | "updatedAt" | "serverCeilings"
>;

export interface WorkspaceClient {
  listProjects(query?: { archived?: boolean }): Promise<Project[]>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: number, input: ProjectInput): Promise<Project>;
  archiveProject(id: number): Promise<Project>;
  restoreProject(id: number): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getProjectRoadmap(projectId: number): Promise<ProjectRoadmap>;
  createTaskDependency(
    projectId: number,
    blockerTaskId: number,
    blockedTaskId: number
  ): Promise<void>;
  deleteTaskDependency(
    projectId: number,
    blockerTaskId: number,
    blockedTaskId: number
  ): Promise<void>;
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
  listProjectInvitations(projectId: number): Promise<ProjectInvitation[]>;
  inviteProjectMember(
    projectId: number,
    input: { email: string; role: "editor" | "viewer" }
  ): Promise<ProjectInvitationReceipt>;
  revokeProjectInvitation(projectId: number, invitationId: number): Promise<void>;
  getProjectWorkflow(projectId: number): Promise<ProjectWorkflow>;
  updateProjectWorkflow(
    projectId: number,
    rules: Array<Pick<ProjectWorkflowRule, "trigger" | "enabled" | "fromStatus" | "toStatus">>,
    configuration?: Pick<ProjectWorkflow, "statuses" | "transitions">
  ): Promise<ProjectWorkflow>;
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
