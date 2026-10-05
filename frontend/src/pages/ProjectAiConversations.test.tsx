import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProjectAiConversations from "./ProjectAiConversations";

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  applyActions: vi.fn(),
  create: vi.fn(),
  discard: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  listProjects: vi.fn(),
  run: vi.fn()
}));

vi.mock("../api/aiConversations", () => ({
  aiConversationsApi: {
    create: mocks.create,
    discard: mocks.discard,
    get: mocks.get,
    list: mocks.list,
    run: mocks.run
  }
}));
vi.mock("../api/aiPlanner", () => ({
  aiPlannerApi: { apply: mocks.apply, applyActions: mocks.applyActions }
}));
vi.mock("../api/workspace", () => ({ workspaceApi: { listProjects: mocks.listProjects } }));

const conversation = {
  id: "41f99848-727f-4a4c-bd13-cc63e995f474",
  projectId: 4,
  createdBy: 1,
  title: "Release plan",
  provider: "openai" as const,
  model: "gpt-test",
  status: "active" as const,
  runCount: 2,
  proposalCount: 2,
  detailExpiresAt: "2099-10-01T00:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z"
};

const plan = {
  summary: "Secure persistent planning.",
  tasks: [
    {
      tempId: "retention",
      parentTempId: null,
      taskType: "task" as const,
      title: "Scrub expired detail",
      description: "Retain minimal audit metadata.",
      priority: "high" as const,
      dueDate: null,
      evidenceIds: ["task:7"],
      acceptanceCriteria: ["Detail expires after 15 days."]
    }
  ]
};

const detail = {
  conversation,
  messages: [],
  runs: [
    {
      id: "4fbe9dbc-c81c-4cd8-a214-a1d7013ef666",
      status: "completed" as const,
      provider: "openai" as const,
      model: "gpt-test",
      errorCode: null,
      evidenceCounts: { taskCount: 1, githubCount: 0 },
      startedAt: "2026-09-02T00:00:00.000Z",
      completedAt: "2026-09-02T00:00:01.000Z"
    }
  ],
  proposals: [
    {
      id: "760956d3-9600-42bf-883f-e184c98856ca",
      runId: "4fbe9dbc-c81c-4cd8-a214-a1d7013ef666",
      revisionNumber: 2,
      state: "pending" as const,
      summary: plan.summary,
      plan,
      diff: {
        added: ["Scrub expired detail"],
        changed: [{ from: "Keep everything", to: "Scrub expired detail" }],
        removed: []
      },
      evidenceSummary: {
        taskCount: 1,
        githubCount: 0,
        items: [
          {
            id: "task:7",
            type: "task" as const,
            label: "WHQ-7 Retention policy",
            occurredAt: null
          }
        ]
      },
      approvalId: "7b4fda70-d33e-42f3-af2d-ea5ebc62a806",
      canApprove: true,
      expired: false,
      expiresAt: "2099-10-01T00:00:00.000Z",
      detailExpiresAt: "2099-10-15T00:00:00.000Z",
      createdAt: "2026-09-02T00:00:00.000Z"
    }
  ]
};

describe("Project AI conversation workspace", () => {
  it("clears an obsolete generation success notice when approval fails", async () => {
    const user = userEvent.setup();
    mocks.run.mockResolvedValue(detail.proposals[0]);
    mocks.apply.mockRejectedValueOnce(new Error("Ticket changed; generate a new preview."));
    render(
      <MemoryRouter initialEntries={["/projects/4/ai-conversations"]}>
        <Routes>
          <Route path="/projects/:id/ai-conversations" element={<ProjectAiConversations />} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByRole("textbox", { name: "Planning goal" });
    await user.type(
      screen.getByRole("textbox", { name: "Planning goal" }),
      "Create a reviewable plan"
    );
    await user.click(screen.getByRole("button", { name: "Generate revision" }));
    await screen.findByText("A new proposal revision is ready for review.");
    await user.click(screen.getByRole("button", { name: /approve and create/i }));
    await screen.findByText("Ticket changed; generate a new preview.");
    expect(
      screen.queryByText("A new proposal revision is ready for review.")
    ).not.toBeInTheDocument();
  });
  it("uses creation-only by default and sends action mode only when explicitly selected", async () => {
    const user = userEvent.setup();
    mocks.run.mockResolvedValue(detail.proposals[1]);
    render(
      <MemoryRouter initialEntries={["/projects/4/ai-conversations"]}>
        <Routes>
          <Route path="/projects/:id/ai-conversations" element={<ProjectAiConversations />} />
        </Routes>
      </MemoryRouter>
    );
    const mode = await screen.findByRole("combobox", { name: "Proposal mode" });
    expect(mode).toHaveValue("tasks");
    await user.selectOptions(mode, "actions");
    await user.type(
      screen.getByRole("textbox", { name: "Planning goal" }),
      "Start the existing project ticket"
    );
    await user.click(screen.getByRole("button", { name: "Generate revision" }));
    await screen.findByText("A new proposal revision is ready for review.");
    expect(mocks.run).toHaveBeenCalledWith(
      4,
      conversation.id,
      expect.objectContaining({ outputMode: "actions" })
    );
    expect(mocks.applyActions).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("requires action confirmation and reuses the same execution key after a failed request", async () => {
    const user = userEvent.setup();
    const actionPlan = {
      summary: "Archive reviewed work",
      actions: [
        {
          id: "archive",
          type: "task.archive" as const,
          taskRef: 7,
          expectedVersion: 2,
          evidenceIds: []
        }
      ]
    };
    const pending = detail.proposals.find((proposal) => proposal.canApprove)!;
    mocks.get.mockResolvedValue({ ...detail, proposals: [{ ...pending, plan: actionPlan }] });
    mocks.applyActions
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({
        executionId: 1,
        idempotent: true,
        results: [{ actionId: "archive" }]
      });
    render(
      <MemoryRouter initialEntries={["/projects/4/ai-conversations"]}>
        <Routes>
          <Route path="/projects/:id/ai-conversations" element={<ProjectAiConversations />} />
        </Routes>
      </MemoryRouter>
    );
    const approve = await screen.findByRole("button", { name: /approve and apply actions/i });
    expect(approve).toBeDisabled();
    expect(screen.getByText(/reviewed version 2/)).toBeInTheDocument();
    expect(mocks.applyActions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: /reviewed all actions/i }));
    await user.click(approve);
    await screen.findByText("Connection interrupted");
    await user.click(screen.getByRole("button", { name: /approve and apply actions/i }));
    expect(await screen.findByText(/1 approved actions applied/)).toBeInTheDocument();
    expect(mocks.applyActions).toHaveBeenNthCalledWith(
      1,
      4,
      pending.approvalId,
      actionPlan,
      `proposal:${pending.approvalId}`
    );
    expect(mocks.applyActions).toHaveBeenNthCalledWith(
      2,
      4,
      pending.approvalId,
      actionPlan,
      `proposal:${pending.approvalId}`
    );
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listProjects.mockResolvedValue([
      {
        id: 4,
        userId: 1,
        key: "WHQ",
        name: "WorkflowHQ",
        description: "Planning platform",
        taskCount: 0,
        completedCount: 0,
        myRole: "owner",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z"
      }
    ]);
    mocks.list.mockResolvedValue([conversation]);
    mocks.get.mockResolvedValue(detail);
    mocks.apply.mockResolvedValue([{ id: 9, issueKey: "WHQ-9", tempId: "retention" }]);
  });

  it("shows revision diffs and evidence, then approves only the reviewable proposal", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/projects/4/ai-conversations"]}>
        <Routes>
          <Route path="/projects/:id/ai-conversations" element={<ProjectAiConversations />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Release plan" })).toBeInTheDocument();
    expect(screen.getByText(/added “scrub expired detail”/i)).toBeInTheDocument();
    expect(screen.getByText(/changed “keep everything”/i)).toBeInTheDocument();
    expect(screen.getByText("WHQ-7 Retention policy")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /approve and create/i }));

    expect(mocks.apply).toHaveBeenCalledWith(4, "7b4fda70-d33e-42f3-af2d-ea5ebc62a806", plan);
    expect(await screen.findByText("1 task created.")).toBeInTheDocument();
  });
});
