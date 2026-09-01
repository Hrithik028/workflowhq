const { createHash, randomBytes } = require("node:crypto");

const { AppError } = require("../lib/errors");
const { syncRepositoryHistory } = require("../lib/githubHistorySync");
const { syncInstallationRepositories } = require("../lib/githubRepositorySync");
const { canAccessTask, getProjectRole } = require("../lib/projectAccess");

const stateHash = (state) => createHash("sha256").update(state).digest("hex");

const requireGithub = (req) => {
  if (!req.app.locals.config.githubIntegrationEnabled || !req.app.locals.github) {
    throw new AppError(503, "GITHUB_INTEGRATION_DISABLED", "GitHub integration is disabled.");
  }
  return req.app.locals.github;
};

const getIntegrationStatus = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT gi.id, gi.github_installation_id, gi.github_account_id,
            gi.account_login, gi.account_type, gi.repository_selection,
            gi.permissions, gi.suspended_at, gi.connection_status,
            gi.last_verified_at, gi.sync_status AS sync_state, gi.last_synced_at,
            gi.last_sync_error AS last_error,
            NULL AS manage_url,
            gi.created_at, gi.updated_at,
            COUNT(gr.id)::int AS repository_count,
            COUNT(gr.id) FILTER (WHERE gr.selected)::int AS selected_repository_count
     FROM github_installations gi
     LEFT JOIN github_repositories gr
       ON gr.installation_id = gi.id AND gr.user_id = gi.user_id
     WHERE gi.user_id = $1
     GROUP BY gi.id
     ORDER BY gi.updated_at DESC, gi.id DESC`,
    [req.user.id]
  );
  return res.status(200).json({
    data: { connected: result.rows.length > 0, installations: result.rows }
  });
};

const startConnection = async (req, res) => {
  requireGithub(req);
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + req.app.locals.config.githubConnectStateTtlMinutes * 60 * 1000
  );
  await req.app.locals.db.query(
    `INSERT INTO github_connection_states (user_id, state_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [req.user.id, stateHash(state), expiresAt]
  );
  const installUrl = new URL(
    `/apps/${req.app.locals.config.githubAppSlug}/installations/new`,
    "https://github.com"
  );
  installUrl.searchParams.set("state", state);
  return res.status(201).json({ data: { installUrl: installUrl.toString(), expiresAt } });
};

const consumeConnectionState = async (db, state) => {
  const result = await db.query(
    `UPDATE github_connection_states
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE state_hash = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [stateHash(state)]
  );
  if (result.rows.length === 0) {
    throw new AppError(
      400,
      "GITHUB_CONNECTION_STATE_INVALID",
      "The GitHub connection request is invalid or has expired."
    );
  }
  return result.rows[0].user_id;
};

const upsertInstallation = async (db, userId, githubInstallation) => {
  const externalId = Number(githubInstallation.id);
  const accountId = Number(githubInstallation.account?.id);
  if (!Number.isSafeInteger(externalId) || !Number.isSafeInteger(accountId)) {
    throw new AppError(
      502,
      "GITHUB_INSTALLATION_INVALID",
      "GitHub returned invalid installation data."
    );
  }

  const existing = await db.query(
    "SELECT id, user_id FROM github_installations WHERE github_installation_id = $1",
    [externalId]
  );
  if (existing.rows.length > 0 && Number(existing.rows[0].user_id) !== Number(userId)) {
    throw new AppError(
      409,
      "GITHUB_INSTALLATION_ALREADY_CONNECTED",
      "This GitHub installation is already connected."
    );
  }

  const result = await db.query(
    `INSERT INTO github_installations (
       user_id, github_installation_id, github_account_id, account_login,
       account_type, repository_selection, permissions, suspended_at,
       connection_status, last_verified_at, sync_status, last_sync_error
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, 'queued', NULL)
     ON CONFLICT (github_installation_id) DO UPDATE SET
       github_account_id = EXCLUDED.github_account_id,
       account_login = EXCLUDED.account_login,
       account_type = EXCLUDED.account_type,
       repository_selection = EXCLUDED.repository_selection,
       permissions = EXCLUDED.permissions,
       suspended_at = EXCLUDED.suspended_at,
       connection_status = EXCLUDED.connection_status,
       last_verified_at = CURRENT_TIMESTAMP,
       sync_status = 'queued',
       last_sync_error = NULL,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, user_id, github_installation_id, github_account_id,
               account_login, account_type, repository_selection, permissions,
               suspended_at, connection_status, sync_status, last_verified_at`,
    [
      userId,
      externalId,
      accountId,
      String(githubInstallation.account?.login || "unknown"),
      githubInstallation.account?.type === "Organization" ? "Organization" : "User",
      githubInstallation.repository_selection === "all" ? "all" : "selected",
      githubInstallation.permissions || {},
      githubInstallation.suspended_at || null,
      githubInstallation.suspended_at ? "suspended" : "active"
    ]
  );
  return result.rows[0];
};

const finishConnection = async (req, res) => {
  try {
    const github = requireGithub(req);
    const userId = await consumeConnectionState(req.app.locals.db, req.query.state);
    const githubInstallation = await github.verifyInstallationForUser({
      installationId: req.query.installation_id,
      code: req.query.code
    });
    const installation = await upsertInstallation(req.app.locals.db, userId, githubInstallation);
    await syncInstallationRepositories({
      db: req.app.locals.db,
      github,
      installation,
      trigger: "install"
    });
    const destination = new URL(
      "/settings/integrations/github",
      req.app.locals.config.corsOrigins[0]
    );
    destination.searchParams.set("result", "connected");
    return res.redirect(303, destination.toString());
  } catch (error) {
    const destination = new URL(
      "/settings/integrations/github",
      req.app.locals.config.corsOrigins[0]
    );
    destination.searchParams.set("result", "failed");
    destination.searchParams.set(
      "reason",
      error instanceof AppError ? error.code : "GITHUB_CONNECTION_FAILED"
    );
    return res.redirect(303, destination.toString());
  }
};

const syncInstallation = async (req, res, next) => {
  const github = requireGithub(req);
  const result = await req.app.locals.db.query(
    "SELECT * FROM github_installations WHERE id = $1 AND user_id = $2",
    [req.params.installationId, req.user.id]
  );
  if (result.rows.length === 0) {
    return next(new AppError(404, "GITHUB_INSTALLATION_NOT_FOUND", "Installation not found."));
  }
  const sync = await syncInstallationRepositories({
    db: req.app.locals.db,
    github,
    installation: result.rows[0],
    trigger: "manual"
  });
  const repositories = await req.app.locals.db.query(
    `SELECT gr.* FROM github_repositories gr
     WHERE gr.installation_id = $1 AND gr.user_id = $2
       AND gr.selected = TRUE AND gr.removed_at IS NULL
     ORDER BY gr.id ASC LIMIT 25`,
    [result.rows[0].id, req.user.id]
  );
  let imported = 0;
  let failedRepositories = 0;
  let historySince = null;
  for (const repository of repositories.rows) {
    try {
      const history = await syncRepositoryHistory({
        db: req.app.locals.db,
        github,
        installation: result.rows[0],
        repository
      });
      imported += history.imported;
      historySince = history.since || historySince;
    } catch {
      // The repository records its own sanitized failure without failing other repositories.
      failedRepositories += 1;
    }
  }
  if (failedRepositories > 0) {
    const message = `${failedRepositories} selected repository${failedRepositories === 1 ? "" : "ies"} could not synchronize development history.`;
    await req.app.locals.db.query(
      `UPDATE github_installations
       SET sync_status = 'partial', last_sync_error = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [message, result.rows[0].id, req.user.id]
    );
    await req.app.locals.db.query(
      `UPDATE github_sync_runs
       SET status = 'partial', error_message = $1,
           processed_event_count = $2, failed_repository_count = $3,
           history_since = $4
       WHERE id = $5 AND user_id = $6`,
      [message, imported, failedRepositories, historySince, sync.runId, req.user.id]
    );
  } else {
    await req.app.locals.db.query(
      `UPDATE github_sync_runs
       SET processed_event_count = $1, failed_repository_count = 0,
           history_since = $2
       WHERE id = $3 AND user_id = $4`,
      [imported, historySince, sync.runId, req.user.id]
    );
  }
  const rateLimit = github.getRateLimitState?.() || {};
  await req.app.locals.db.query(
    `UPDATE github_sync_runs
     SET rate_limit_remaining = $1, rate_limit_reset_at = $2
     WHERE id = $3 AND user_id = $4`,
    [rateLimit.remaining ?? null, rateLimit.resetAt ?? null, sync.runId, req.user.id]
  );
  return res.status(202).json({
    data: {
      ...sync,
      imported,
      failedRepositories,
      status: failedRepositories > 0 ? "partial" : sync.status
    }
  });
};

const listRepositories = async (req, res) => {
  const values = [req.user.id];
  const conditions = ["(gr.user_id = $1 OR pm_access.user_id = $1)"];
  if (req.query.installationId !== undefined) {
    values.push(req.query.installationId);
    conditions.push(`gr.installation_id = $${values.length}`);
  }
  if (req.query.projectId !== undefined) {
    values.push(req.query.projectId);
    conditions.push(`pgr.project_id = $${values.length}`);
  }
  if (req.query.selected !== undefined) {
    values.push(req.query.selected);
    conditions.push(`gr.selected = $${values.length}`);
  }

  const result = await req.app.locals.db.query(
    `SELECT gr.id, gr.installation_id, gr.github_repository_id, gr.github_node_id,
            gr.owner_login, gr.name, gr.full_name, gr.html_url, gr.default_branch,
            gr.is_private, gr.is_archived, gr.selected, gr.removed_at,
            gr.sync_status AS sync_state, gr.last_synced_at,
            gr.last_sync_error AS last_error, pgr.project_id,
            p.key AS project_key, p.name AS project_name,
            gr.created_at, gr.updated_at
     FROM github_repositories gr
     LEFT JOIN project_github_repositories pgr ON pgr.repository_id = gr.id
     LEFT JOIN project_members pm_access
       ON pm_access.project_id = pgr.project_id AND pm_access.user_id = $1
     LEFT JOIN projects p ON p.id = pgr.project_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY gr.selected DESC, gr.full_name ASC`,
    values
  );
  return res.status(200).json({ data: result.rows });
};

const setRepositorySelection = async (req, res, next) => {
  const db = req.app.locals.db;
  const { projectId, selected } = req.body;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    if (selected && projectId === null) {
      await client.query("ROLLBACK");
      return next(new AppError(400, "PROJECT_REQUIRED", "Choose a project for this repository."));
    }
    if (projectId !== null && (await getProjectRole(client, projectId, req.user.id)) !== "owner") {
      await client.query("ROLLBACK");
      return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
    }

    const repository = await client.query(
      `SELECT id FROM github_repositories
       WHERE id = $1 AND user_id = $2`,
      [req.params.repositoryId, req.user.id]
    );
    if (repository.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "GITHUB_REPOSITORY_NOT_FOUND", "Repository not found."));
    }

    if (selected) {
      await client.query(
        `INSERT INTO project_github_repositories (repository_id, linked_by, project_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (repository_id) DO UPDATE SET
           linked_by = EXCLUDED.linked_by,
           project_id = EXCLUDED.project_id,
           updated_at = CURRENT_TIMESTAMP`,
        [req.params.repositoryId, req.user.id, projectId]
      );
    } else {
      await client.query(
        `DELETE FROM project_github_repositories
         WHERE repository_id = $1 AND ($2::integer IS NULL OR project_id = $2)`,
        [req.params.repositoryId, projectId]
      );
    }

    const result = await client.query(
      `UPDATE github_repositories
       SET selected = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, installation_id, github_repository_id, github_node_id,
                 owner_login, name, full_name, html_url, default_branch,
                 is_private, is_archived, selected, removed_at,
                 sync_status AS sync_state, last_synced_at,
                 last_sync_error AS last_error, created_at, updated_at`,
      [selected, req.params.repositoryId, req.user.id]
    );
    const project = selected
      ? (await client.query("SELECT key, name FROM projects WHERE id = $1", [projectId])).rows[0]
      : null;

    await client.query("COMMIT");
    return res.status(200).json({
      data: {
        ...result.rows[0],
        project_id: selected ? projectId : null,
        project_key: project?.key || null,
        project_name: project?.name || null
      }
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const getTaskDevelopmentLinks = async (req, res, next) => {
  const db = req.app.locals.db;
  const task = await db.query(
    "SELECT id, user_id, project_id, issue_key, title FROM tasks WHERE id = $1",
    [req.params.taskId]
  );
  if (task.rows.length === 0 || !(await canAccessTask(db, task.rows[0], req.user.id))) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }

  const currentLinks = await db.query(
    `SELECT gde.id, gde.event_type AS link_type, gde.external_id, gde.github_node_id,
            gde.github_number, gde.title, gde.url, gde.state, gde.actor_login,
            gde.occurred_at, gde.metadata, gde.created_at, gde.updated_at,
            gdet.link_source,
            gr.id AS repository_id, gr.full_name AS repository_full_name,
            gr.html_url AS repository_url
     FROM github_development_event_tasks gdet
     JOIN github_development_events gde ON gde.id = gdet.event_id
     JOIN github_repositories gr ON gr.id = gde.repository_id
     WHERE gdet.task_id = $1
     ORDER BY gde.occurred_at DESC, gde.id DESC`,
    [req.params.taskId]
  );
  const legacyLinks = await db.query(
    `SELECT tdl.id, tdl.link_type, tdl.external_id, tdl.github_node_id,
            tdl.github_number, tdl.title, tdl.url, tdl.state, tdl.actor_login,
            tdl.occurred_at, tdl.metadata, tdl.created_at, tdl.updated_at,
            'automatic' AS link_source,
            gr.id AS repository_id, gr.full_name AS repository_full_name,
            gr.html_url AS repository_url
     FROM task_development_links tdl
     JOIN github_repositories gr ON gr.id = tdl.repository_id
     WHERE tdl.task_id = $1
     ORDER BY tdl.occurred_at DESC, tdl.id DESC`,
    [req.params.taskId]
  );
  const eventKey = (link) => `${link.repository_id}:${link.link_type}:${link.external_id}`;
  const seen = new Set(currentLinks.rows.map(eventKey));
  const links = [
    ...currentLinks.rows,
    ...legacyLinks.rows.filter((link) => !seen.has(eventKey(link)))
  ].sort((left, right) => {
    const byTime = new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime();
    return byTime || Number(right.id) - Number(left.id);
  });
  return res.status(200).json({ data: { task: task.rows[0], links } });
};

const getCommandSummary = async (req, res) => {
  const db = req.app.locals.db;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const accessibleRepositories = `FROM github_repositories gr
    JOIN project_github_repositories pgr ON pgr.repository_id = gr.id
    JOIN project_members pm ON pm.project_id = pgr.project_id
    WHERE pm.user_id = $1 AND gr.removed_at IS NULL`;
  const accessibleEvents = `FROM github_development_events gde
    JOIN github_repositories gr ON gr.id = gde.repository_id
    JOIN project_github_repositories pgr ON pgr.repository_id = gr.id
    JOIN project_members pm ON pm.project_id = pgr.project_id
    WHERE pm.user_id = $1 AND gr.removed_at IS NULL`;
  const [installations, repositories, openPullRequests, failingChecks, deployments, contributors] =
    await Promise.all([
      db.query(
        `SELECT COUNT(*)::int AS count
         FROM github_installations
         WHERE user_id = $1 AND connection_status = 'active'`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(DISTINCT gr.id)::int AS count,
                MAX(gr.last_synced_at) AS last_synced_at
         ${accessibleRepositories}`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(DISTINCT gde.id)::int AS count
         ${accessibleEvents}
           AND gde.event_type = 'pull_request' AND LOWER(COALESCE(gde.state, '')) = 'open'`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(DISTINCT gde.id)::int AS count
         ${accessibleEvents}
           AND gde.event_type = 'check_run'
           AND LOWER(COALESCE(gde.state, '')) IN
             ('failure', 'failed', 'timed_out', 'cancelled', 'action_required', 'startup_failure')`,
        [req.user.id]
      ),
      db.query(
        `SELECT COUNT(DISTINCT gde.id)::int AS count
         ${accessibleEvents}
           AND gde.event_type = 'deployment'
           AND LOWER(COALESCE(gde.state, '')) IN ('success', 'succeeded')
           AND gde.occurred_at >= $2`,
        [req.user.id, weekAgo]
      ),
      db.query(
        `SELECT COUNT(DISTINCT gde.actor_login)::int AS count
         ${accessibleEvents} AND gde.actor_login IS NOT NULL`,
        [req.user.id]
      )
    ]);
  const recent = await db.query(
    `SELECT gde.id, gde.event_type, gde.external_id, gde.github_number,
            gde.title, gde.url, gde.state, gde.actor_login, gde.occurred_at,
            gde.metadata, gr.full_name AS repository_full_name,
            p.id AS project_id, p.key AS project_key, p.name AS project_name
     FROM github_development_events gde
     JOIN github_repositories gr ON gr.id = gde.repository_id
     JOIN project_github_repositories pgr ON pgr.repository_id = gr.id
     JOIN projects p ON p.id = pgr.project_id
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1 AND gr.removed_at IS NULL
     ORDER BY gde.occurred_at DESC, gde.id DESC
     LIMIT 12`,
    [req.user.id]
  );
  const repositoryCount = Number(repositories.rows[0].count || 0);
  return res.status(200).json({
    data: {
      connected: Number(installations.rows[0].count || 0) > 0 || repositoryCount > 0,
      installation_count: Number(installations.rows[0].count || 0),
      repository_count: repositoryCount,
      contributor_count: Number(contributors.rows[0].count || 0),
      open_pull_request_count: Number(openPullRequests.rows[0].count || 0),
      failing_check_count: Number(failingChecks.rows[0].count || 0),
      deployed_this_week_count: Number(deployments.rows[0].count || 0),
      last_synced_at: repositories.rows[0].last_synced_at || null,
      recent: recent.rows
    }
  });
};

const getProjectDevelopment = async (req, res, next) => {
  const db = req.app.locals.db;
  const role = await getProjectRole(db, req.params.projectId, req.user.id);
  if (!role) {
    return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
  }
  const project = (
    await db.query("SELECT id, key, name, description FROM projects WHERE id = $1", [
      req.params.projectId
    ])
  ).rows[0];
  const repositories = await db.query(
    `SELECT gr.id, gr.full_name, gr.html_url, gr.default_branch, gr.is_private,
            gr.is_archived, gr.sync_status, gr.last_synced_at, gr.last_sync_error
     FROM project_github_repositories pgr
     JOIN github_repositories gr ON gr.id = pgr.repository_id
     WHERE pgr.project_id = $1 AND gr.removed_at IS NULL
     ORDER BY gr.full_name`,
    [req.params.projectId]
  );
  const events = await db.query(
    `SELECT gde.id, gde.event_type, gde.external_id, gde.github_number,
            gde.title, gde.url, gde.state, gde.actor_login, gde.occurred_at,
            gde.metadata, gr.full_name AS repository_full_name
     FROM project_github_repositories pgr
     JOIN github_repositories gr ON gr.id = pgr.repository_id
     JOIN github_development_events gde ON gde.repository_id = gr.id
     WHERE pgr.project_id = $1
     ORDER BY gde.occurred_at DESC, gde.id DESC
     LIMIT 200`,
    [req.params.projectId]
  );
  const taskLinks = await db.query(
    `SELECT gdet.event_id, gdet.link_source, t.id AS task_id,
            t.issue_key, t.title AS task_title
     FROM github_development_event_tasks gdet
     JOIN tasks t ON t.id = gdet.task_id
     WHERE t.project_id = $1
     ORDER BY gdet.event_id, t.issue_key`,
    [req.params.projectId]
  );
  return res.status(200).json({
    data: {
      project: { ...project, my_role: role },
      repositories: repositories.rows,
      events: events.rows,
      task_links: taskLinks.rows
    }
  });
};

module.exports = {
  getCommandSummary,
  getIntegrationStatus,
  getProjectDevelopment,
  getTaskDevelopmentLinks,
  finishConnection,
  listRepositories,
  setRepositorySelection,
  startConnection,
  syncInstallation
};
