import { api } from "./client";
import type {
  Activity,
  PaginationMetadata,
  Project,
  ProjectInput,
  ProjectMember,
  ProjectRole,
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
  key: String(project.key),
  name: String(project.name),
  description: String(project.description || ""),
  taskCount: Number(project.task_count || 0),
  completedCount: Number(project.completed_count || 0),
  myRole: project.my_role as Project["myRole"],
  createdAt: String(project.created_at),
  updatedAt: String(project.updated_at)
});

const mapMember = (member: Raw): ProjectMember => ({
  userId: Number(member.userId),
  name: String(member.name),
  email: String(member.email),
  role: member.role as ProjectRole,
  // The add-member response omits addedAt (it isn't returned by that endpoint) - default
  // to "now" since the membership was in fact just created.
  addedAt: member.addedAt == null ? new Date().toISOString() : String(member.addedAt)
});

const mapTask = (task: Raw): Task => ({
  id: Number(task.id),
  userId: Number(task.user_id),
  projectId: task.project_id == null ? null : Number(task.project_id),
  projectName: task.project_name == null ? null : String(task.project_name),
  projectKey: task.project_key == null ? null : String(task.project_key),
  issueKey: String(task.issue_key),
  taskType: task.task_type as Task["taskType"],
  parentId: task.parent_task_id == null ? null : Number(task.parent_task_id),
  parentTitle: task.parent_title == null ? null : String(task.parent_title),
  childCount: Number(task.child_count || 0),
  completedChildCount: Number(task.completed_child_count || 0),
  title: String(task.title),
  description: String(task.description || ""),
  status: task.status as Task["status"],
  priority: task.priority as Task["priority"],
  startDate: task.start_date == null ? null : String(task.start_date).slice(0, 10),
  dueDate: task.due_date == null ? null : String(task.due_date).slice(0, 10),
  assigneeId: task.assignee_id == null ? null : Number(task.assignee_id),
  assigneeName: task.assignee_name == null ? null : String(task.assignee_name),
  assigneeEmail: task.assignee_email == null ? null : String(task.assignee_email),
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
  },
  async listMembers(projectId: number) {
    const response = await api.get<{ data: Raw[] }>(`/projects/${projectId}/members`);
    return response.data.data.map(mapMember);
  },
  async addMember(projectId: number, input: { email: string; role: "editor" | "viewer" }) {
    // The response is deliberately generic (never reveals whether the email
    // matched an account) - reload the member list to see what happened.
    await api.post(`/projects/${projectId}/members`, input);
  },
  async updateMemberRole(projectId: number, userId: number, role: ProjectRole) {
    await api.patch(`/projects/${projectId}/members/${userId}`, { role });
  },
  async removeMember(projectId: number, userId: number) {
    await api.delete(`/projects/${projectId}/members/${userId}`);
  }
};
