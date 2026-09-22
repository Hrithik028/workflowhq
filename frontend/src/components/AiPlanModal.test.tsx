import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiTaskPlan, Project } from "../types";
import AiPlanModal from "./AiPlanModal";

const apiMocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
const githubMocks = vi.hoisted(() => ({ getProjectDevelopment: vi.fn() }));

vi.mock("../api/aiPlanner", () => ({ aiPlannerApi: apiMocks }));
vi.mock("../api/github", () => ({ githubApi: githubMocks }));

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
      evidenceIds: ["task:7"],
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
      evidenceIds: ["github:42"],
      acceptanceCriteria: ["No work is created during preview."]
    }
  ]
};

describe("AiPlanModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    githubMocks.getProjectDevelopment.mockResolvedValue({
      project: { id: 4, key: "WHQ", name: "WorkflowHQ", description: "", myRole: "owner" },
      repositories: [
        {
          id: 9,
          fullName: "Hrithik028/workflowhq",
          htmlUrl: "https://github.com/Hrithik028/workflowhq",
          defaultBranch: "master",
          isPrivate: false,
          isArchived: false,
          syncState: "healthy",
          lastSyncedAt: "2026-09-20T00:00:00.000Z",
          lastError: null
        }
      ],
      events: [],
      taskLinks: []
    });
    apiMocks.preview.mockResolvedValue({
      provider: "openai",
      model: "gpt-test",
      plan,
      context: {
        taskCount: 1,
        eventCount: 1,
        repositories: [{ id: 9, fullName: "Hrithik028/workflowhq", lastSyncedAt: null }],
        sources: [
          { id: "task:7", type: "task", label: "WHQ-7 Existing task", occurredAt: null },
          {
            id: "github:42",
            type: "github",
            label: "Hrithik028/workflowhq · pull request · Add preview",
            occurredAt: "2026-09-20T00:00:00.000Z"
          }
        ],
        duplicates: []
      }
    });
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
    await browser.click(await screen.findByRole("checkbox", { name: /hrithik028\/workflowhq/i }));
    await browser.click(screen.getByRole("button", { name: /generate preview/i }));

    expect(await screen.findByText("Approval preview")).toBeInTheDocument();
    expect(apiMocks.apply).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/provider api key/i)).toHaveValue("");
    expect(apiMocks.preview).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        apiKey: "request-only-secret",
        provider: "openai",
        contextOptions: {
          includeProjectTasks: true,
          includeGithubActivity: true,
          repositoryIds: [9]
        }
      })
    );
    expect(screen.getByText(/ticket: whq-7 existing task/i)).toBeInTheDocument();
    expect(screen.getByText(/github: hrithik028\/workflowhq/i)).toBeInTheDocument();

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
