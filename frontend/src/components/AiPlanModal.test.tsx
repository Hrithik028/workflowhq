import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiTaskPlan, Project } from "../types";
import AiPlanModal from "./AiPlanModal";

const apiMocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));

vi.mock("../api/aiPlanner", () => ({ aiPlannerApi: apiMocks }));

const project: Project = {
  id: 4,
  userId: 7,
  key: "WHQ",
  name: "WorkflowHQ",
  description: "Developer delivery platform",
  taskCount: 0,
  completedCount: 0,
  myRole: "owner",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const plan: AiTaskPlan = {
  summary: "Build the provider-neutral planner safely.",
  tasks: [
    {
      tempId: "epic-ai",
      parentTempId: null,
      taskType: "epic",
      title: "AI planner",
      description: "Establish the safe boundary.",
      priority: "medium",
      dueDate: null,
      acceptanceCriteria: ["Provider output is validated."]
    },
    {
      tempId: "task-ui",
      parentTempId: "epic-ai",
      taskType: "task",
      title: "Approval preview",
      description: "Require explicit approval.",
      priority: "low",
      dueDate: null,
      acceptanceCriteria: ["No work is created during preview."]
    }
  ]
};

describe("AiPlanModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.preview.mockResolvedValue({ provider: "openai", model: "gpt-test", plan });
    apiMocks.apply.mockResolvedValue([{ id: 19, issueKey: "WHQ-19", tempId: "epic-ai" }]);
  });

  it("keeps preview read-only, clears the key, and applies only approved work", async () => {
    const browser = userEvent.setup();
    const onApplied = vi.fn();
    const onClose = vi.fn();
    render(
      <AiPlanModal
        initialProjectId={4}
        onApplied={onApplied}
        onClose={onClose}
        projects={[project]}
      />
    );

    await browser.clear(screen.getByRole("textbox", { name: /ai model/i }));
    await browser.type(screen.getByRole("textbox", { name: /ai model/i }), "gpt-test");
    await browser.type(screen.getByLabelText(/provider api key/i), "request-only-secret");
    await browser.type(
      screen.getByRole("textbox", { name: /planning goal/i }),
      "Plan a safe AI workflow for this project."
    );
    await browser.click(screen.getByRole("button", { name: /generate preview/i }));

    expect(await screen.findByText("Approval preview")).toBeInTheDocument();
    expect(apiMocks.apply).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/provider api key/i)).toHaveValue("");
    expect(apiMocks.preview).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ apiKey: "request-only-secret", provider: "openai" })
    );

    const preview = screen.getByRole("region", { name: /ai task plan preview/i });
    const checkboxes = within(preview).getAllByRole("checkbox");
    await browser.click(checkboxes[1]);
    await browser.click(screen.getByRole("button", { name: /create 1 issue/i }));

    await waitFor(() => expect(apiMocks.apply).toHaveBeenCalledTimes(1));
    const appliedPlan = apiMocks.apply.mock.calls[0][1] as AiTaskPlan;
    expect(appliedPlan.tasks.map((task) => task.tempId)).toEqual(["epic-ai"]);
    expect(JSON.stringify(apiMocks.apply.mock.calls[0])).not.toContain("request-only-secret");
    expect(onApplied).toHaveBeenCalledWith(1);
    expect(onClose).toHaveBeenCalled();
  });
});
