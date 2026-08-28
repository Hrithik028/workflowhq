const { logActivity } = require("../lib/activity");
const { AppError } = require("../lib/errors");
const { canAccessTask, getProjectRole } = require("../lib/projectAccess");

const commentFields = `c.id, c.task_id, c.user_id, c.body, c.created_at, c.updated_at,
  u.name AS author_name, u.email AS author_email`;

const loadTask = async (db, taskId, userId) => {
  const result = await db.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
  const task = result.rows[0];
  if (!task || !(await canAccessTask(db, task, userId))) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found.");
  }
  return task;
};

const listComments = async (req, res, next) => {
  const db = req.app.locals.db;
  try {
    await loadTask(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const result = await db.query(
    `SELECT ${commentFields}
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC`,
    [req.params.id]
  );
  return res.status(200).json({ data: result.rows });
};

const createComment = async (req, res, next) => {
  const db = req.app.locals.db;
  let task;
  try {
    task = await loadTask(db, req.params.id, req.user.id);
  } catch (error) {
    return next(error);
  }
  const inserted = await db.query(
    "INSERT INTO comments (task_id, user_id, body) VALUES ($1, $2, $3) RETURNING id",
    [req.params.id, req.user.id, req.body.body]
  );
  const result = await db.query(
    `SELECT ${commentFields} FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [inserted.rows[0].id]
  );
  const comment = result.rows[0];
  await logActivity(db, {
    userId: req.user.id,
    action: "task_comment_added",
    entityType: "task",
    entityId: task.id,
    entityTitle: task.title,
    details: {}
  });
  return res.status(201).json({ data: comment });
};

const loadOwnComment = async (db, taskId, commentId, userId) => {
  await loadTask(db, taskId, userId);
  const result = await db.query("SELECT * FROM comments WHERE id = $1 AND task_id = $2", [
    commentId,
    taskId
  ]);
  const comment = result.rows[0];
  if (!comment) {
    throw new AppError(404, "COMMENT_NOT_FOUND", "Comment not found.");
  }
  return comment;
};

const updateComment = async (req, res, next) => {
  const db = req.app.locals.db;
  let comment;
  try {
    comment = await loadOwnComment(db, req.params.id, req.params.commentId, req.user.id);
  } catch (error) {
    return next(error);
  }
  if (Number(comment.user_id) !== Number(req.user.id)) {
    return next(
      new AppError(403, "COMMENT_AUTHOR_REQUIRED", "Only the comment's author can edit it.")
    );
  }
  await db.query("UPDATE comments SET body = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [
    req.body.body,
    comment.id
  ]);
  const result = await db.query(
    `SELECT ${commentFields} FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [comment.id]
  );
  return res.status(200).json({ data: result.rows[0] });
};

const deleteComment = async (req, res, next) => {
  const db = req.app.locals.db;
  let comment;
  try {
    comment = await loadOwnComment(db, req.params.id, req.params.commentId, req.user.id);
  } catch (error) {
    return next(error);
  }
  const isAuthor = Number(comment.user_id) === Number(req.user.id);
  if (!isAuthor) {
    const taskResult = await db.query("SELECT project_id FROM tasks WHERE id = $1", [
      req.params.id
    ]);
    const role = await getProjectRole(db, taskResult.rows[0]?.project_id, req.user.id);
    if (role !== "owner" && role !== "editor") {
      return next(
        new AppError(
          403,
          "COMMENT_AUTHOR_REQUIRED",
          "Only the comment's author or a project editor can delete it."
        )
      );
    }
  }
  await db.query("DELETE FROM comments WHERE id = $1", [comment.id]);
  return res.status(204).send();
};

module.exports = { createComment, deleteComment, listComments, updateComment };
