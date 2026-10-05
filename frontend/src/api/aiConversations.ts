import { api, AI_GENERATION_TIMEOUT_MS } from "./client";
import type {
  AiConversation,
  AiConversationDetail,
  AiPlanPreviewInput,
  AiProposalRevision,
  AiProvider
} from "../types";

export interface CreateAiConversationInput {
  title: string;
  provider: AiProvider;
  model: string;
}

export type RunAiConversationInput = Omit<AiPlanPreviewInput, "provider" | "model"> & {
  outputMode?: "tasks" | "actions";
};

export const aiConversationsApi = {
  async list(projectId: number): Promise<AiConversation[]> {
    const response = await api.get<{ data: AiConversation[] }>(
      `/projects/${projectId}/ai-conversations`
    );
    return response.data.data;
  },

  async create(projectId: number, input: CreateAiConversationInput): Promise<AiConversation> {
    const response = await api.post<{ data: AiConversation }>(
      `/projects/${projectId}/ai-conversations`,
      input
    );
    return response.data.data;
  },

  async get(projectId: number, conversationId: string): Promise<AiConversationDetail> {
    const response = await api.get<{ data: AiConversationDetail }>(
      `/projects/${projectId}/ai-conversations/${conversationId}`
    );
    return response.data.data;
  },

  async run(
    projectId: number,
    conversationId: string,
    input: RunAiConversationInput
  ): Promise<AiProposalRevision> {
    const response = await api.post<{ data: { proposal: AiProposalRevision } }>(
      `/projects/${projectId}/ai-conversations/${conversationId}/runs`,
      input,
      { timeout: AI_GENERATION_TIMEOUT_MS }
    );
    return response.data.data.proposal;
  },

  async discard(projectId: number, conversationId: string, proposalId: string): Promise<void> {
    await api.post(
      `/projects/${projectId}/ai-conversations/${conversationId}/proposals/${proposalId}/discard`
    );
  }
};
