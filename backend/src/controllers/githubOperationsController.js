const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");

const REDELIVERY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const REDELIVERY_COOLDOWN_MS = 60 * 1000;
const MAX_REDELIVERY_REQUESTS = 5;

const requireGithub = (req) => {
  if (!req.app.locals.config.githubIntegrationEnabled || !req.app.locals.github) {
    throw new AppError(503, "GITHUB_INTEGRATION_DISABLED", "GitHub integration is disabled.");
  }
  return req.app.locals.github;
};

const listGithubIdentities = async (req, res) => {
  const db = req.app.locals.db;
  const [actors, mappings, members] = await Promise.all([
    db.query(
      `SELECT gr.installation_id, gi.account_login, gde.actor_login,
              COUNT(gde.id)::int AS event_count, MAX(gde.occurred_at) AS last_seen_at
       FROM github_installations gi
       JOIN github_repositories gr ON gr.installation_id = gi.id
       JOIN github_development_events gde ON gde.repository_id = gr.id
       WHERE gi.user_id = $1 AND gde.actor_login IS NOT NULL
         AND gr.removed_at IS NULL
       GROUP BY gr.installation_id, gi.account_login, gde.actor_login
       ORDER BY MAX(gde.occurred_at) DESC, gde.actor_login ASC`,
      [req.user.id]
    ),
    db.query(
      `SELECT mapping.id, mapping.installation_id, mapping.github_login,
              mapping.mapped_user_id, mapping.updated_at,
              member.name AS mapped_user_name, member.email AS mapped_user_email
       FROM github_identity_mappings mapping
       JOIN github_installations installation ON installation.id = mapping.installation_id
       JOIN users member ON member.id = mapping.mapped_user_id
       WHERE installation.user_id = $1`,
      [req.user.id]
    ),
    db.query(
      `SELECT DISTINCT installation.id AS installation_id,
              member.id AS user_id, member.name, member.email
       FROM github_installations installation
       JOIN github_repositories repository ON repository.installation_id = installation.id
       JOIN project_github_repositories link ON link.repository_id = repository.id
       JOIN projects project ON project.id = link.project_id
       JOIN project_members membership ON membership.project_id = project.id
       JOIN users member ON member.id = membership.user_id
       WHERE installation.user_id = $1 AND repository.selected = TRUE
         AND repository.removed_at IS NULL AND project.archived_at IS NULL
       ORDER BY installation.id, member.name, member.id`,
      [req.user.id]
    )
  ]);
  const mappingByActor = new Map(
    mappings.rows.map((mapping) => [
      `${mapping.installation_id}:${String(mapping.github_login).toLowerCase()}`,
      mapping
    ])
  );
  return res.status(200).json({
    data: {
      actors: actors.rows.map((actor) => ({
        ...actor,
        mapping:
          mappingByActor.get(
            `${actor.installation_id}:${String(actor.actor_login).toLowerCase()}`
          ) || null
      })),
      members: members.rows
    }
  });
};

const setGithubIdentity = async (req, res) => {
  const db = req.app.locals.db;
  const { installationId, githubLogin, userId } = req.body;
  const normalizedLogin = githubLogin.toLowerCase();
  const installation = (
    await db.query(
      `SELECT id, account_login FROM github_installations
       WHERE id = $1 AND user_id = $2 AND connection_status = 'active'`,
      [installationId, req.user.id]
    )
  ).rows[0];
  if (!installation) {
    throw new AppError(404, "GITHUB_INSTALLATION_NOT_FOUND", "Installation not found.");
  }
  const actor = (
    await db.query(
      `SELECT gde.actor_login
       FROM github_development_events gde
       JOIN github_repositories repository ON repository.id = gde.repository_id
       WHERE repository.installation_id = $1
         AND LOWER(gde.actor_login) = $2 AND repository.removed_at IS NULL
       LIMIT 1`,
      [installationId, normalizedLogin]
    )
  ).rows[0];
  if (!actor) {
    throw new AppError(
      404,
      "GITHUB_ACTOR_NOT_FOUND",
      "This GitHub actor has not been observed on a connected repository."
    );
  }
  const member = (
    await db.query(
      `SELECT DISTINCT member.id, member.name, member.email
       FROM github_repositories repository
       JOIN project_github_repositories link ON link.repository_id = repository.id
       JOIN projects project ON project.id = link.project_id
       JOIN project_members membership ON membership.project_id = project.id
       JOIN users member ON member.id = membership.user_id
       WHERE repository.installation_id = $1 AND member.id = $2
         AND repository.selected = TRUE AND repository.removed_at IS NULL
         AND project.archived_at IS NULL
       LIMIT 1`,
      [installationId, userId]
    )
  ).rows[0];
  if (!member) {
    throw new AppError(
      422,
      "GITHUB_IDENTITY_MEMBER_REQUIRED",
      "Choose a member of a project linked to this GitHub installation."
    );
  }
  const conflict = (
    await db.query(
      `SELECT id
       FROM github_identity_mappings
       WHERE installation_id = $1 AND mapped_user_id = $3
         AND github_login_normalized <> $2`,
      [installationId, normalizedLogin, userId]
    )
  ).rows[0];
  if (conflict) {
    throw new AppError(
      409,
      "GITHUB_IDENTITY_CONFLICT",
      "That GitHub actor or WorkflowHQ member is already mapped."
    );
  }
  const mapping = (
    await db.query(
      `INSERT INTO github_identity_mappings
         (installation_id, github_login, github_login_normalized, mapped_user_id, mapped_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (installation_id, github_login_normalized) DO UPDATE SET
         github_login = EXCLUDED.github_login,
         mapped_user_id = EXCLUDED.mapped_user_id,
         mapped_by = EXCLUDED.mapped_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, installation_id, github_login, mapped_user_id, updated_at`,
      [installationId, actor.actor_login, normalizedLogin, userId, req.user.id]
    )
  ).rows[0];
  await logActivity(db, {
    userId: req.user.id,
    action: "github_identity_mapped",
    entityType: "github",
    entityId: Number(mapping.id),
    entityTitle: actor.actor_login,
    details: { memberId: Number(member.id), memberName: member.name }
  });
  return res.status(200).json({
    data: {
      ...mapping,
      mapped_user_name: member.name,
      mapped_user_email: member.email
    }
  });
};

const deleteGithubIdentity = async (req, res) => {
  const db = req.app.locals.db;
  const mapping = (
    await db.query(
      `SELECT mapping.id, mapping.github_login
       FROM github_identity_mappings mapping
       JOIN github_installations installation ON installation.id = mapping.installation_id
       WHERE mapping.id = $1 AND installation.user_id = $2`,
      [req.params.mappingId, req.user.id]
    )
  ).rows[0];
  if (!mapping) {
    throw new AppError(404, "GITHUB_IDENTITY_NOT_FOUND", "Identity mapping not found.");
  }
  await db.query("DELETE FROM github_identity_mappings WHERE id = $1", [mapping.id]);
  await logActivity(db, {
    userId: req.user.id,
    action: "github_identity_unmapped",
    entityType: "github",
    entityId: Number(mapping.id),
    entityTitle: mapping.github_login
  });
  return res.status(204).send();
};

const listWebhookFailures = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT delivery.id, delivery.github_delivery_id, delivery.event_name,
            delivery.event_action, delivery.status, delivery.attempt_count,
            delivery.error_message, delivery.received_at, delivery.processed_at,
            delivery.redelivery_requested_at, delivery.redelivery_request_count,
            installation.account_login
     FROM github_webhook_deliveries delivery
     JOIN github_installations installation ON installation.id = delivery.installation_id
     WHERE delivery.user_id = $1 AND installation.user_id = $1
       AND delivery.status = 'failed'
     ORDER BY delivery.received_at DESC, delivery.id DESC
     LIMIT 50`,
    [req.user.id]
  );
  const currentTime = Date.now();
  const failures = result.rows.map((delivery) => {
    const expired =
      currentTime - new Date(delivery.received_at).getTime() > REDELIVERY_WINDOW_MS;
    const limitReached = Number(delivery.redelivery_request_count) >= MAX_REDELIVERY_REQUESTS;
    const coolingDown = Boolean(
      delivery.redelivery_requested_at &&
        currentTime - new Date(delivery.redelivery_requested_at).getTime() <
          REDELIVERY_COOLDOWN_MS
    );
    return {
      ...delivery,
      redelivery_available: !expired && !limitReached && !coolingDown,
      redelivery_blocked_reason: expired
        ? "expired"
        : limitReached
          ? "limit_reached"
          : coolingDown
            ? "cooldown"
            : null
    };
  });
  return res.status(200).json({ data: failures });
};

const redeliverWebhookFailure = async (req, res) => {
  const github = requireGithub(req);
  const db = req.app.locals.db;
  const delivery = (
    await db.query(
      `SELECT delivery.*, installation.github_installation_id,
              installation.account_login
       FROM github_webhook_deliveries delivery
       JOIN github_installations installation ON installation.id = delivery.installation_id
       WHERE delivery.id = $1 AND delivery.user_id = $2
         AND installation.user_id = $2 AND delivery.status = 'failed'`,
      [req.params.deliveryId, req.user.id]
    )
  ).rows[0];
  if (!delivery) {
    throw new AppError(404, "GITHUB_WEBHOOK_FAILURE_NOT_FOUND", "Failed delivery not found.");
  }
  if (Date.now() - new Date(delivery.received_at).getTime() > REDELIVERY_WINDOW_MS) {
    throw new AppError(
      409,
      "GITHUB_REDELIVERY_EXPIRED",
      "GitHub redelivery is available only for failures from the last three days."
    );
  }
  if (Number(delivery.redelivery_request_count) >= MAX_REDELIVERY_REQUESTS) {
    throw new AppError(
      409,
      "GITHUB_REDELIVERY_LIMIT_REACHED",
      "This delivery has reached its redelivery limit."
    );
  }
  if (
    delivery.redelivery_requested_at &&
    Date.now() - new Date(delivery.redelivery_requested_at).getTime() < REDELIVERY_COOLDOWN_MS
  ) {
    throw new AppError(
      429,
      "GITHUB_REDELIVERY_COOLDOWN",
      "Wait one minute before requesting another redelivery."
    );
  }
  const githubDelivery = await github.redeliverAppWebhook({
    guid: delivery.github_delivery_id,
    installationId: delivery.github_installation_id
  });
  const updated = (
    await db.query(
      `UPDATE github_webhook_deliveries
       SET redelivery_requested_at = CURRENT_TIMESTAMP,
           redelivery_requested_by = $1,
           redelivery_request_count = redelivery_request_count + 1
       WHERE id = $2
       RETURNING redelivery_requested_at, redelivery_request_count`,
      [req.user.id, delivery.id]
    )
  ).rows[0];
  await logActivity(db, {
    userId: req.user.id,
    action: "github_webhook_redelivery_requested",
    entityType: "github",
    entityId: Number(delivery.id),
    entityTitle: `${delivery.event_name}${delivery.event_action ? ` / ${delivery.event_action}` : ""}`,
    details: { githubDeliveryId: Number(githubDelivery.id) }
  });
  return res.status(202).json({
    data: {
      id: Number(delivery.id),
      redeliveryRequestedAt: updated.redelivery_requested_at,
      redeliveryRequestCount: Number(updated.redelivery_request_count)
    }
  });
};

module.exports = {
  deleteGithubIdentity,
  listGithubIdentities,
  listWebhookFailures,
  redeliverWebhookFailure,
  setGithubIdentity
};
