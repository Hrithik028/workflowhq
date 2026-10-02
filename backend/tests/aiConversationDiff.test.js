const { proposalDiff, summarizeEvidence } = require("../src/lib/aiConversations");

const createAction = {
  id: "create",
  type: "task.create",
  tempId: "new:ticket",
  fields: { title: "Verify executor" },
  evidenceIds: ["task:1"]
};
const archiveAction = {
  id: "archive",
  type: "task.archive",
  taskRef: 1,
  expectedVersion: 2,
  evidenceIds: ["github:1"]
};

describe("Conversation proposal compatibility", () => {
  it("describes initial actions without assuming tasks exist", () => {
    expect(proposalDiff(null, { actions: [createAction, archiveAction] })).toEqual({
      added: ["Verify executor", "task.archive: 1"],
      changed: [],
      removed: []
    });
  });

  it("tracks action additions, field changes and removals", () => {
    const nextCreate = { ...createAction, fields: { title: "Verify atomic executor" } };
    const criterion = { id: "criterion", type: "criterion.complete", taskRef: 1, criterionId: 2 };
    expect(
      proposalDiff(
        { actions: [createAction, archiveAction] },
        {
          actions: [nextCreate, criterion]
        }
      )
    ).toEqual({
      added: ["criterion.complete: 1"],
      changed: [{ from: "Verify executor", to: "Verify atomic executor" }],
      removed: ["task.archive: 1"]
    });
    expect(
      proposalDiff(
        { actions: [archiveAction] },
        {
          actions: [{ ...archiveAction, expectedVersion: 3 }]
        }
      ).changed
    ).toHaveLength(1);
  });

  it("keeps legacy diffs stable and separates task and action identifiers", () => {
    const legacy = { tasks: [{ tempId: "create", title: "Original task" }] };
    expect(proposalDiff(null, legacy).added).toEqual(["Original task"]);
    expect(
      proposalDiff(legacy, { tasks: [{ tempId: "create", title: "Renamed" }] }).changed
    ).toEqual([{ from: "Original task", to: "Renamed" }]);
    expect(proposalDiff(legacy, { actions: [createAction] })).toEqual({
      added: ["Verify executor"],
      changed: [],
      removed: ["Original task"]
    });
  });

  it("summarizes only referenced evidence for actions, deduplicated", () => {
    const result = summarizeEvidence(
      { actions: [createAction, archiveAction, createAction] },
      {
        sources: [
          { id: "task:1", type: "task", label: "Ticket\n one" },
          { id: "github:1", type: "github", label: "Push", occurredAt: "2026-10-02" },
          { id: "github:2", type: "github", label: "Unreferenced" }
        ]
      }
    );
    expect(result.taskCount).toBe(1);
    expect(result.githubCount).toBe(1);
    expect(result.items.map((item) => item.label)).toEqual(["Ticket one", "Push"]);
    expect(summarizeEvidence({ tasks: [] }, { sources: [] }).items).toEqual([]);
  });
});
