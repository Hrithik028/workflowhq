import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectWorkflow } from "../types";
import ProjectWorkflowSettings from "./ProjectWorkflowSettings";

const workspaceMocks = vi.hoisted(() => ({
  getProjectWorkflow: vi.fn(),
  updateProjectWorkflow: vi.fn()
}));

vi.mock("../api/workspace", () => ({ workspaceApi: workspaceMocks }));

const workflow: ProjectWorkflow = {
  project: { id: 4, key: "WHQ", name: "WorkflowHQ" },
  rules: [
    { id: 1, trigger: "commit_pushed", enabled: true, fromStatus: "todo", toStatus: "in_progress", updatedAt: "2026-09-03T00:00:00Z" },
    { id: 2, trigger: "pull_request_opened", enabled: true, fromStatus: "todo", toStatus: "in_progress", updatedAt: "2026-09-03T00:00:00Z" },
    { id: 3, trigger: "pull_request_merged", enabled: true, fromStatus: "in_progress", toStatus: "completed", updatedAt: "2026-09-03T00:00:00Z" },
    { id: 4, trigger: "check_run_succeeded", enabled: false, fromStatus: "in_progress", toStatus: "completed", updatedAt: "2026-09-03T00:00:00Z" },
    { id: 5, trigger: "deployment_succeeded", enabled: false, fromStatus: "in_progress", toStatus: "completed", updatedAt: "2026-09-03T00:00:00Z" }
  ]
};

const Layout = () => <Outlet context={{ isDemo: false }} />;

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/projects/4/workflow-settings"]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/projects/:id/workflow-settings" element={<ProjectWorkflowSettings />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("ProjectWorkflowSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMocks.getProjectWorkflow.mockResolvedValue(workflow);
    workspaceMocks.updateProjectWorkflow.mockImplementation(async (_projectId, rules) => ({
      ...workflow,
      rules: workflow.rules.map((rule) => ({
        ...rule,
        ...rules.find((candidate: { trigger: string }) => candidate.trigger === rule.trigger)
      }))
    }));
  });

  it("loads the owner rules and saves an enabled GitHub signal", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "Workflow rules." })).toBeInTheDocument();
    expect(screen.getByText(/historical imports never change ticket status/i)).toBeInTheDocument();

    const checkRule = (await screen.findByText("Checks succeeded")).closest("article");
    expect(checkRule).not.toBeNull();
    const toggle = within(checkRule as HTMLElement).getByRole("checkbox");
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /save rules/i }));

    expect(workspaceMocks.updateProjectWorkflow).toHaveBeenCalledWith(
      4,
      expect.arrayContaining([
        expect.objectContaining({ trigger: "check_run_succeeded", enabled: true })
      ])
    );
    expect(
      await screen.findByText(/apply to future verified GitHub webhooks/i)
    ).toBeInTheDocument();
  });
});
