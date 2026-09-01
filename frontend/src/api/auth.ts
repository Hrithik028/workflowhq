import { api, setAccessToken } from "./client";
import type { Session, WorkspaceRole } from "../types";

const mapUser = (user: Record<string, unknown>) => ({
  id: Number(user.id),
  name: String(user.name),
  email: String(user.email),
  role: String(user.role) as WorkspaceRole,
  createdAt: String(user.created_at)
});

const mapSession = (payload: { accessToken: string; user: Record<string, unknown> }): Session => ({
  accessToken: payload.accessToken,
  user: mapUser(payload.user)
});

export const authApi = {
  async register(input: { name: string; email: string; password: string }) {
    const response = await api.post<{
      data: { accessToken: string; user: Record<string, unknown> };
    }>("/auth/register", input);
    const session = mapSession(response.data.data);
    setAccessToken(session.accessToken);
    return session;
  },

  async login(input: { email: string; password: string }) {
    const response = await api.post<{
      data: { accessToken: string; user: Record<string, unknown> };
    }>("/auth/login", input);
    const session = mapSession(response.data.data);
    setAccessToken(session.accessToken);
    return session;
  },

  async restore() {
    const response = await api.post<{
      data: { accessToken: string; user: Record<string, unknown> };
    }>("/auth/refresh");
    const session = mapSession(response.data.data);
    setAccessToken(session.accessToken);
    return session;
  },

  async logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      setAccessToken(null);
    }
  }
};
