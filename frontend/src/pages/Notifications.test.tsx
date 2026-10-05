import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { User } from "../types";
import Notifications from "./Notifications";

const notificationMocks = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn()
}));

vi.mock("../api/notifications", () => ({ notificationApi: notificationMocks }));

const user: User = {
  id: 1,
  name: "Notification Tester",
  email: "tester@example.com",
  role: "user",
  createdAt: "2026-10-01T00:00:00.000Z"
};

const renderPage = (isDemo = false) =>
  render(
    <MemoryRouter initialEntries={["/notifications"]}>
      <Routes>
        <Route element={<Outlet context={{ isDemo, user }} />}>
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/tasks/:id" element={<p>Ticket opened</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );

describe("Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notificationMocks.list.mockResolvedValue({
      data: [
        {
          id: 7,
          actorId: 2,
          projectId: 3,
          taskId: 9,
          kind: "task_assigned",
          title: "Assigned to WHQ-9",
          body: "Check the release",
          readAt: null,
          createdAt: "2026-10-01T00:00:00.000Z"
        }
      ],
      unreadCount: 1
    });
    notificationMocks.markRead.mockResolvedValue(undefined);
    notificationMocks.markAllRead.mockResolvedValue(undefined);
  });

  it("shows unread alerts and opens the related ticket after marking one read", async () => {
    renderPage();
    expect(await screen.findByText("Assigned to WHQ-9")).toBeInTheDocument();
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /assigned to WHQ-9/i }));
    expect(notificationMocks.markRead).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Ticket opened")).toBeInTheDocument();
  });

  it("can mark all notifications read", async () => {
    renderPage();
    await screen.findByText("Assigned to WHQ-9");
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));
    expect(notificationMocks.markAllRead).toHaveBeenCalledOnce();
  });

  it("does not request private notifications in the demo", () => {
    renderPage(true);
    expect(screen.getByText(/Sign in to a workspace/i)).toBeInTheDocument();
    expect(notificationMocks.list).not.toHaveBeenCalled();
  });
});
