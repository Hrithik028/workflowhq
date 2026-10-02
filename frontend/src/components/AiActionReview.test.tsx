import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiActionReview } from "./AiActionReview";

describe("AI action review", () => {
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
              fields: { parentRef: "new:epic", description: "<script>do not execute</script>" }
            }
          ]
        }}
      />
    );
    expect(screen.getByText("Clear value")).toBeInTheDocument();
    expect(screen.getByText("new:epic")).toBeInTheDocument();
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
