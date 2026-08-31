import { describe, expect, it } from "vitest";

import type { Task } from "../types";
import { persistedProgressFor } from "./taskProgress";

const task = {
  id: 1,
  childCount: 0,
  completedChildCount: 0,
  status: "todo"
} as Task;

describe("persistedProgressFor", () => {
  it("uses completed child work when hierarchy data exists", () => {
    expect(persistedProgressFor({ ...task, childCount: 4, completedChildCount: 3 })).toBe(75);
  });

  it("does not invent partial progress for unfinished leaf work", () => {
    expect(persistedProgressFor({ ...task, status: "in_progress" })).toBe(0);
  });

  it("marks completed leaf work as complete", () => {
    expect(persistedProgressFor({ ...task, status: "completed" })).toBe(100);
  });
});
