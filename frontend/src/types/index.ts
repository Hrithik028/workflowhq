export type TaskStatus = "todo" | "in_progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

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
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
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
  dueDate: string | null;
}

export interface ProjectInput {
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
