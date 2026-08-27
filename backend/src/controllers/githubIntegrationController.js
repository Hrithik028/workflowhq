const { AppError } = require("../lib/errors");

const getIntegrationStatus = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT gi.id, gi.github_installation_id, gi.github_account_id,
            gi.account_login, gi.account_type, gi.repository_selection,
            gi.permissions, gi.suspended_at, gi.created_at, gi.updated_at,
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

const listRepositories = async (req, res) => {
  const values = [req.user.id];
  const conditions = ["gr.user_id = $1"];
  if (req.query.installationId !== undefined) {
    values.push(req.query.installationId);
    conditions.push(`gr.installation_id = $${values.length}`);
  }
  if (req.query.projectId !== undefined) {
    values.push(req.query.projectId);
    conditions.push(`grpl.project_id = $${values.length}`);
  }
  if (req.query.selected !== undefined) {
    values.push(req.query.selected);
    conditions.push(`gr.selected = $${values.length}`);
  }

  const result = await req.app.locals.db.query(
    `SELECT gr.id, gr.installation_id, gr.github_repository_id, gr.github_node_id,
            gr.owner_login, gr.name, gr.full_name, gr.html_url, gr.default_branch,
            gr.is_private, gr.is_archived, gr.selected, grpl.project_id,
            p.key AS project_key, p.name AS project_name,
            gr.created_at, gr.updated_at
     FROM github_repositories gr
     LEFT JOIN github_repository_project_links grpl
       ON grpl.repository_id = gr.id AND grpl.user_id = gr.user_id
     LEFT JOIN projects p ON p.id = grpl.project_id AND p.user_id = gr.user_id
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
    if (projectId !== null) {
      const project = await client.query("SELECT id FROM projects WHERE id = $1 AND user_id = $2", [
        projectId,
        req.user.id
      ]);
      if (project.rows.length === 0) {
        await client.query("ROLLBACK");
        return next(new AppError(404, "PROJECT_NOT_FOUND", "Project not found."));
      }
    }

    const result = await client.query(
      `UPDATE github_repositories
       SET selected = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING id, installation_id, github_repository_id, github_node_id,
                 owner_login, name, full_name, html_url, default_branch,
                 is_private, is_archived, selected, created_at, updated_at`,
      [selected, req.params.repositoryId, req.user.id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return next(new AppError(404, "GITHUB_REPOSITORY_NOT_FOUND", "Repository not found."));
    }

    await client.query(
      "DELETE FROM github_repository_project_links WHERE repository_id = $1 AND user_id = $2",
      [req.params.repositoryId, req.user.id]
    );
    if (selected && projectId !== null) {
      await client.query(
        `INSERT INTO github_repository_project_links (repository_id, user_id, project_id)
         VALUES ($1, $2, $3)`,
        [req.params.repositoryId, req.user.id, projectId]
      );
    }

    await client.query("COMMIT");
    return res.status(200).json({
      data: { ...result.rows[0], project_id: selected ? projectId : null }
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
    "SELECT id, issue_key, title FROM tasks WHERE id = $1 AND user_id = $2",
    [req.params.taskId, req.user.id]
  );
  if (task.rows.length === 0) {
    return next(new AppError(404, "TASK_NOT_FOUND", "Task not found."));
  }

  const links = await db.query(
    `SELECT tdl.id, tdl.link_type, tdl.external_id, tdl.github_node_id,
            tdl.github_number, tdl.title, tdl.url, tdl.state, tdl.actor_login,
            tdl.occurred_at, tdl.metadata, tdl.created_at, tdl.updated_at,
            gr.id AS repository_id, gr.full_name AS repository_full_name,
            gr.html_url AS repository_url
     FROM task_development_links tdl
     JOIN github_repositories gr
       ON gr.id = tdl.repository_id AND gr.user_id = tdl.user_id
     WHERE tdl.task_id = $1 AND tdl.user_id = $2
     ORDER BY tdl.occurred_at DESC, tdl.id DESC`,
    [req.params.taskId, req.user.id]
  );
  return res.status(200).json({ data: { task: task.rows[0], links: links.rows } });
};

module.exports = {
  getIntegrationStatus,
  getTaskDevelopmentLinks,
  listRepositories,
  setRepositorySelection
};
