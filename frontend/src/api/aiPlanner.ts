import { api } from "./client";
import type {
  AiActionExecution,
  AiActionPlan,
  AiPlanPreview,
  AiPlanPreviewInput,
  AiTaskPlan
} from "../types";

interface CreatedAiTask {
  id: number;
  issueKey: string;
  tempId: string;
  title: string;
}

export const aiPlannerApi = {
  async applyActions(
    projectId: number,
    approvalId: string,
    plan: AiActionPlan,
    idempotencyKey: string
  ): Promise<AiActionExecution> {
    const response = await api.post<{ data: AiActionExecution }>(
      `/projects/${projectId}/ai-plan/apply`,
      { approvalId, plan, idempotencyKey }
    );
    return response.data.data;
  },
  async preview(projectId: number, input: AiPlanPreviewInput): Promise<AiPlanPreview> {
    const response = await api.post<{ data: AiPlanPreview }>(
      `/projects/${projectId}/ai-plan/preview`,
      input
    );
    return response.data.data;
  },

  async apply(projectId: number, approvalId: string, plan: AiTaskPlan): Promise<CreatedAiTask[]> {
    const response = await api.post<{ data: { created: CreatedAiTask[] } }>(
      `/projects/${projectId}/ai-plan/apply`,
      { approvalId, plan }
    );
    return response.data.data.created;
  }
};
