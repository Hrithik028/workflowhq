import { api } from "./client";
import type { AiCredentialStatus, AiProvider } from "../types";

export const aiCredentialsApi = {
  async list(): Promise<AiCredentialStatus[]> {
    const response = await api.get<{ data: AiCredentialStatus[] }>("/ai/credentials");
    return response.data.data;
  },

  async validate(provider: AiProvider, credential: string): Promise<void> {
    await api.post("/ai/credentials/validate", { provider, credential });
  },

  async save(provider: AiProvider, credential: string): Promise<AiCredentialStatus> {
    const response = await api.post<{ data: AiCredentialStatus }>("/ai/credentials", {
      provider,
      credential
    });
    return response.data.data;
  },

  async replace(provider: AiProvider, credential: string): Promise<AiCredentialStatus> {
    const response = await api.put<{ data: AiCredentialStatus }>(`/ai/credentials/${provider}`, {
      credential
    });
    return response.data.data;
  },

  async remove(provider: AiProvider): Promise<void> {
    await api.delete(`/ai/credentials/${provider}`);
  }
};
