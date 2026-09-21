import { api, setAccessToken } from "./client";
import type { AccountSession, MfaStatus, Session, WorkspaceRole } from "../types";

const mapUser = (user: Record<string, unknown>) => ({
  id: Number(user.id),
  name: String(user.name),
  email: String(user.email),
  role: String(user.role) as WorkspaceRole,
  emailVerified: Boolean(user.email_verified_at),
  createdAt: String(user.created_at)
});

const mapSession = (payload: { accessToken: string; user: Record<string, unknown> }): Session => ({
  accessToken: payload.accessToken,
  user: mapUser(payload.user)
});

export type LoginResult =
  { type: "session"; session: Session } | { type: "mfa"; challengeToken: string };

export type RegistrationResult =
  { type: "session"; session: Session } | { type: "verification"; delivery: "sent" | "failed" };

type RawSessionPayload = { accessToken: string; user: Record<string, unknown> };
type RawLoginPayload = RawSessionPayload | { mfaRequired: true; challengeToken: string };
type RawRegistrationPayload =
  RawSessionPayload | { verificationRequired: true; delivery: "sent" | "failed" };

export const authApi = {
  async register(input: { name: string; email: string; password: string }) {
    const response = await api.post<{ data: RawRegistrationPayload }>("/auth/register", input);
    if ("verificationRequired" in response.data.data) {
      return {
        type: "verification",
        delivery: response.data.data.delivery
      } satisfies RegistrationResult;
    }
    const session = mapSession(response.data.data);
    setAccessToken(session.accessToken);
    return { type: "session", session } satisfies RegistrationResult;
  },

  async login(input: { email: string; password: string }) {
    const response = await api.post<{ data: RawLoginPayload }>("/auth/login", input);
    if ("mfaRequired" in response.data.data) {
      return {
        type: "mfa",
        challengeToken: String(response.data.data.challengeToken)
      } satisfies LoginResult;
    }
    const session = mapSession(response.data.data);
    setAccessToken(session.accessToken);
    return { type: "session", session } satisfies LoginResult;
  },

  async verifyMfa(challengeToken: string, code: string) {
    const response = await api.post<{
      data: { accessToken: string; user: Record<string, unknown> };
    }>("/auth/mfa/verify", { challengeToken, code });
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
  },

  async requestEmailVerification(email: string) {
    await api.post("/auth/email-verification/request", { email });
  },

  async verifyEmail(token: string) {
    await api.post("/auth/email-verification/verify", { token });
  },

  async requestPasswordReset(email: string) {
    await api.post("/auth/password-reset/request", { email });
  },

  async resetPassword(token: string, password: string, code?: string) {
    await api.post("/auth/password-reset/confirm", { token, password, ...(code ? { code } : {}) });
  },

  async getSessions() {
    const response = await api.get<{ data: AccountSession[] }>("/auth/sessions");
    return response.data.data;
  },

  async revokeSession(id: number) {
    await api.delete(`/auth/sessions/${id}`);
  },

  forgetLocalSession() {
    setAccessToken(null);
  },

  async revokeAllSessions() {
    await api.delete("/auth/sessions");
    setAccessToken(null);
  },

  async getMfaStatus() {
    const response = await api.get<{ data: MfaStatus }>("/auth/mfa");
    return response.data.data;
  },

  async startMfaSetup(password: string) {
    const response = await api.post<{ data: { secret: string; otpAuthUri: string } }>(
      "/auth/mfa/setup",
      { password }
    );
    return response.data.data;
  },

  async enableMfa(code: string) {
    const response = await api.post<{ data: { recoveryCodes: string[] } }>("/auth/mfa/enable", {
      code
    });
    return response.data.data;
  },

  async disableMfa(password: string, code: string) {
    await api.post("/auth/mfa/disable", { password, code });
  }
};
