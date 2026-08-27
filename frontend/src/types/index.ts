export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";
export type TaskType = "initiative" | "epic" | "story" | "task" | "bug" | "subtask";

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export interface Project {
  id: number;
  userId: number;
  key: string;
  name: string;
  description: string;
  taskCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
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
}

export interface ProjectInput {
  key: string;
  name: string;
  description: string;
}

export interface TaskStats {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  highPriorityTasks: number;
  overdueTasks: number;
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
    | "task_deleted"
    | "project_created"
    | "project_deleted";
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
  search?: string;
  sort?: "updated_at" | "created_at" | "due_date" | "title" | "priority";
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
  role: "user" | "admin";
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
  listProjects(): Promise<Project[]>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(id: number, input: ProjectInput): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  listTasks(query?: TaskQuery): Promise<{ data: Task[]; pagination: PaginationMetadata }>;
  createTask(input: TaskInput): Promise<Task>;
  updateTask(id: number, input: TaskInput): Promise<Task>;
  deleteTask(id: number): Promise<void>;
  getStats(projectId?: number): Promise<TaskStats>;
  getActivity(limit?: number): Promise<Activity[]>;
}
