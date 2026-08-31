import { api } from "./client";
import type {
  AdminAuditEntry,
  AdminOverview,
  AdminUser,
  PermissionKey,
  PermissionSet,
  WorkspaceRules
} from "../types";

type Raw = Record<string, unknown>;

const mapUser = (user: Raw): AdminUser => ({
  id: Number(user.id),
  name: String(user.name),
  email: String(user.email),
  role: user.role as AdminUser["role"],
  projectCount: Number(user.project_count || 0),
  taskCount: Number(user.task_count || 0),
  createdAt: String(user.created_at),
  permissions: user.permissions as PermissionSet
});

const mapAudit = (entry: Raw): AdminAuditEntry => ({
  id: Number(entry.id),
  action: String(entry.action),
  details: (entry.details || {}) as Record<string, unknown>,
  adminName: String(entry.admin_name || "Administrator"),
  targetName: entry.target_name == null ? null : String(entry.target_name),
  createdAt: String(entry.created_at)
});

export const adminApi = {
  async getOverview(): Promise<AdminOverview> {
    const response = await api.get<{ data: Raw }>("/admin/overview");
    const data = response.data.data;
    return {
      users: (data.users as Raw[]).map(mapUser),
      rules: data.rules as unknown as WorkspaceRules,
      audit: (data.audit as Raw[]).map(mapAudit),
      permissionKeys: data.permissionKeys as PermissionKey[]
    };
  },

  async updateUserAccess(id: number, role: AdminUser["role"], permissions: PermissionSet) {
    const response = await api.put<{ data: Raw }>(`/admin/users/${id}/access`, {
      role,
      permissions
    });
    return mapUser(response.data.data);
  },

  async updateRules(rules: WorkspaceRules) {
    const response = await api.put<{ data: WorkspaceRules }>("/admin/rules", rules);
    return response.data.data;
  },

  async transferOwnership(targetUserId: number, password: string) {
    const response = await api.post<{
      data: {
        previousOwner: { id: number; name: string; email: string; role: "admin" };
        owner: { id: number; name: string; email: string; role: "platform_owner" };
        sessionsInvalidated: boolean;
      };
    }>("/admin/platform-owner/transfer", { targetUserId, password });
    return response.data.data;
  }
};
