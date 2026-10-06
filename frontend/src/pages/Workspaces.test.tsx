import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Workspaces from "./Workspaces";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  members: vi.fn(),
  settings: vi.fn(),
  saveAiPolicy: vi.fn(),
  saveRules: vi.fn()
}));
vi.mock("../api/tenants", () => ({ tenantsApi: mocks }));
const aiPolicy = {
  allowedProviders: ["openai"],
  dailyRunLimit: 3,
  maxPromptCharacters: 2000,
  maxOutputTokens: 900,
  maxProposedActions: 2
};
const rules = {
  allow_task_deletion: false,
  allow_project_deletion: false,
  require_due_date_for_high_priority: true,
  max_open_tasks_per_user: 4
};
const renderPage = () =>
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ isDemo: false }} />}>
          <Route path="/" element={<Workspaces />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("Workspace management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({
      data: [{ id: 4, name: "Team", my_role: "owner", personal_owner_id: null }],
      meta: { enabled: true, activeWorkspaceId: 4 }
    });
    mocks.members.mockResolvedValue([
      { id: 1, name: "Owner", email: "owner@example.com", role: "owner" }
    ]);
    mocks.settings.mockResolvedValue({ rules, aiPolicy, audit: [] });
    mocks.saveAiPolicy.mockResolvedValue(aiPolicy);
    mocks.saveRules.mockResolvedValue(rules);
  });
  it("saves workspace AI limits without an enforcement-off control", async () => {
    renderPage();
    await screen.findByRole("button", { name: "Save AI restrictions" });
    expect(screen.getByText(/Governance is always enforced/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /enforcement/i })).not.toBeInTheDocument();
    await userEvent.clear(screen.getByRole("spinbutton", { name: "AI runs per day" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "AI runs per day" }), "2");
    await userEvent.click(screen.getByRole("button", { name: "Save AI restrictions" }));
    expect(mocks.saveAiPolicy).toHaveBeenCalledWith(4, { ...aiPolicy, dailyRunLimit: 2 });
    expect(await screen.findByText("Workspace AI restrictions saved.")).toBeInTheDocument();
  });
  it("does not request or expose settings to a workspace member", async () => {
    mocks.list.mockResolvedValue({
      data: [{ id: 4, name: "Team", my_role: "member" }],
      meta: { enabled: true, activeWorkspaceId: 4 }
    });
    renderPage();
    await screen.findByText(/You are a member here/);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save AI restrictions" })).not.toBeInTheDocument();
  });
});
