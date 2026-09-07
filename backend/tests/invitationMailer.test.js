const { createInvitationMailer, escapeHtml } = require("../src/lib/invitationMailer");

describe("invitation mailer", () => {
  it("does not contact a provider while delivery is disabled", async () => {
    const fetchImpl = globalThis.vi.fn();
    const mailer = createInvitationMailer(
      { invitationEmailProvider: "disabled" },
      fetchImpl
    );

    await expect(
      mailer.sendProjectInvitation({
        email: "member@example.com",
        inviteUrl: "https://app.example.com/invitations/token",
        inviterName: "Owner",
        projectName: "Project",
        role: "viewer"
      })
    ).resolves.toEqual({ status: "not_configured" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("escapes user-controlled content in the email HTML", async () => {
    const fetchImpl = globalThis.vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const mailer = createInvitationMailer(
      {
        invitationEmailProvider: "resend",
        invitationFromEmail: "WorkflowHQ <invites@example.com>",
        invitationTtlHours: 168,
        resendApiKey: "secret"
      },
      fetchImpl
    );

    await mailer.sendProjectInvitation({
      email: "member@example.com",
      inviteUrl: "https://app.example.com/invitations/token",
      inviterName: "<Owner>",
      projectName: "Project & team",
      role: "editor"
    });

    const request = fetchImpl.mock.calls[0][1];
    const body = JSON.parse(request.body);
    expect(body.html).toContain("&lt;Owner&gt;");
    expect(body.html).toContain("Project &amp; team");
    expect(body.html).not.toContain("<Owner>");
    expect(escapeHtml('"test"')).toBe("&quot;test&quot;");
  });
});
