const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const createInvitationMailer = (config, fetchImpl = global.fetch) => {
  const sendEmail = async ({ from, to, subject, text, html }) => {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        html
      })
    });

    if (!response.ok) {
      throw new Error(`Email provider returned ${response.status}.`);
    }
    return { status: "sent" };
  };

  return {
    async sendProjectInvitation({ email, inviteUrl, inviterName, projectName, role }) {
      if (config.invitationEmailProvider !== "resend") {
        return { status: "not_configured" };
      }
      return sendEmail({
        from: config.invitationFromEmail,
        to: email,
        subject: `${inviterName} invited you to ${projectName} in WorkflowHQ`,
        text: `${inviterName} invited you to join ${projectName} as ${role}. Accept the invitation: ${inviteUrl}`,
        html: `<p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(projectName)}</strong> as ${escapeHtml(role)}.</p><p><a href="${escapeHtml(inviteUrl)}">Accept invitation</a></p><p>This invitation expires in ${config.invitationTtlHours} hours.</p>`
      });
    },

    async sendEmailVerification({ email, verificationUrl }) {
      if (config.accountEmailProvider !== "resend") return { status: "not_configured" };
      return sendEmail({
        from: config.accountFromEmail,
        to: email,
        subject: "Verify your WorkflowHQ email",
        text: `Verify your WorkflowHQ email: ${verificationUrl}`,
        html: `<p>Confirm that this email belongs to your WorkflowHQ account.</p><p><a href="${escapeHtml(verificationUrl)}">Verify email</a></p><p>This link expires in ${config.emailVerificationTtlMinutes} minutes.</p>`
      });
    },

    async sendPasswordReset({ email, resetUrl }) {
      if (config.accountEmailProvider !== "resend") return { status: "not_configured" };
      return sendEmail({
        from: config.accountFromEmail,
        to: email,
        subject: "Reset your WorkflowHQ password",
        text: `Reset your WorkflowHQ password: ${resetUrl}`,
        html: `<p>A password reset was requested for your WorkflowHQ account.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>This link expires in ${config.passwordResetTtlMinutes} minutes. Ignore this email if you did not request it.</p>`
      });
    }
  };
};

module.exports = { createInvitationMailer, escapeHtml };
