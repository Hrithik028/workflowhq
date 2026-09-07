import { api } from "./client";
import { mapProjectInvitation } from "./workspace";
import type { InvitationAcceptance, ProjectInvitation } from "../types";

type Raw = Record<string, unknown>;

export const invitationApi = {
  async inspect(token: string): Promise<ProjectInvitation> {
    const response = await api.post<{ data: Raw }>("/invitations/inspect", { token });
    return mapProjectInvitation(response.data.data);
  },

  async accept(token: string): Promise<InvitationAcceptance> {
    const response = await api.post<{ data: Raw }>("/invitations/accept", { token });
    const data = response.data.data;
    return {
      projectId: Number(data.projectId),
      projectKey: String(data.projectKey),
      projectName: String(data.projectName),
      role: data.role as InvitationAcceptance["role"],
      alreadyAccepted: Boolean(data.alreadyAccepted)
    };
  },

  async decline(token: string): Promise<void> {
    await api.post("/invitations/decline", { token });
  }
};
