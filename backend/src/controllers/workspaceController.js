const { AppError } = require("../lib/errors");
const { randomUUID } = require("node:crypto");
const { createAccessToken } = require("./authController");
const { readWorkspaceRules } = require("../lib/accessControl");
const bcrypt = require("bcrypt");
const { readWorkspaceAiPolicy } = require("../lib/workspaceAiPolicy");

const listWorkspaces = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT w.id, w.slug, w.name, w.personal_owner_id, w.created_at,
            wm.role AS my_role, wm.source AS membership_source,
            COUNT(DISTINCT pm.project_id)::int AS my_project_count
     FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
     LEFT JOIN projects p ON p.workspace_id = w.id AND p.archived_at IS NULL
     LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     GROUP BY w.id, w.slug, w.name, w.personal_owner_id, w.created_at, wm.role, wm.source
     ORDER BY w.created_at, w.id`,
    [req.user.id]
  );
  return res
    .status(200)
    .json({
      data: result.rows,
      meta: {
        enabled: Boolean(req.app.locals.config.workspacesEnabled),
        activeWorkspaceId: req.user.workspaceId
      }
    });
};

const requireWorkspaceMembership = async (db, workspaceId, userId) => {
  const result = await db.query(
    "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  if (result.rows.length === 0) {
    throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
  }
};

const requireManager = async (db, workspaceId, userId, ownerOnly = false) => {
  const member = (
    await db.query("SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [
      workspaceId,
      userId
    ])
  ).rows[0];
  if (!member || !(ownerOnly ? ["owner"] : ["owner", "admin"]).includes(member.role))
    throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
  return member.role;
};

const audit = (db, workspaceId, userId, action, details = {}) =>
  db.query(
    "INSERT INTO workspace_audit_log (workspace_id, actor_id, action, details) VALUES ($1, $2, $3, $4)",
    [workspaceId, userId, action, JSON.stringify(details)]
  );

const createWorkspace = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [req.user.id]);
    const count = (
      await client.query(
        "SELECT COUNT(*)::int AS count FROM workspace_members WHERE user_id = $1 AND role = 'owner'",
        [req.user.id]
      )
    ).rows[0].count;
    if (Number(count) >= 25)
      throw new AppError(
        409,
        "WORKSPACE_LIMIT_REACHED",
        "This account has reached its workspace limit."
      );
    const result = await client.query(
      "INSERT INTO workspaces (slug, name, created_by) VALUES ($1, $2, $3) RETURNING id, slug, name",
      [`team-${randomUUID()}`, req.body.name, req.user.id]
    );
    const workspace = result.rows[0];
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, source) VALUES ($1, $2, 'owner', 'direct')",
      [workspace.id, req.user.id]
    );
    await audit(client, workspace.id, req.user.id, "workspace_created");
    await client.query("COMMIT");
    return res.status(201).json({ data: { ...workspace, my_role: "owner" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const switchWorkspace = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await requireWorkspaceMembership(client, req.params.id, req.user.id);
    const session = await client.query(
      "UPDATE refresh_sessions SET workspace_id = $1, workspace_version = workspace_version + 1 WHERE id = $2 AND user_id = $3 RETURNING workspace_version",
      [req.params.id, req.user.sessionId, req.user.id]
    );
    if (!session.rows[0]) throw new AppError(401, "AUTH_TOKEN_INVALID", "Sign in again.");
    const user = (
      await client.query("SELECT id, email, role, auth_version FROM users WHERE id = $1", [
        req.user.id
      ])
    ).rows[0];
    const accessToken = createAccessToken(
      user,
      req.app.locals.config,
      req.user.sessionId,
      session.rows[0].workspace_version
    );
    await client.query("COMMIT");
    return res
      .status(200)
      .json({ data: { accessToken, activeWorkspaceId: Number(req.params.id) } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const listMembers = async (req, res) => {
  await requireManager(req.app.locals.db, req.params.id, req.user.id);
  const result = await req.app.locals.db.query(
    "SELECT u.id, u.name, u.email, wm.role, wm.source FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = $1 ORDER BY u.name, u.id",
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows });
};

const saveMember = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [req.params.id]);
    const callerRole = await requireManager(client, req.params.id, req.user.id);
    const target = (await client.query("SELECT id FROM users WHERE email = $1", [req.body.email]))
      .rows[0];
    if (!target)
      throw new AppError(404, "USER_NOT_FOUND", "Ask this person to register before adding them.");
    const existing = (
      await client.query(
        "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [req.params.id, target.id]
      )
    ).rows[0];
    if (
      existing?.role === "owner" ||
      (callerRole !== "owner" && (req.body.role === "admin" || existing?.role === "admin"))
    )
      throw new AppError(
        403,
        "WORKSPACE_OWNER_REQUIRED",
        "Only the workspace owner can manage administrator access."
      );
    await client.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role, source) VALUES ($1, $2, $3, 'direct') ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, source = 'direct'",
      [req.params.id, target.id, req.body.role]
    );
    await audit(client, req.params.id, req.user.id, "member_saved", {
      userId: target.id,
      role: req.body.role
    });
    await client.query("COMMIT");
    return res.status(200).json({ data: { userId: target.id, role: req.body.role } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const removeMember = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [req.params.id]);
    const callerRole = await requireManager(client, req.params.id, req.user.id);
    const target = (
      await client.query(
        "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [req.params.id, req.params.userId]
      )
    ).rows[0];
    if (!target) throw new AppError(404, "MEMBER_NOT_FOUND", "Member not found.");
    if (target.role === "owner" || (target.role === "admin" && callerRole !== "owner"))
      throw new AppError(
        403,
        "WORKSPACE_OWNER_PROTECTED",
        "Transfer workspace ownership before removing its owner."
      );
    const owned = await client.query(
      "SELECT p.id FROM projects p JOIN project_members pm ON pm.project_id = p.id WHERE p.workspace_id = $1 AND pm.user_id = $2 AND pm.role = 'owner'",
      [req.params.id, req.params.userId]
    );
    if (owned.rows.length)
      throw new AppError(
        409,
        "PROJECT_OWNER_TRANSFER_REQUIRED",
        "Transfer this member's project ownership before removing them."
      );
    await client.query(
      "DELETE FROM project_members WHERE user_id = $1 AND project_id IN (SELECT id FROM projects WHERE workspace_id = $2)",
      [req.params.userId, req.params.id]
    );
    await client.query("DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2", [
      req.params.id,
      req.params.userId
    ]);
    await audit(client, req.params.id, req.user.id, "member_removed", {
      userId: Number(req.params.userId)
    });
    await client.query("COMMIT");
    return res.status(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getSettings = async (req, res) => {
  await requireManager(req.app.locals.db, req.params.id, req.user.id);
  const rules = await readWorkspaceRules(req.app.locals.db, req.params.id);
  const events = await req.app.locals.db.query(
    "SELECT action, details, created_at FROM workspace_audit_log WHERE workspace_id = $1 ORDER BY id DESC LIMIT 30",
    [req.params.id]
  );
  return res
    .status(200)
    .json({
      data: {
        rules,
        aiPolicy: await readWorkspaceAiPolicy(req.app.locals.db, req.params.id),
        audit: events.rows
      }
    });
};

const saveSettings = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [req.params.id]);
    await requireManager(client, req.params.id, req.user.id);
    const previous =
      (
        await client.query("SELECT rules FROM workspace_settings WHERE workspace_id = $1", [
          req.params.id
        ])
      ).rows[0]?.rules || {};
    await client.query(
      "INSERT INTO workspace_settings (workspace_id, rules) VALUES ($1, $2) ON CONFLICT (workspace_id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = CURRENT_TIMESTAMP",
      [req.params.id, JSON.stringify({ ...previous, ...req.body })]
    );
    await audit(client, req.params.id, req.user.id, "rules_updated", req.body);
    const rules = await readWorkspaceRules(client, req.params.id);
    await client.query("COMMIT");
    return res.status(200).json({ data: rules });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const saveAiPolicy = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM workspaces WHERE id = $1 FOR UPDATE", [req.params.id]);
    await requireManager(client, req.params.id, req.user.id);
    const previous =
      (
        await client.query("SELECT rules FROM workspace_settings WHERE workspace_id = $1", [
          req.params.id
        ])
      ).rows[0]?.rules || {};
    await client.query(
      "INSERT INTO workspace_settings (workspace_id, rules) VALUES ($1, $2) ON CONFLICT (workspace_id) DO UPDATE SET rules = EXCLUDED.rules, updated_at = CURRENT_TIMESTAMP",
      [req.params.id, JSON.stringify({ ...previous, ai_policy: req.body })]
    );
    await audit(client, req.params.id, req.user.id, "ai_policy_updated", req.body);
    await client.query("COMMIT");
    return res.status(200).json({ data: req.body });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const transferOwnership = async (req, res) => {
  const client = await req.app.locals.db.connect();
  try {
    await client.query("BEGIN");
    const workspace = (
      await client.query("SELECT id, personal_owner_id FROM workspaces WHERE id = $1 FOR UPDATE", [
        req.params.id
      ])
    ).rows[0];
    if (!workspace) throw new AppError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
    if (workspace.personal_owner_id)
      throw new AppError(
        409,
        "PERSONAL_WORKSPACE_PROTECTED",
        "Personal workspace ownership stays with its account."
      );
    const actor = (
      await client.query("SELECT role, password_hash FROM users WHERE id = $1", [req.user.id])
    ).rows[0];
    const recovering = req.body.recovery === true;
    if (recovering && actor.role !== "platform_owner")
      throw new AppError(
        403,
        "PLATFORM_OWNER_REQUIRED",
        "Platform owner access is required for recovery."
      );
    if (!recovering) await requireManager(client, req.params.id, req.user.id, true);
    if (!(await bcrypt.compare(req.body.password, actor.password_hash)))
      throw new AppError(403, "OWNER_REAUTH_FAILED", "Your password could not be verified.");
    if (Number(req.body.targetUserId) === req.user.id && !recovering)
      throw new AppError(409, "OWNER_TRANSFER_SELF", "Choose another member to receive ownership.");
    await requireWorkspaceMembership(client, req.params.id, req.body.targetUserId);
    await client.query(
      "UPDATE workspace_members SET role = 'admin', source = 'direct' WHERE workspace_id = $1 AND role = 'owner'",
      [req.params.id]
    );
    await client.query(
      "UPDATE workspace_members SET role = 'owner', source = 'direct' WHERE workspace_id = $1 AND user_id = $2",
      [req.params.id, req.body.targetUserId]
    );
    await audit(
      client,
      req.params.id,
      req.user.id,
      recovering ? "ownership_recovered" : "ownership_transferred",
      { targetUserId: req.body.targetUserId }
    );
    await client.query("COMMIT");
    return res.status(200).json({ data: { ownerId: req.body.targetUserId } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createWorkspace,
  getSettings,
  listMembers,
  listWorkspaces,
  removeMember,
  requireWorkspaceMembership,
  saveAiPolicy,
  saveMember,
  saveSettings,
  switchWorkspace,
  transferOwnership
};
