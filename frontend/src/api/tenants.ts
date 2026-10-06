import { api, setAccessToken } from "./client";

export interface TenantWorkspace {
  id: number;
  name: string;
  my_role: "owner" | "admin" | "member";
  my_project_count: number;
  personal_owner_id?: number | null;
}
export interface TenantMember {
  id: number;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
}
export interface TenantRules {
  allow_task_deletion: boolean;
  allow_project_deletion: boolean;
  require_due_date_for_high_priority: boolean;
  max_open_tasks_per_user: number;
}
export interface TenantAiPolicy {
  allowedProviders: Array<"openai" | "anthropic" | "google">;
  dailyRunLimit: number;
  maxPromptCharacters: number;
  maxOutputTokens: number;
  maxProposedActions: number;
}
export const tenantsApi = {
  async list() {
    return (
      await api.get<{
        data: TenantWorkspace[];
        meta: { enabled: boolean; activeWorkspaceId: number | null };
      }>("/workspaces")
    ).data;
  },
  async create(name: string) {
    return (await api.post<{ data: TenantWorkspace }>("/workspaces", { name })).data.data;
  },
  async switchTo(id: number) {
    const response = await api.post<{ data: { accessToken: string } }>(`/workspaces/${id}/switch`);
    setAccessToken(response.data.data.accessToken);
  },
  async members(id: number) {
    return (await api.get<{ data: TenantMember[] }>(`/workspaces/${id}/members`)).data.data;
  },
  async saveMember(id: number, email: string, role: "admin" | "member") {
    await api.put(`/workspaces/${id}/members`, { email, role });
  },
  async removeMember(id: number, userId: number) {
    await api.delete(`/workspaces/${id}/members/${userId}`);
  },
  async transferOwnership(id: number, targetUserId: number, password: string) {
    await api.post(`/workspaces/${id}/ownership`, { targetUserId, password });
  },
  async settings(id: number) {
    return (
      await api.get<{
        data: {
          rules: TenantRules;
          aiPolicy: TenantAiPolicy;
          audit: Array<{ action: string; created_at: string }>;
        };
      }>(`/workspaces/${id}/settings`)
    ).data.data;
  },
  async saveRules(id: number, rules: TenantRules) {
    return (await api.put<{ data: TenantRules }>(`/workspaces/${id}/settings`, rules)).data.data;
  },
  async saveAiPolicy(id: number, policy: TenantAiPolicy) {
    return (await api.put<{ data: TenantAiPolicy }>(`/workspaces/${id}/ai-policy`, policy)).data
      .data;
  }
};
