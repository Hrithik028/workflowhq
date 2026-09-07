import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectInvitation, WorkspaceClient } from "../types";
import ProjectModal from "./ProjectModal";

const project: Project = {
  id: 4,
  userId: 7,
  key: "WHQ",
  name: "WorkflowHQ",
  description: "Developer delivery platform",
  taskCount: 1,
  completedCount: 0,
  myRole: "owner",
  archivedAt: null,
  archivedBy: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z"
};

const invitation: ProjectInvitation = {
  id: 12,
  projectId: 4,
  projectKey: "WHQ",
  projectName: "WorkflowHQ",
  email: "developer@example.com",
  role: "editor",
  status: "pending",
  invitedByName: "Hrithik Jadhav",
  deliveryStatus: "not_configured",
  expiresAt: "2026-09-10T00:00:00.000Z",
  createdAt: "2026-09-03T00:00:00.000Z",
  updatedAt: "2026-09-03T00:00:00.000Z"
};

describe("ProjectModal invitations", () => {
  const listMembers = vi.fn();
  const listProjectInvitations = vi.fn();
  const inviteProjectMember = vi.fn();
  const revokeProjectInvitation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    listMembers.mockResolvedValue([
      {
        userId: 7,
        name: "Hrithik Jadhav",
        email: "owner@example.com",
        role: "owner",
        addedAt: "2026-08-01T00:00:00.000Z"
      }
    ]);
    listProjectInvitations
      .mockResolvedValueOnce([])
      .mockResolvedValue([invitation]);
    inviteProjectMember.mockResolvedValue({
      invitation,
      inviteUrl: `https://workflowhq.app/invitations/${"a".repeat(43)}`,
      deliveryStatus: "not_configured"
    });
    revokeProjectInvitation.mockResolvedValue(undefined);
  });

  it("creates a pending invitation and exposes a secure copy-link fallback", async () => {
    const browser = userEvent.setup();
    const client = {
      listMembers,
      listProjectInvitations,
      inviteProjectMember,
      revokeProjectInvitation
    } as unknown as WorkspaceClient;

    render(
      <ProjectModal
        client={client}
        currentUserId={7}
        isSaving={false}
        onClose={vi.fn()}
        onSave={vi.fn()}
        project={project}
      />
    );

    expect(await screen.findByText("No one is waiting to join this project.")).toBeInTheDocument();
    await browser.type(screen.getByRole("textbox", { name: /invite member by email/i }), invitation.email);
    await browser.click(screen.getByRole("button", { name: /^invite$/i }));

    await waitFor(() =>
      expect(inviteProjectMember).toHaveBeenCalledWith(4, {
        email: invitation.email,
        role: "editor"
      })
    );
    expect(await screen.findByText(invitation.email)).toBeInTheDocument();
    expect(screen.getByText(/membership starts only after the recipient/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/workflowhq\.app\/invitations/)).toBeInTheDocument();
    expect(screen.getByText(/copy and send the secure link/i)).toBeInTheDocument();
  });
});
