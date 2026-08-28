import { api } from "./client";
import type {
  Activity,
  Comment,
  CommentInput,
  Label,
  LabelInput,
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

const mapLabel = (label: Raw): Label => ({
  id: Number(label.id),
  projectId: Number(label.project_id),
  name: String(label.name),
  color: String(label.color),
  createdAt: String(label.created_at)
});

const mapComment = (comment: Raw): Comment => ({
  id: Number(comment.id),
  taskId: Number(comment.task_id),
  userId: Number(comment.user_id),
  authorName: String(comment.author_name),
  authorEmail: String(comment.author_email),
  body: String(comment.body),
  createdAt: String(comment.created_at),
  updatedAt: String(comment.updated_at)
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
  labels: ((task.labels as Raw[] | undefined) || []).map(mapLabel),
  rank: task.rank == null ? null : Number(task.rank),
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
  },
  async listLabels(projectId: number) {
    const response = await api.get<{ data: Raw[] }>(`/projects/${projectId}/labels`);
    return response.data.data.map(mapLabel);
  },
  async createLabel(projectId: number, input: LabelInput) {
    const response = await api.post<{ data: Raw }>(`/projects/${projectId}/labels`, input);
    return mapLabel(response.data.data);
  },
  async updateLabel(projectId: number, labelId: number, input: LabelInput) {
    const response = await api.put<{ data: Raw }>(
      `/projects/${projectId}/labels/${labelId}`,
      input
    );
    return mapLabel(response.data.data);
  },
  async deleteLabel(projectId: number, labelId: number) {
    await api.delete(`/projects/${projectId}/labels/${labelId}`);
  },
  async attachLabel(taskId: number, labelId: number) {
    await api.post(`/tasks/${taskId}/labels`, { labelId });
  },
  async detachLabel(taskId: number, labelId: number) {
    await api.delete(`/tasks/${taskId}/labels/${labelId}`);
  },
  async listComments(taskId: number) {
    const response = await api.get<{ data: Raw[] }>(`/tasks/${taskId}/comments`);
    return response.data.data.map(mapComment);
  },
  async createComment(taskId: number, input: CommentInput) {
    const response = await api.post<{ data: Raw }>(`/tasks/${taskId}/comments`, input);
    return mapComment(response.data.data);
  },
  async updateComment(taskId: number, commentId: number, input: CommentInput) {
    const response = await api.put<{ data: Raw }>(
      `/tasks/${taskId}/comments/${commentId}`,
      input
    );
    return mapComment(response.data.data);
  },
  async deleteComment(taskId: number, commentId: number) {
    await api.delete(`/tasks/${taskId}/comments/${commentId}`);
  },
  async updateTaskRank(
    taskId: number,
    input: { previousTaskId: number | null; nextTaskId: number | null }
  ) {
    const response = await api.patch<{ data: Raw }>(`/tasks/${taskId}/rank`, input);
    return mapTask(response.data.data);
  }
};
