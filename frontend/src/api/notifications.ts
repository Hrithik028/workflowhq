import { api } from "./client";

export interface WorkspaceNotification {
  id: number;
  actorId: number | null;
  projectId: number | null;
  taskId: number | null;
  kind: "task_assigned" | "task_commented" | "project_added";
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

type RawNotification = {
  id: number;
  actor_id: number | null;
  project_id: number | null;
  task_id: number | null;
  kind: WorkspaceNotification["kind"];
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

const mapNotification = (row: RawNotification): WorkspaceNotification => ({
  id: Number(row.id),
  actorId: row.actor_id == null ? null : Number(row.actor_id),
  projectId: row.project_id == null ? null : Number(row.project_id),
  taskId: row.task_id == null ? null : Number(row.task_id),
  kind: row.kind,
  title: row.title,
  body: row.body,
  readAt: row.read_at,
  createdAt: row.created_at
});

export const notificationsChanged = () =>
  window.dispatchEvent(new Event("workflowhq:notifications-changed"));

export const notificationApi = {
  async list(unreadOnly = false, offset = 0) {
    const response = await api.get<{
      data: RawNotification[];
      meta: { unreadCount: number; hasMore: boolean };
    }>("/notifications", { params: { unreadOnly, limit: 50, offset } });
    return {
      data: response.data.data.map(mapNotification),
      unreadCount: Number(response.data.meta.unreadCount),
      hasMore: response.data.meta.hasMore
    };
  },
  async markRead(id: number) {
    await api.post(`/notifications/${id}/read`);
    notificationsChanged();
  },
  async markAllRead() {
    await api.post("/notifications/read-all");
    notificationsChanged();
  }
};
