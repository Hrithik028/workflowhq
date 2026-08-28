import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "../types";
import TaskCard from "./TaskCard";

const task: Task = {
  id: 1,
  userId: 1,
  projectId: 1,
  projectName: "Product launch",
  projectKey: "LAUNCH",
  issueKey: "LAUNCH-1",
  taskType: "task",
  parentId: null,
  parentTitle: null,
  childCount: 0,
  completedChildCount: 0,
  title: "Run production smoke tests",
  description: "Verify the core release flow.",
  status: "todo",
  priority: "high",
  startDate: "2026-08-18",
  dueDate: "2026-08-24",
  assigneeId: null,
  assigneeName: null,
  assigneeEmail: null,
  labels: [{ id: 1, projectId: 1, name: "Urgent", color: "#ff5500", createdAt: "2026-08-19T00:00:00.000Z" }],
  rank: null,
  sprintId: null,
  sprintName: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-21T00:00:00.000Z"
};

describe("TaskCard", () => {
  it("shows useful task context and opens the edit flow", async () => {
    const onEdit = vi.fn();
    render(<TaskCard task={task} onEdit={onEdit} onMove={vi.fn()} />);

    expect(screen.getByText(task.title)).toBeInTheDocument();
    expect(screen.getByText("Product launch")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: task.title }));
    expect(onEdit).toHaveBeenCalledWith(task);
  });

  it("provides a reliable status control in addition to drag and drop", async () => {
    const onMove = vi.fn();
    render(<TaskCard task={task} onEdit={vi.fn()} onMove={onMove} />);

    await userEvent.selectOptions(screen.getByLabelText(`Move ${task.title}`), "in_progress");
    expect(onMove).toHaveBeenCalledWith(task, "in_progress");
  });
});
