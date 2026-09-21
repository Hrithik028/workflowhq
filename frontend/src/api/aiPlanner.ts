import { api } from "./client";
import type { AiPlanPreview, AiPlanPreviewInput, AiTaskPlan } from "../types";

interface CreatedAiTask {
  id: number;
  issueKey: string;
  tempId: string;
  title: string;
}

export const aiPlannerApi = {
  async preview(projectId: number, input: AiPlanPreviewInput): Promise<AiPlanPreview> {
    const response = await api.post<{ data: AiPlanPreview }>(
      `/projects/${projectId}/ai-plan/preview`,
      input
    );
    return response.data.data;
  },

  async apply(projectId: number, plan: AiTaskPlan): Promise<CreatedAiTask[]> {
    const response = await api.post<{ data: { created: CreatedAiTask[] } }>(
      `/projects/${projectId}/ai-plan/apply`,
      { plan }
    );
    return response.data.data.created;
  }
};
