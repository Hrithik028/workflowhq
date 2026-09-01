const { AppError } = require("./errors");

const cleanSyncError = () => "GitHub repository synchronization failed.";

const safeGithubUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol === "https:" && url.hostname === "github.com") return url.toString();
  } catch {
    // GitHub API response fields are treated as untrusted data.
  }
  return "https://github.com";
};

const syncInstallationRepositories = async ({ db, github, installation, trigger }) => {
  if (!github) {
    throw new AppError(503, "GITHUB_INTEGRATION_DISABLED", "GitHub integration is disabled.");
  }

  const run = await db.query(
    `INSERT INTO github_sync_runs (user_id, installation_id, trigger, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING id`,
    [installation.user_id, installation.id, trigger]
  );
  const runId = run.rows[0].id;

  await db.query(
    `UPDATE github_installations
     SET sync_status = 'syncing', last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2`,
    [installation.id, installation.user_id]
  );

  try {
    const repositories = await github.listInstallationRepositories(
      installation.github_installation_id
    );
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const seenIds = [];
      for (const repository of repositories) {
        const githubRepositoryId = Number(repository.id);
        if (!Number.isSafeInteger(githubRepositoryId) || githubRepositoryId <= 0) continue;
        seenIds.push(githubRepositoryId);
        const upserted = await client.query(
          `INSERT INTO github_repositories (
             user_id, installation_id, github_repository_id, github_node_id,
             owner_login, name, full_name, html_url, default_branch,
             is_private, is_archived, github_updated_at, pushed_at,
             removed_at, sync_status, last_synced_at, last_sync_error
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, NULL, 'succeeded', CURRENT_TIMESTAMP, NULL
           )
           ON CONFLICT (github_repository_id) DO UPDATE SET
             installation_id = EXCLUDED.installation_id,
             github_node_id = EXCLUDED.github_node_id,
             owner_login = EXCLUDED.owner_login,
             name = EXCLUDED.name,
             full_name = EXCLUDED.full_name,
             html_url = EXCLUDED.html_url,
             default_branch = EXCLUDED.default_branch,
             is_private = EXCLUDED.is_private,
             is_archived = EXCLUDED.is_archived,
             github_updated_at = EXCLUDED.github_updated_at,
             pushed_at = EXCLUDED.pushed_at,
             removed_at = NULL,
             sync_status = 'succeeded',
             last_synced_at = CURRENT_TIMESTAMP,
             last_sync_error = NULL,
             updated_at = CURRENT_TIMESTAMP
           WHERE github_repositories.user_id = EXCLUDED.user_id
           RETURNING id`,
          [
            installation.user_id,
            installation.id,
            githubRepositoryId,
            String(repository.node_id || githubRepositoryId),
            String(repository.owner?.login || "unknown"),
            String(repository.name || "repository"),
            String(
              repository.full_name ||
                `${repository.owner?.login || "unknown"}/${repository.name || "repository"}`
            ),
            safeGithubUrl(repository.html_url),
            String(repository.default_branch || "main"),
            repository.private === true,
            repository.archived === true,
            repository.updated_at || null,
            repository.pushed_at || null
          ]
        );
        if (upserted.rows.length === 0) {
          throw new AppError(
            409,
            "GITHUB_REPOSITORY_OWNERSHIP_CONFLICT",
            "A repository is already connected to another WorkflowHQ account."
          );
        }
      }

      if (seenIds.length > 0) {
        await client.query(
          `UPDATE github_repositories
           SET removed_at = CURRENT_TIMESTAMP, selected = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE installation_id = $1 AND user_id = $2
             AND NOT (github_repository_id = ANY($3::bigint[]))`,
          [installation.id, installation.user_id, seenIds]
        );
      } else {
        await client.query(
          `UPDATE github_repositories
           SET removed_at = CURRENT_TIMESTAMP, selected = FALSE, updated_at = CURRENT_TIMESTAMP
           WHERE installation_id = $1 AND user_id = $2`,
          [installation.id, installation.user_id]
        );
      }

      await client.query(
        `UPDATE github_installations
         SET sync_status = 'succeeded', last_synced_at = CURRENT_TIMESTAMP,
             last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND user_id = $2`,
        [installation.id, installation.user_id]
      );
      await client.query(
        `UPDATE github_sync_runs
         SET status = 'completed', repository_count = $1, completed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [repositories.length, runId]
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { runId, repositoryCount: repositories.length, status: "completed" };
  } catch (error) {
    const message = cleanSyncError();
    await db.query(
      `UPDATE github_installations
       SET sync_status = 'failed', last_sync_error = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [message, installation.id, installation.user_id]
    );
    await db.query(
      `UPDATE github_sync_runs
       SET status = 'failed', error_message = $1, completed_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [message, runId]
    );
    throw error;
  }
};

module.exports = { syncInstallationRepositories };
