import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AcceptanceCriterion, Task, WorkspaceClient } from "../types";
import { parseDescriptionAcceptanceCriteria } from "../utils/acceptanceCriteria";
import AcceptanceCriteria from "./AcceptanceCriteria";

const task = {
  id: 10,
  userId: 1,
  projectId: 2,
  description:
    "Goal: Verify synchronization.\nAcceptance criteria:\n- A matching push appears\n- A pull request is linked"
} as Task;

const criterion: AcceptanceCriterion = {
  id: 1,
  taskId: 10,
  body: "A matching push appears",
  completed: false,
  position: 0,
  createdBy: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const buildClient = (items: AcceptanceCriterion[] = []) =>
  ({
    listAcceptanceCriteria: vi.fn().mockResolvedValue(items),
    createAcceptanceCriterion: vi.fn().mockImplementation(async (_taskId, input) => ({
      ...criterion,
      id: Math.floor(Math.random() * 1000) + 10,
      body: input.body,
      position: items.length
    })),
    updateAcceptanceCriterion: vi.fn().mockImplementation(async (_taskId, _id, input) => ({
      ...criterion,
      ...input
    })),
    reorderAcceptanceCriteria: vi.fn().mockResolvedValue(items),
    deleteAcceptanceCriterion: vi.fn().mockResolvedValue(undefined)
  }) as unknown as WorkspaceClient;

describe("AcceptanceCriteria", () => {
  it("extracts bullet criteria from a task description", () => {
    expect(parseDescriptionAcceptanceCriteria(task.description)).toEqual([
      "A matching push appears",
      "A pull request is linked"
    ]);
  });

  it("loads persisted criteria and lets an editor complete one", async () => {
    const client = buildClient([criterion]);
    const user = userEvent.setup();
    render(<AcceptanceCriteria canEdit client={client} task={task} />);

    await user.click(await screen.findByRole("button", { name: /mark complete/i }));

    expect(client.updateAcceptanceCriterion).toHaveBeenCalledWith(10, 1, {
      body: criterion.body,
      completed: true
    });
  });

  it("imports criteria already embedded in the description", async () => {
    const client = buildClient();
    const user = userEvent.setup();
    render(<AcceptanceCriteria canEdit client={client} task={task} />);

    await user.click(await screen.findByRole("button", { name: /import 2 from description/i }));

    expect(client.createAcceptanceCriterion).toHaveBeenNthCalledWith(1, 10, {
      body: "A matching push appears"
    });
    expect(client.createAcceptanceCriterion).toHaveBeenNthCalledWith(2, 10, {
      body: "A pull request is linked"
    });
  });
});
