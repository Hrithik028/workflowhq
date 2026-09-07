import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "../types";
import WorkspaceEngineering from "./WorkspaceEngineering";

const api = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listProjects: vi.fn(),
  listSprints: vi.fn(),
  updateTask: vi.fn()
}));
vi.mock("../api/workspace", () => ({ workspaceApi: api }));
vi.mock("../components/TaskModal", () => ({
  default: (props: {
    initialStatus: string;
    initialProjectId: number;
    initialSprintId: number;
  }) => <div role="dialog">{JSON.stringify(props)}</div>
}));

const makeTask = (id: number, status: Task["status"] = "todo"): Task => ({
  id,
  userId: 1,
  projectId: 4,
  projectName: "WorkflowHQ",
  projectKey: "WHQ",
  issueKey: `WHQ-${id}`,
  taskType: id === 1 ? "epic" : "task",
  parentId: id === 1 ? null : 1,
  parentTitle: id === 1 ? null : "Issue 1",
  childCount: id === 1 ? 3 : 0,
  completedChildCount: id === 1 ? 1 : 0,
  title: `Issue ${id}`,
  description: "Keep my description",
  status,
  priority: "high",
  startDate: "2026-09-01",
  dueDate: "2026-09-30",
  assigneeId: 2,
  assigneeName: "Alex",
  assigneeEmail: "alex@example.test",
  labels: [],
  rank: 10,
  sprintId: 8,
  sprintName: "Sprint 8",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-02"
});
let tasks: Task[];
function LocationControls() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output aria-label="Current URL">{location.search}</output>
      <button onClick={() => navigate(-1)}>Browser back</button>
    </>
  );
}
function renderBoard(url = "/workflow?project=4") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <LocationControls />
      <Routes>
        <Route element={<Outlet context={{ isDemo: false, user: { id: 1 } }} />}>
          <Route path="/workflow" element={<WorkspaceEngineering />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  tasks = [makeTask(1, "in_progress"), makeTask(2), makeTask(3), makeTask(4, "completed")];
  api.listTasks.mockImplementation(async () => ({
    data: tasks,
    pagination: { page: 1, limit: 100, pages: 1, total: tasks.length }
  }));
  api.listProjects.mockResolvedValue([{ id: 4, key: "WHQ", name: "WorkflowHQ", myRole: "owner" }]);
  api.listSprints.mockResolvedValue([{ id: 8, name: "Sprint 8", status: "active" }]);
  api.updateTask.mockImplementation(async (id, input) => {
    tasks = tasks.map((task) => (task.id === id ? { ...task, ...input } : task));
    return tasks.find((task) => task.id === id);
  });
});

describe("Engineering board lanes", () => {
  it("renders every task in a lane instead of silently dropping siblings", async () => {
    renderBoard();
    expect(await screen.findByRole("article", { name: "WHQ-2" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "WHQ-3" })).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
  it("supports linked lane filters, All lanes, and browser Back while preserving project and sprint", async () => {
    renderBoard("/workflow?project=4&sprint=8&stage=backlog");
    await screen.findByRole("article", { name: "WHQ-2" });
    expect(screen.queryByRole("article", { name: "WHQ-4" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Released lane" }));
    expect(screen.getByRole("article", { name: "WHQ-4" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current URL")).toHaveTextContent(
      "project=4&sprint=8&stage=released"
    );
    fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
    expect(screen.getByRole("button", { name: "Backlog lane" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "All lanes" }));
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(screen.getByLabelText("Current URL")).not.toHaveTextContent("stage=");
  });
  it("loads subsequent API pages so lane counts include all matching tickets", async () => {
    api.listTasks.mockImplementation(async ({ page = 1 }) => ({
      data: page === 1 ? tasks.slice(0, 2) : tasks.slice(2),
      pagination: { pages: 2 }
    }));
    renderBoard();
    await screen.findByRole("article", { name: "WHQ-4" });
    expect(screen.getAllByRole("article")).toHaveLength(4);
    expect(api.listTasks).toHaveBeenCalledWith(expect.objectContaining({ page: 2, projectId: 4 }));
  });
  it("saves a keyboard-accessible move and preserves task fields", async () => {
    renderBoard();
    const select = await screen.findByRole("combobox", { name: "Move WHQ-2 to" });
    fireEvent.change(select, { target: { value: "released" } });
    await waitFor(() =>
      expect(api.updateTask).toHaveBeenCalledWith(2, {
        title: "Issue 2",
        description: "Keep my description",
        projectId: 4,
        parentId: 1,
        taskType: "task",
        status: "completed",
        priority: "high",
        startDate: "2026-09-01",
        dueDate: "2026-09-30",
        assigneeId: 2,
        sprintId: 8
      })
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Move WHQ-2 to" })).toHaveValue("released")
    );
    expect(screen.getByText("WHQ-2 moved to Released.")).toBeInTheDocument();
  });
  it("accepts internal card drops but ignores external drags and same-lane moves", async () => {
    renderBoard();
    const card = await screen.findByRole("article", { name: "WHQ-2" });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    const target = screen.getByRole("button", { name: "In progress lane" });
    fireEvent.drop(target, { dataTransfer });
    expect(api.updateTask).not.toHaveBeenCalled();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.drop(screen.getByRole("button", { name: "Backlog lane" }), { dataTransfer });
    expect(api.updateTask).not.toHaveBeenCalled();
    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    await waitFor(() => expect(api.updateTask).toHaveBeenCalledTimes(1));
    expect(api.updateTask).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ status: "in_progress" })
    );
  });
  it("keeps the ticket in place on a server rejection and prevents overlapping saves", async () => {
    let reject!: (reason: Error) => void;
    api.updateTask.mockReturnValue(
      new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
      })
    );
    renderBoard();
    const select = await screen.findByRole("combobox", { name: "Move WHQ-2 to" });
    fireEvent.change(select, { target: { value: "released" } });
    expect(select).toBeDisabled();
    expect(select).toHaveValue("backlog");
    fireEvent.change(screen.getByRole("combobox", { name: "Move WHQ-3 to" }), {
      target: { value: "released" }
    });
    expect(api.updateTask).toHaveBeenCalledTimes(1);
    reject(new Error("You do not have permission to edit this task."));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission");
    expect(select).toHaveValue("backlog");
    expect(select).toBeEnabled();
  });
  it("prevents project viewers from moving cards", async () => {
    api.listProjects.mockResolvedValue([{ id: 4, key: "WHQ", myRole: "viewer" }]);
    renderBoard();
    const card = await screen.findByRole("article", { name: "WHQ-2" });
    expect(card).toHaveAttribute("draggable", "false");
    expect(within(card).getByRole("combobox")).toBeDisabled();
    fireEvent.dragStart(card, { dataTransfer: { setData: vi.fn() } });
    fireEvent.drop(screen.getByRole("button", { name: "Released lane" }));
    expect(api.updateTask).not.toHaveBeenCalled();
  });
  it("uses the selected lane, project, and sprint when adding an issue", async () => {
    renderBoard("/workflow?project=4&sprint=8&stage=released");
    await screen.findByRole("article", { name: "WHQ-4" });
    fireEvent.click(screen.getByRole("button", { name: "New issue" }));
    const modal = screen.getByRole("dialog");
    expect(modal).toHaveTextContent('"initialStatus":"completed"');
    expect(modal).toHaveTextContent('"initialProjectId":4');
    expect(modal).toHaveTextContent('"initialSprintId":8');
  });
});
