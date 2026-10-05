import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { jiraImportApi } from "../api/jiraImport";
import JiraImport from "./JiraImport";

vi.mock("../api/jiraImport", () => ({
  jiraImportApi: { preview: vi.fn(), apply: vi.fn() }
}));

const renderPage = (isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/projects/4/jira-import"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user: { id: 1, name: "Owner" } }} />}>
          <Route path="/projects/:id/jira-import" element={<JiraImport />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("JiraImport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("previews selected issues before applying the same CSV", async () => {
    vi.mocked(jiraImportApi.preview).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-10-06T00:30:00Z",
      issues: [
        {
          sourceKey: "TEAM-1",
          title: "Fix login",
          description: "",
          status: "todo",
          priority: "high",
          taskType: "bug",
          dueDate: null,
          warnings: [],
          alreadyImported: false,
          importedToThisProject: false
        }
      ]
    });
    vi.mocked(jiraImportApi.apply).mockResolvedValue({
      imported: [{ sourceKey: "TEAM-1", issueKey: "WHQ-42", taskId: 42 }],
      skipped: []
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(
      screen.getByRole("textbox", { name: /jira site url/i }),
      "https://team.atlassian.net"
    );
    await user.type(screen.getByRole("textbox", { name: /jira project key/i }), "TEAM");
    const file = new File(["Issue key,Summary\nTEAM-1,Fix login"], "jira.csv", {
      type: "text/csv"
    });
    Object.defineProperty(file, "text", {
      value: async () => "Issue key,Summary\nTEAM-1,Fix login"
    });
    await user.upload(screen.getByLabelText(/csv export/i), file);
    expect((screen.getByLabelText(/csv export/i) as HTMLInputElement).files).toHaveLength(1);
    fireEvent.submit(screen.getByRole("button", { name: /preview import/i }).closest("form")!);
    expect(await screen.findByText(/TEAM-1 · Fix login/)).toBeInTheDocument();
    expect(jiraImportApi.apply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /import 1 selected issue/i }));
    expect(await screen.findByRole("link", { name: "WHQ-42" })).toHaveAttribute(
      "href",
      "/tasks/42"
    );
    expect(jiraImportApi.apply).toHaveBeenCalledWith(
      4,
      "preview-1",
      ["TEAM-1"],
      "Issue key,Summary\nTEAM-1,Fix login"
    );
  });

  it("blocks imports in the demo", () => {
    renderPage(true);
    expect(screen.getByText(/sign in to import into a real project/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview import/i })).not.toBeInTheDocument();
  });
});
