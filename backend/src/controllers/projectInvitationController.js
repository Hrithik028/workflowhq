const { createHash, randomBytes } = require("node:crypto");

const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");

const hashInvitationToken = (token) => createHash("sha256").update(token).digest("hex");
const createInvitationToken = () => randomBytes(32).toString("base64url");
const isExpired = (row) => new Date(row.expires_at).getTime() <= Date.now();

const mapInvitation = (row) => ({
  id: Number(row.id),
  projectId: Number(row.project_id),
  projectKey: row.project_key,
  projectName: row.project_name,
  email: row.email,
  role: row.role,
  status: isExpired(row) && row.status === "pending" ? "expired" : row.status,
  invitedByName: row.invited_by_name,
  deliveryStatus: row.delivery_status,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getOwnerProject = async (db, projectId, userId) => {
  const result = await db.query(
    `SELECT p.id, p.key, p.name, p.archived_at, pm.role, u.name AS inviter_name
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
     JOIN users u ON u.id = $2
     WHERE p.id = $1`,
    [projectId, userId]
  );
  const project = result.rows[0];
  if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (project.role !== "owner") {
    throw new AppError(
      403,
      "PROJECT_OWNER_REQUIRED",
      "Only a project owner can manage invitations."
    );
  }
  if (project.archived_at) {
    throw new AppError(
      409,
      "PROJECT_ARCHIVED",
      "Restore this project before inviting members."
    );
  }
  return project;
};

const listProjectInvitations = async (req, res) => {
  const db = req.app.locals.db;
  await getOwnerProject(db, req.params.id, req.user.id);
  const result = await db.query(
    `SELECT invitation.id, invitation.project_id, project.key AS project_key,
            project.name AS project_name, invitation.email, invitation.role,
            invitation.status, invitation.delivery_status, invitation.expires_at,
            invitation.created_at, invitation.updated_at,
            inviter.name AS invited_by_name
     FROM project_invitations invitation
     JOIN projects project ON project.id = invitation.project_id
     LEFT JOIN users inviter ON inviter.id = invitation.invited_by
     WHERE invitation.project_id = $1
       AND invitation.status = 'pending'
       AND invitation.expires_at > CURRENT_TIMESTAMP
     ORDER BY invitation.created_at DESC, invitation.id DESC`,
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows.map(mapInvitation) });
};

const createProjectInvitation = async (req, res) => {
  const db = req.app.locals.db;
  const config = req.app.locals.config;
  const project = await getOwnerProject(db, req.params.id, req.user.id);
  const email = req.body.email;

  const member = await db.query(
    `SELECT 1
     FROM project_members membership
     JOIN users member_user ON member_user.id = membership.user_id
     WHERE membership.project_id = $1 AND member_user.email = $2`,
    [req.params.id, email]
  );
  if (member.rows.length > 0) {
    throw new AppError(
      409,
      "PROJECT_MEMBER_EXISTS",
      "This email already belongs to a project member."
    );
  }

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + config.invitationTtlHours * 60 * 60 * 1000);
  const client = await db.connect();
  let invitation;
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE project_invitations
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE project_id = $1 AND email = $2 AND status = 'pending'
         AND expires_at <= CURRENT_TIMESTAMP`,
      [req.params.id, email]
    );

    const inserted = await client.query(
      `INSERT INTO project_invitations
         (project_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.params.id, email, req.body.role, tokenHash, req.user.id, expiresAt]
    );
    if (inserted.rows[0]) {
      invitation = inserted.rows[0];
    } else {
      const rotated = await client.query(
        `UPDATE project_invitations
         SET role = $1, token_hash = $2, invited_by = $3, expires_at = $4,
             delivery_status = 'pending', last_delivery_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE project_id = $5 AND email = $6 AND status = 'pending'
         RETURNING *`,
        [req.body.role, tokenHash, req.user.id, expiresAt, req.params.id, email]
      );
      invitation = rotated.rows[0];
    }
    if (!invitation) {
      throw new AppError(409, "INVITATION_CONFLICT", "Unable to refresh this invitation.");
    }
    await logActivity(client, {
      userId: req.user.id,
      action: "project_invitation_created",
      entityType: "project",
      entityId: Number(req.params.id),
      entityTitle: email,
      details: { role: req.body.role }
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const inviteUrl = new URL(
    `/invitations/${encodeURIComponent(token)}`,
    config.appBaseUrl
  ).toString();
  let deliveryStatus = "failed";
  try {
    const delivery = await req.app.locals.invitationMailer.sendProjectInvitation({
      email,
      inviteUrl,
      inviterName: project.inviter_name,
      projectName: project.name,
      role: req.body.role
    });
    deliveryStatus = delivery.status;
  } catch {
    deliveryStatus = "failed";
  }
  await db.query(
    `UPDATE project_invitations
     SET delivery_status = $1, last_delivery_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [deliveryStatus, invitation.id]
  );

  return res.status(201).json({
    data: {
      invitation: mapInvitation({
        ...invitation,
        project_key: project.key,
        project_name: project.name,
        invited_by_name: project.inviter_name,
        delivery_status: deliveryStatus
      }),
      inviteUrl,
      deliveryStatus
    }
  });
};

const revokeProjectInvitation = async (req, res) => {
  const db = req.app.locals.db;
  await getOwnerProject(db, req.params.id, req.user.id);
  const result = await db.query(
    `UPDATE project_invitations
     SET status = 'revoked', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND project_id = $2 AND status = 'pending'
     RETURNING email, role`,
    [req.params.invitationId, req.params.id]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "INVITATION_NOT_FOUND", "Pending invitation not found.");
  }
  await logActivity(db, {
    userId: req.user.id,
    action: "project_invitation_revoked",
    entityType: "project",
    entityId: Number(req.params.id),
    entityTitle: result.rows[0].email,
    details: { role: result.rows[0].role }
  });
  return res.status(204).send();
};

const loadRecipientInvitation = async (db, token, userId, { lock = false } = {}) => {
  const [invitationResult, userResult] = await Promise.all([
    db.query(
      `SELECT invitation.*, project.key AS project_key, project.name AS project_name,
              project.archived_at AS project_archived_at,
              inviter.name AS invited_by_name
       FROM project_invitations invitation
       JOIN projects project ON project.id = invitation.project_id
       LEFT JOIN users inviter ON inviter.id = invitation.invited_by
       WHERE invitation.token_hash = $1
       ${lock ? "FOR UPDATE" : ""}`,
      [hashInvitationToken(token)]
    ),
    db.query("SELECT email FROM users WHERE id = $1", [userId])
  ]);
  const invitation = invitationResult.rows[0];
  if (!invitation) {
    throw new AppError(404, "INVITATION_INVALID", "This invitation link is invalid.");
  }
  if (invitation.email !== userResult.rows[0]?.email) {
    throw new AppError(
      403,
      "INVITATION_EMAIL_MISMATCH",
      "Sign in with the email address that received this invitation."
    );
  }
  if (invitation.project_archived_at) {
    throw new AppError(410, "INVITATION_PROJECT_ARCHIVED", "This project is archived.");
  }
  if (invitation.status === "pending" && isExpired(invitation)) {
    throw new AppError(410, "INVITATION_EXPIRED", "This invitation has expired.");
  }
  if (["revoked", "declined", "expired"].includes(invitation.status)) {
    throw new AppError(410, "INVITATION_INACTIVE", "This invitation is no longer active.");
  }
  return invitation;
};

const inspectInvitation = async (req, res) => {
  const invitation = await loadRecipientInvitation(
    req.app.locals.db,
    req.body.token,
    req.user.id
  );
  return res.status(200).json({ data: mapInvitation(invitation) });
};

const acceptInvitation = async (req, res) => {
  const db = req.app.locals.db;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const invitation = await loadRecipientInvitation(client, req.body.token, req.user.id, {
      lock: true
    });
    if (invitation.status === "accepted") {
      await client.query("COMMIT");
      return res.status(200).json({
        data: {
          projectId: Number(invitation.project_id),
          projectKey: invitation.project_key,
          projectName: invitation.project_name,
          role: invitation.role,
          alreadyAccepted: true
        }
      });
    }
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role, invited_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [invitation.project_id, req.user.id, invitation.role, invitation.invited_by]
    );
    await client.query(
      `UPDATE project_invitations
       SET status = 'accepted', accepted_by = $1, responded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'`,
      [req.user.id, invitation.id]
    );
    await logActivity(client, {
      userId: req.user.id,
      action: "project_invitation_accepted",
      entityType: "project",
      entityId: Number(invitation.project_id),
      entityTitle: invitation.project_name,
      details: { role: invitation.role }
    });
    await client.query("COMMIT");
    return res.status(200).json({
      data: {
        projectId: Number(invitation.project_id),
        projectKey: invitation.project_key,
        projectName: invitation.project_name,
        role: invitation.role,
        alreadyAccepted: false
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const declineInvitation = async (req, res) => {
  const db = req.app.locals.db;
  const invitation = await loadRecipientInvitation(db, req.body.token, req.user.id);
  if (invitation.status === "accepted") {
    throw new AppError(409, "INVITATION_ALREADY_ACCEPTED", "This invitation was already accepted.");
  }
  await db.query(
    `UPDATE project_invitations
     SET status = 'declined', responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'pending'`,
    [invitation.id]
  );
  return res.status(204).send();
};

module.exports = {
  acceptInvitation,
  createInvitationToken,
  createProjectInvitation,
  declineInvitation,
  hashInvitationToken,
  inspectInvitation,
  listProjectInvitations,
  revokeProjectInvitation
};
