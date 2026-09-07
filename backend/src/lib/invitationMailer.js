const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const createInvitationMailer = (config, fetchImpl = global.fetch) => ({
  async sendProjectInvitation({ email, inviteUrl, inviterName, projectName, role }) {
    if (config.invitationEmailProvider !== "resend") {
      return { status: "not_configured" };
    }

    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: config.invitationFromEmail,
        to: [email],
        subject: `${inviterName} invited you to ${projectName} in WorkflowHQ`,
        text: `${inviterName} invited you to join ${projectName} as ${role}. Accept the invitation: ${inviteUrl}`,
        html: `<p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(projectName)}</strong> as ${escapeHtml(role)}.</p><p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p><p>This invitation expires in ${config.invitationTtlHours} hours.</p>`
      })
    });

    if (!response.ok) {
      throw new Error(`Invitation email provider returned ${response.status}.`);
    }
    return { status: "sent" };
  }
});

module.exports = { createInvitationMailer, escapeHtml };
