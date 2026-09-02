const { AppError } = require("./errors");

const DEVELOPMENT_EVENTS = new Set([
  "push",
  "pull_request",
  "check_run",
  "deployment_status",
  "release"
]);
const text = (value, max = 500) =>
  String(value || "")
    .trim()
    .slice(0, max);
const date = (value) => {
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};
const repoUrl = (repository) =>
  repository?.full_name
    ? `https://github.com/${text(repository.full_name, 512)}`
    : "https://github.com";
const safeUrl = (value, fallback) => {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol === "https:" && parsed.hostname === "github.com") return parsed.toString();
  } catch {
    // Webhook URLs are untrusted and are never fetched.
  }
  return fallback;
};

const extractIssueKeys = (value) => [
  ...new Set(
    String(value || "")
      .toUpperCase()
      .match(/\b[A-Z][A-Z0-9]{1,9}-\d+\b/g) || []
  )
];

const event = (values) => ({
  ...values,
  externalId: text(values.externalId, 255),
  githubNodeId: values.githubNodeId ? text(values.githubNodeId, 255) : null,
  title: text(values.title, 500) || "GitHub activity",
  state: values.state ? text(values.state, 50) : null,
  actorLogin: values.actorLogin ? text(values.actorLogin, 255) : null,
  issueKeys: extractIssueKeys(values.issueText)
});

const normalizeDevelopmentEvents = (name, payload) => {
  if (!DEVELOPMENT_EVENTS.has(name)) return null;
  const repositoryUrl = repoUrl(payload.repository);
  const sender = payload.sender?.login;
  if (name === "push") {
    return (Array.isArray(payload.commits) ? payload.commits : []).map((commit) =>
      event({
        linkType: "commit",
        externalId: commit.id,
        githubNodeId: commit.node_id,
        githubNumber: null,
        title: String(commit.message || "Commit").split(/\r?\n/, 1)[0],
        url: safeUrl(
          commit.html_url,
          `${repositoryUrl}/commit/${encodeURIComponent(commit.id || "")}`
        ),
        state: "pushed",
        actorLogin: commit.author?.username || payload.pusher?.name || sender,
        occurredAt: date(commit.timestamp || payload.head_commit?.timestamp),
        metadata: {
          ref: text(payload.ref, 255),
          before: text(payload.before, 64),
          after: text(payload.after, 64)
        },
        issueText: `${commit.message || ""} ${payload.ref || ""}`
      })
    );
  }
  if (name === "pull_request") {
    const pr = payload.pull_request || {};
    return [
      event({
        linkType: "pull_request",
        externalId: pr.id || pr.number || payload.number,
        githubNodeId: pr.node_id,
        githubNumber: pr.number || payload.number || null,
        title: pr.title,
        url: safeUrl(pr.html_url, `${repositoryUrl}/pull/${payload.number || ""}`),
        state: pr.merged ? "merged" : pr.state || payload.action,
        actorLogin: pr.user?.login || sender,
        occurredAt: date(pr.updated_at || pr.created_at),
        metadata: {
          action: text(payload.action, 100),
          baseRef: text(pr.base?.ref, 255),
          headRef: text(pr.head?.ref, 255)
        },
        issueText: `${pr.title || ""} ${pr.body || ""} ${pr.head?.ref || ""}`
      })
    ];
  }
  if (name === "check_run") {
    const check = payload.check_run || {};
    return [
      event({
        linkType: "check_run",
        externalId: check.id,
        githubNodeId: check.node_id,
        githubNumber: null,
        title: check.name,
        url: safeUrl(check.html_url, `${repositoryUrl}/actions`),
        state: check.conclusion || check.status || payload.action,
        actorLogin: check.app?.slug || sender,
        occurredAt: date(check.completed_at || check.started_at),
        metadata: { action: text(payload.action, 100), headSha: text(check.head_sha, 64) },
        issueText: `${check.name || ""} ${check.check_suite?.head_branch || ""} ${check.head_branch || ""}`
      })
    ];
  }
  if (name === "deployment_status") {
    const status = payload.deployment_status || {};
    const deployment = payload.deployment || {};
    return [
      event({
        linkType: "deployment",
        externalId: status.id || `${deployment.id}:${status.state}`,
        githubNodeId: status.node_id,
        githubNumber: null,
        title: `Deployment ${status.state || "updated"}`,
        url: safeUrl(status.environment_url, repositoryUrl),
        state: status.state || payload.action,
        actorLogin: status.creator?.login || deployment.creator?.login || sender,
        occurredAt: date(status.updated_at || status.created_at),
        metadata: {
          deploymentId: deployment.id || null,
          environment: text(deployment.environment || status.environment, 255),
          ref: text(deployment.ref, 255)
        },
        issueText: `${deployment.ref || ""} ${deployment.description || ""} ${deployment.environment || ""}`
      })
    ];
  }
  const release = payload.release || {};
  return [
    event({
      linkType: "release",
      externalId: release.id || release.tag_name,
      githubNodeId: release.node_id,
      githubNumber: null,
      title: release.name || release.tag_name,
      url: safeUrl(release.html_url, `${repositoryUrl}/releases`),
      state: release.draft ? "draft" : release.prerelease ? "prerelease" : "published",
      actorLogin: release.author?.login || sender,
      occurredAt: date(release.published_at || release.created_at),
      metadata: { action: text(payload.action, 100), tagName: text(release.tag_name, 255) },
      issueText: `${release.name || ""} ${release.tag_name || ""} ${release.body || ""}`
    })
  ];
};

const findInstallation = async (client, githubId) => {
  if (!githubId) return null;
  const result = await client.query(
    `SELECT id, user_id, github_installation_id, connection_status
     FROM github_installations WHERE github_installation_id = $1`,
    [githubId]
  );
  return result.rows[0] || null;
};

const upsertRepository = async (client, installation, repository) => {
  if (!installation || !repository?.id) return null;
  const owner = text(repository.owner?.login || repository.full_name?.split("/")[0], 255);
  const name = text(repository.name || repository.full_name?.split("/")[1], 255);
  if (!owner || !name) return null;
  const fullName = text(repository.full_name || `${owner}/${name}`, 512);
  const result = await client.query(
    `INSERT INTO github_repositories (user_id, installation_id, github_repository_id,
       github_node_id, owner_login, name, full_name, html_url, default_branch,
       is_private, is_archived, removed_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,CURRENT_TIMESTAMP)
     ON CONFLICT (github_repository_id) DO UPDATE SET
       installation_id=EXCLUDED.installation_id,
       github_node_id=EXCLUDED.github_node_id, owner_login=EXCLUDED.owner_login,
       name=EXCLUDED.name, full_name=EXCLUDED.full_name, html_url=EXCLUDED.html_url,
       default_branch=EXCLUDED.default_branch, is_private=EXCLUDED.is_private,
       is_archived=EXCLUDED.is_archived, removed_at=NULL, updated_at=CURRENT_TIMESTAMP
     WHERE github_repositories.user_id=EXCLUDED.user_id
     RETURNING id, user_id, installation_id, full_name`,
    [
      installation.user_id,
      installation.id,
      repository.id,
      text(repository.node_id || repository.id, 255),
      owner,
      name,
      fullName,
      safeUrl(repository.html_url, `https://github.com/${fullName}`),
      text(repository.default_branch || "main", 255),
      repository.private === true,
      repository.archived === true
    ]
  );
  return result.rows[0] || null;
};

const installationEvent = async (client, installation, payload) => {
  if (!installation) return false;
  const source = payload.installation || {};
  if (["created", "new_permissions_accepted", "unsuspend"].includes(payload.action)) {
    await client.query(
      `UPDATE github_installations SET github_account_id=COALESCE($1,github_account_id),
       account_login=COALESCE($2,account_login), account_type=COALESCE($3,account_type),
       repository_selection=COALESCE($4,repository_selection), permissions=COALESCE($5::jsonb,permissions),
       suspended_at=NULL, disconnected_at=NULL, connection_status='active', last_webhook_at=CURRENT_TIMESTAMP,
       updated_at=CURRENT_TIMESTAMP WHERE id=$6`,
      [
        source.account?.id || null,
        source.account?.login || null,
        source.account?.type || null,
        source.repository_selection || null,
        source.permissions ? JSON.stringify(source.permissions) : null,
        installation.id
      ]
    );
    for (const repository of Array.isArray(payload.repositories) ? payload.repositories : []) {
      await upsertRepository(client, installation, repository);
    }
    return true;
  }
  if (payload.action === "suspend") {
    await client.query(
      `UPDATE github_installations SET suspended_at=COALESCE($1,CURRENT_TIMESTAMP),
      connection_status='suspended',
      last_webhook_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
      [source.suspended_at || null, installation.id]
    );
    return true;
  }
  if (payload.action === "deleted") {
    await client.query(
      `UPDATE github_installations SET disconnected_at=CURRENT_TIMESTAMP,
      connection_status='revoked',
      last_webhook_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [installation.id]
    );
    return true;
  }
  return false;
};

const repositoriesEvent = async (client, installation, payload) => {
  if (!installation || !["added", "removed"].includes(payload.action)) return false;
  for (const repository of Array.isArray(payload.repositories_added)
    ? payload.repositories_added
    : []) {
    await upsertRepository(client, installation, repository);
  }
  for (const repository of Array.isArray(payload.repositories_removed)
    ? payload.repositories_removed
    : []) {
    const removed = await client.query(
      `UPDATE github_repositories SET selected=FALSE,
      removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE installation_id=$1 AND user_id=$2 AND github_repository_id=$3 RETURNING id`,
      [installation.id, installation.user_id, repository.id]
    );
    if (removed.rows[0]) {
      await client.query("DELETE FROM project_github_repositories WHERE repository_id=$1", [
        removed.rows[0].id
      ]);
    }
  }
  await client.query(
    `UPDATE github_installations SET repository_selection=COALESCE($1,repository_selection),
    last_webhook_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$2`,
    [payload.repository_selection || null, installation.id]
  );
  return true;
};

const storeEvent = async (client, repository, item) => {
  const result = await client.query(
    `INSERT INTO github_development_events (user_id,repository_id,event_type,external_id,
       github_node_id,github_number,title,url,state,actor_login,occurred_at,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (repository_id,event_type,external_id) DO UPDATE SET
       github_node_id=EXCLUDED.github_node_id,github_number=EXCLUDED.github_number,
       title=EXCLUDED.title,url=EXCLUDED.url,state=EXCLUDED.state,actor_login=EXCLUDED.actor_login,
       occurred_at=CASE
         WHEN github_development_events.occurred_at > EXCLUDED.occurred_at
           THEN github_development_events.occurred_at
         ELSE EXCLUDED.occurred_at
       END,
       metadata=EXCLUDED.metadata,updated_at=CURRENT_TIMESTAMP RETURNING id,user_id`,
    [
      repository.user_id,
      repository.id,
      item.linkType,
      item.externalId,
      item.githubNodeId,
      item.githubNumber,
      item.title,
      item.url,
      item.state,
      item.actorLogin,
      item.occurredAt,
      JSON.stringify(item.metadata)
    ]
  );
  return result.rows[0];
};

const linkEvent = async (client, repository, stored, item) => {
  if (!item.issueKeys.length) return;
  const tasks = await client.query(
    `SELECT DISTINCT t.id,t.user_id FROM project_github_repositories link
     JOIN tasks t ON t.project_id=link.project_id
     WHERE link.repository_id=$1 AND t.issue_key=ANY($2::text[])`,
    [repository.id, item.issueKeys]
  );
  for (const task of tasks.rows) {
    await client.query(
      `INSERT INTO github_development_event_tasks (event_id,task_id,link_source)
      VALUES ($1,$2,'automatic') ON CONFLICT (event_id,task_id) DO NOTHING`,
      [stored.id, task.id]
    );
  }
};

const developmentEvent = async (client, installation, name, payload) => {
  const items = normalizeDevelopmentEvents(name, payload);
  if (
    items === null ||
    !installation ||
    installation.connection_status !== "active" ||
    !payload.repository
  ) {
    return false;
  }
  const repository = await upsertRepository(client, installation, payload.repository);
  if (!repository) return false;
  const linkedProjects = await client.query(
    `SELECT p.archived_at
     FROM project_github_repositories link
     JOIN projects p ON p.id = link.project_id
     WHERE link.repository_id = $1`,
    [repository.id]
  );
  if (
    linkedProjects.rows.length > 0 &&
    linkedProjects.rows.every((project) => project.archived_at)
  ) {
    return false;
  }
  for (const item of items.filter((candidate) => candidate.externalId)) {
    const stored = await storeEvent(client, repository, item);
    await linkEvent(client, repository, stored, item);
  }
  return true;
};

const importGithubDevelopmentPayload = async ({ db, installation, eventName, payload }) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const handled = await developmentEvent(client, installation, eventName, payload);
    await client.query("COMMIT");
    return handled;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const processGithubWebhook = async ({ db, deliveryId, eventName, payload, payloadHash }) => {
  const client = await db.connect();
  let installation;
  try {
    await client.query("BEGIN");
    installation = await findInstallation(client, payload.installation?.id);
    let receipt = (
      await client.query(
        `SELECT id,payload_sha256,status FROM github_webhook_deliveries
         WHERE github_delivery_id=$1 FOR UPDATE`,
        [deliveryId]
      )
    ).rows[0];
    if (receipt) {
      if (!receipt || receipt.payload_sha256 !== payloadHash) {
        throw new AppError(
          409,
          "GITHUB_WEBHOOK_REPLAY_CONFLICT",
          "This delivery identifier was already used for a different payload."
        );
      }
      if (["processed", "ignored", "processing"].includes(receipt.status)) {
        await client.query("COMMIT");
        return { duplicate: true, status: receipt.status };
      }
    } else {
      receipt = (
        await client.query(
          `INSERT INTO github_webhook_deliveries (user_id,installation_id,github_delivery_id,event_name,
           event_action,payload_sha256,signature_verified_at,status)
           VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,'received')
           ON CONFLICT (github_delivery_id) DO NOTHING
           RETURNING id,payload_sha256,status`,
          [
            installation?.user_id || null,
            installation?.id || null,
            deliveryId,
            eventName,
            payload.action || null,
            payloadHash
          ]
        )
      ).rows[0];
      if (!receipt) {
        receipt = (
          await client.query(
            `SELECT id,payload_sha256,status FROM github_webhook_deliveries
             WHERE github_delivery_id=$1 FOR UPDATE`,
            [deliveryId]
          )
        ).rows[0];
        if (!receipt || receipt.payload_sha256 !== payloadHash) {
          throw new AppError(
            409,
            "GITHUB_WEBHOOK_REPLAY_CONFLICT",
            "This delivery identifier was already used for a different payload."
          );
        }
        if (["processed", "ignored", "processing"].includes(receipt.status)) {
          await client.query("COMMIT");
          return { duplicate: true, status: receipt.status };
        }
      }
    }
    await client.query(
      `UPDATE github_webhook_deliveries SET status='processing',
      attempt_count=attempt_count+1,error_message=NULL WHERE id=$1`,
      [receipt.id]
    );
    let handled;
    if (eventName === "installation")
      handled = await installationEvent(client, installation, payload);
    else if (eventName === "installation_repositories")
      handled = await repositoriesEvent(client, installation, payload);
    else handled = await developmentEvent(client, installation, eventName, payload);
    const status = handled ? "processed" : "ignored";
    await client.query(
      `UPDATE github_webhook_deliveries SET status=$1,processed_at=CURRENT_TIMESTAMP
      WHERE id=$2`,
      [status, receipt.id]
    );
    await client.query("COMMIT");
    return { duplicate: false, status };
  } catch (error) {
    await client.query("ROLLBACK");
    if (!(error instanceof AppError && error.code === "GITHUB_WEBHOOK_REPLAY_CONFLICT")) {
      await db.query(
        `INSERT INTO github_webhook_deliveries (user_id,installation_id,github_delivery_id,event_name,
         event_action,payload_sha256,signature_verified_at,status,attempt_count,error_message)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,'failed',1,'Webhook processing failed.')
         ON CONFLICT (github_delivery_id) DO UPDATE SET status='failed',
         attempt_count=github_webhook_deliveries.attempt_count+1,error_message='Webhook processing failed.'
         WHERE github_webhook_deliveries.payload_sha256=EXCLUDED.payload_sha256`,
        [
          installation?.user_id || null,
          installation?.id || null,
          deliveryId,
          eventName,
          payload.action || null,
          payloadHash
        ]
      );
    }
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  extractIssueKeys,
  importGithubDevelopmentPayload,
  normalizeDevelopmentEvents,
  processGithubWebhook
};
