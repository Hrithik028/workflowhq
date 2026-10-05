import { api } from "./client";

export interface JiraImportIssue {
  sourceKey: string;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  taskType: string;
  dueDate: string | null;
  warnings: string[];
  alreadyImported: boolean;
  importedToThisProject: boolean;
}

export interface JiraImportPreview {
  previewId: string;
  expiresAt: string;
  issues: JiraImportIssue[];
}

export const jiraImportApi = {
  async preview(
    projectId: number,
    input: { siteUrl: string; jiraProjectKey: string; csv: string }
  ) {
    const response = await api.post<{ data: JiraImportPreview }>(
      `/projects/${projectId}/jira-import/preview`,
      input
    );
    return response.data.data;
  },
  async apply(projectId: number, previewId: string, issueKeys: string[], csv: string) {
    const response = await api.post<{
      data: {
        imported: Array<{ sourceKey: string; issueKey: string; taskId: number }>;
        skipped: string[];
      };
    }>(
      `/projects/${projectId}/jira-import/apply`,
      { previewId, issueKeys, csv },
      { timeout: 60_000 }
    );
    return response.data.data;
  }
};
