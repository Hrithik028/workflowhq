import { api } from "./client";
import type {
  Activity,
  PaginationMetadata,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TaskQuery,
  TaskStats,
  WorkspaceClient
} from "../types";

type Raw = Record<string, unknown>;

const mapProject = (project: Raw): Project => ({
  id: Number(project.id),
  userId: Number(project.user_id),
  name: String(project.name),
  description: String(project.description || ""),
  taskCount: Number(project.task_count || 0),
  completedCount: Number(project.completed_count || 0),
  createdAt: String(project.created_at),
  updatedAt: String(project.updated_at)
});

const mapTask = (task: Raw): Task => ({
  id: Number(task.id),
  userId: Number(task.user_id),
  projectId: task.project_id == null ? null : Number(task.project_id),
  projectName: task.project_name == null ? null : String(task.project_name),
  title: String(task.title),
  description: String(task.description || ""),
  status: task.status as Task["status"],
  priority: task.priority as Task["priority"],
  dueDate: task.due_date == null ? null : String(task.due_date).slice(0, 10),
  createdAt: String(task.created_at),
  updatedAt: String(task.updated_at)
});

const mapStats = (stats: Raw): TaskStats => ({
  totalTasks: Number(stats.total_tasks || 0),
  completedTasks: Number(stats.completed_tasks || 0),
  inProgressTasks: Number(stats.in_progress_tasks || 0),
  todoTasks: Number(stats.todo_tasks || 0),
  highPriorityTasks: Number(stats.high_priority_tasks || 0),
  overdueTasks: Number(stats.overdue_tasks || 0)
});

const mapActivity = (activity: Raw): Activity => ({
  id: Number(activity.id),
  action: activity.action as Activity["action"],
  entityType: activity.entity_type as Activity["entityType"],
  entityId: activity.entity_id == null ? null : Number(activity.entity_id),
  entityTitle: String(activity.entity_title),
  details: (activity.details || {}) as Record<string, string>,
  createdAt: String(activity.created_at)
});

export const workspaceApi: WorkspaceClient = {
  async listProjects() {
    const response = await api.get<{ data: Raw[] }>("/projects");
    return response.data.data.map(mapProject);
  },
  async createProject(input: ProjectInput) {
    const response = await api.post<{ data: Raw }>("/projects", input);
    return mapProject(response.data.data);
  },
  async updateProject(id: number, input: ProjectInput) {
    const response = await api.put<{ data: Raw }>(`/projects/${id}`, input);
    return mapProject(response.data.data);
  },
  async deleteProject(id: number) {
    await api.delete(`/projects/${id}`);
  },
  async listTasks(query: TaskQuery = {}) {
    const response = await api.get<{ data: Raw[]; pagination: PaginationMetadata }>("/tasks", {
      params: query
    });
    return { data: response.data.data.map(mapTask), pagination: response.data.pagination };
  },
  async createTask(input: TaskInput) {
    const response = await api.post<{ data: Raw }>("/tasks", input);
    return mapTask(response.data.data);
  },
  async updateTask(id: number, input: TaskInput) {
    const response = await api.put<{ data: Raw }>(`/tasks/${id}`, input);
    return mapTask(response.data.data);
  },
  async deleteTask(id: number) {
    await api.delete(`/tasks/${id}`);
  },
  async getStats(projectId?: number) {
    const response = await api.get<{ data: Raw }>("/tasks/stats", { params: { projectId } });
    return mapStats(response.data.data);
  },
  async getActivity(limit = 12) {
    const response = await api.get<{ data: Raw[] }>("/activity", { params: { limit } });
    return response.data.data.map(mapActivity);
  }
};
