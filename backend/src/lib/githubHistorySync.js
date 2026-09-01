const { AppError } = require("./errors");
const { importGithubDevelopmentPayload } = require("./githubWebhookService");

const historySince = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
const isSince = (value, since) => {
  const occurredAt = Date.parse(value || 0);
  return Number.isFinite(occurredAt) && occurredAt >= Date.parse(since);
};

const repositoryPayload = (repository) => ({
  id: repository.github_repository_id,
  node_id: repository.github_node_id,
  owner: { login: repository.owner_login },
  name: repository.name,
  full_name: repository.full_name,
  html_url: repository.html_url,
  default_branch: repository.default_branch,
  private: repository.is_private,
  archived: repository.is_archived
});

const syncRepositoryHistory = async ({ db, github, installation, repository }) => {
  if (!github) {
    throw new AppError(503, "GITHUB_INTEGRATION_DISABLED", "GitHub integration is disabled.");
  }
  await db.query(
    "UPDATE github_repositories SET sync_status = 'syncing', last_sync_error = NULL WHERE id = $1",
    [repository.id]
  );
  try {
    const since = historySince();
    const history = await github.listRepositoryHistory(
      installation.github_installation_id,
      repository,
      since
    );
    const base = {
      installation: { id: installation.github_installation_id },
      repository: repositoryPayload(repository)
    };
    let imported = 0;
    const recentCommits = (history.commits || []).filter((item) =>
      isSince(item.commit?.author?.date || item.commit?.committer?.date, since)
    );
    if (recentCommits.length) {
      await importGithubDevelopmentPayload({
        db,
        installation,
        eventName: "push",
        payload: {
          ...base,
          ref: `refs/heads/${repository.default_branch}`,
          commits: recentCommits.map((item) => ({
            id: item.sha,
            node_id: item.node_id,
            message: item.commit?.message,
            html_url: item.html_url,
            timestamp: item.commit?.author?.date || item.commit?.committer?.date,
            author: { username: item.author?.login || item.commit?.author?.name }
          }))
        }
      });
      imported += recentCommits.length;
    }
    for (const pullRequest of history.pullRequests || []) {
      if (
        !isSince(
          pullRequest.updated_at ||
            pullRequest.merged_at ||
            pullRequest.closed_at ||
            pullRequest.created_at,
          since
        )
      ) {
        continue;
      }
      await importGithubDevelopmentPayload({
        db,
        installation,
        eventName: "pull_request",
        payload: {
          ...base,
          action: "synchronize",
          number: pullRequest.number,
          pull_request: pullRequest
        }
      });
      imported += 1;
    }
    for (const checkRun of history.checkRuns || []) {
      if (!isSince(checkRun.completed_at || checkRun.started_at || checkRun.created_at, since)) {
        continue;
      }
      await importGithubDevelopmentPayload({
        db,
        installation,
        eventName: "check_run",
        payload: {
          ...base,
          action: checkRun.status === "completed" ? "completed" : "updated",
          check_run: checkRun
        }
      });
      imported += 1;
    }
    for (const deployment of history.deployments || []) {
      if (!isSince(deployment.updated_at || deployment.created_at, since)) continue;
      await importGithubDevelopmentPayload({
        db,
        installation,
        eventName: "deployment_status",
        payload: {
          ...base,
          deployment,
          deployment_status: {
            id: `history-${deployment.id}`,
            state: "created",
            created_at: deployment.created_at,
            creator: deployment.creator
          }
        }
      });
      imported += 1;
    }
    for (const release of history.releases || []) {
      if (!isSince(release.published_at || release.created_at, since)) continue;
      await importGithubDevelopmentPayload({
        db,
        installation,
        eventName: "release",
        payload: { ...base, action: release.draft ? "edited" : "published", release }
      });
      imported += 1;
    }
    await db.query(
      `UPDATE github_repositories
       SET sync_status = 'succeeded', last_synced_at = CURRENT_TIMESTAMP,
           history_synced_through = CURRENT_TIMESTAMP,
           last_sync_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [repository.id]
    );
    return { imported, since };
  } catch (error) {
    await db.query(
      `UPDATE github_repositories
       SET sync_status = 'failed', last_sync_error = 'GitHub history synchronization failed.',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [repository.id]
    );
    throw error;
  }
};

module.exports = { syncRepositoryHistory };
