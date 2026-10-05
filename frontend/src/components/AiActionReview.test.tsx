import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiActionReview } from "./AiActionReview";

describe("AI action review", () => {
  it.each(["applied", "discarded", "superseded"] as const)(
    "does not show pending approval instructions for a %s revision",
    (state) => {
      render(
        <AiActionReview
          state={state}
          plan={{
            summary: "Review",
            actions: [
              {
                id: "update",
                type: "task.update",
                taskRef: 7,
                expectedVersion: 2,
                evidenceIds: [],
                fields: { title: "Reviewed" }
              }
            ]
          }}
        />
      );
      expect(screen.queryByText(/Nothing applied yet/)).not.toBeInTheDocument();
      expect(screen.queryByText(/then confirm below/)).not.toBeInTheDocument();
      expect(
        screen.getByText(
          state === "applied" ? "1 approved changes · Applied" : "1 proposed changes · Not applied"
        )
      ).toBeInTheDocument();
    }
  );
  it("does not invite approval of an expired pending revision", () => {
    render(<AiActionReview expired plan={{ summary: "Expired", actions: [] }} />);
    expect(screen.queryByText(/Nothing applied yet|then confirm below/)).not.toBeInTheDocument();
    expect(screen.getByText(/Not applied/)).toBeInTheDocument();
  });
  it("groups consecutive criteria under a readable ticket card without changing the plan", () => {
    const plan = {
      summary: "Create test ticket",
      actions: [
        {
          id: "create",
          type: "task.create" as const,
          tempId: "new:test" as const,
          evidenceIds: [],
          fields: {
            title: "Test ticket",
            status: "todo" as const,
            priority: "low" as const,
            dueDate: null
          }
        },
        {
          id: "criterion-1",
          type: "criterion.add" as const,
          taskRef: "new:test" as const,
          evidenceIds: [],
          body: "The ticket belongs to this project"
        },
        {
          id: "criterion-2",
          type: "criterion.add" as const,
          taskRef: "new:test" as const,
          evidenceIds: [],
          body: "Criteria are saved separately"
        }
      ]
    };
    const original = JSON.stringify(plan);
    render(<AiActionReview plan={plan} />);
    expect(screen.getByText("Create ticket")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Acceptance criteria · 2")).toBeInTheDocument();
    expect(screen.getByText("Criteria are saved separately")).toBeInTheDocument();
    expect(screen.queryByText("Clear value")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".ai-action-card")).toHaveLength(1);
    expect(JSON.stringify(plan)).toBe(original);
  });

  it("does not group criteria across an intervening action", () => {
    render(
      <AiActionReview
        plan={{
          summary: "Keep order",
          actions: [
            {
              id: "create",
              type: "task.create",
              tempId: "new:test",
              evidenceIds: [],
              fields: { title: "Test" }
            },
            {
              id: "update",
              type: "task.update",
              taskRef: 7,
              expectedVersion: 2,
              evidenceIds: [],
              fields: { title: "Existing update" }
            },
            {
              id: "add",
              type: "criterion.add",
              taskRef: "new:test",
              evidenceIds: [],
              body: "Later criterion"
            }
          ]
        }}
      />
    );
    expect(document.querySelectorAll(".ai-action-card")).toHaveLength(3);
    expect(screen.getByText("Add acceptance criterion")).toBeInTheDocument();
  });

  it("shows exact field values, cleared values and temporary hierarchy references", () => {
    render(
      <AiActionReview
        plan={{
          summary: "Create and update work",
          actions: [
            {
              id: "create",
              type: "task.create",
              tempId: "new:epic",
              evidenceIds: [],
              fields: { title: "Safe epic", parentRef: null }
            },
            {
              id: "update",
              type: "task.update",
              taskRef: 7,
              expectedVersion: 2,
              evidenceIds: ["task:7"],
              fields: {
                parentRef: "new:epic",
                dueDate: null,
                description: "<script>do not execute</script>"
              }
            }
          ]
        }}
      />
    );
    expect(screen.getByText("Clear value")).toBeInTheDocument();
    expect(screen.getAllByText("Safe epic")).toHaveLength(2);
    expect(screen.getByText("<script>do not execute</script>")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "Review current ticket" })).toHaveAttribute(
      "href",
      "/tasks/7"
    );
  });

  it("warns about criterion removal and displays the selected criterion ID", () => {
    render(
      <AiActionReview
        plan={{
          summary: "Remove criterion",
          actions: [
            {
              id: "remove",
              type: "criterion.remove",
              taskRef: 7,
              expectedVersion: 2,
              criterionId: 8,
              evidenceIds: []
            }
          ]
        }}
      />
    );
    expect(screen.getByText("Criterion #8")).toBeInTheDocument();
    expect(screen.getByText(/check the target carefully/i)).toBeInTheDocument();
  });
});
