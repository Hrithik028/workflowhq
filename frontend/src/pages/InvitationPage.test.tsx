import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import InvitationPage from "./InvitationPage";

const invitationMocks = vi.hoisted(() => ({
  accept: vi.fn(),
  decline: vi.fn(),
  inspect: vi.fn()
}));

vi.mock("../api/invitations", () => ({ invitationApi: invitationMocks }));

const token = "a".repeat(43);
const invitation = {
  id: 12,
  projectId: 4,
  projectKey: "WHQ",
  projectName: "WorkflowHQ",
  email: "developer@example.com",
  role: "editor" as const,
  status: "pending" as const,
  invitedByName: "Hrithik Jadhav",
  deliveryStatus: "sent" as const,
  expiresAt: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/invitations/${token}`]}>
      <Routes>
        <Route path="/invitations/:token" element={<InvitationPage />} />
        <Route path="/workflow" element={<p>Project workflow</p>} />
      </Routes>
    </MemoryRouter>
  );

describe("InvitationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invitationMocks.inspect.mockResolvedValue(invitation);
    invitationMocks.accept.mockResolvedValue({
      projectId: 4,
      projectKey: "WHQ",
      projectName: "WorkflowHQ",
      role: "editor",
      alreadyAccepted: false
    });
  });

  it("shows verified invitation details and joins the project", async () => {
    const browser = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("heading", { name: "WorkflowHQ" })).toBeInTheDocument();
    expect(screen.getByText("developer@example.com")).toBeInTheDocument();
    expect(screen.getByText(/exact email shown above/i)).toBeInTheDocument();

    await browser.click(screen.getByRole("button", { name: /accept and join/i }));

    expect(await screen.findByText("Project workflow")).toBeInTheDocument();
    expect(invitationMocks.accept).toHaveBeenCalledWith(token);
  });

  it("explains an email mismatch without exposing project access", async () => {
    invitationMocks.inspect.mockRejectedValue(new Error("Sign in with the email address that received this invitation."));
    renderPage();

    expect(await screen.findByText(/sign in with the email address/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /accept and join/i })).not.toBeInTheDocument();
  });
});
