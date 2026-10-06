const { AppError } = require("../lib/errors");
const { queryInWorkspace } = require("../lib/workspaceContext");

const visibleToRecipient = "n.user_id = $1 AND (n.project_id IS NULL OR pm.user_id IS NOT NULL)";
const membershipJoin =
  "LEFT JOIN project_members pm ON pm.project_id = n.project_id AND pm.user_id = $1";

const listNotifications = async (req, res) => {
  const db = req.app.locals.db;
  const unreadClause = req.query.unreadOnly === "true" ? "AND n.read_at IS NULL" : "";
  const [listed, unread] = await Promise.all([
    queryInWorkspace(
      db,
      `SELECT n.id, n.actor_id, n.project_id, n.task_id, n.kind, n.title, n.body,
              n.read_at, n.created_at
       FROM notifications n
       ${membershipJoin}
       WHERE ${visibleToRecipient} ${unreadClause} /* workspace */
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, req.query.limit + 1, req.query.offset],
      "n"
    ),
    queryInWorkspace(
      db,
      `SELECT COUNT(*)::int AS count FROM notifications n
       ${membershipJoin}
       WHERE ${visibleToRecipient} AND n.read_at IS NULL /* workspace */`,
      [req.user.id],
      "n"
    )
  ]);
  return res.status(200).json({
    data: listed.rows.slice(0, req.query.limit),
    meta: {
      unreadCount: Number(unread.rows[0].count),
      hasMore: listed.rows.length > req.query.limit
    }
  });
};

const markNotificationRead = async (req, res) => {
  const db = req.app.locals.db;
  const visible = await queryInWorkspace(
    db,
    `SELECT n.id FROM notifications n ${membershipJoin}
     WHERE ${visibleToRecipient} AND n.id = $2 /* workspace */`,
    [req.user.id, req.params.id],
    "n"
  );
  if (!visible.rows[0]) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", "Notification not found.");
  }
  const result = await db.query(
    `UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND user_id = $2 RETURNING id, read_at`,
    [req.params.id, req.user.id]
  );
  return res.status(200).json({ data: result.rows[0] });
};

const markAllNotificationsRead = async (req, res) => {
  const db = req.app.locals.db;
  const visible = await queryInWorkspace(
    db,
    `SELECT n.id FROM notifications n ${membershipJoin}
     WHERE ${visibleToRecipient} AND n.read_at IS NULL /* workspace */`,
    [req.user.id],
    "n"
  );
  if (visible.rows.length === 0) {
    return res.status(200).json({ data: { updatedCount: 0 } });
  }
  const ids = visible.rows.map((row) => row.id);
  let updatedCount = 0;
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    const placeholders = batch.map((_, index) => `$${index + 2}`).join(", ");
    const result = await db.query(
      `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND id IN (${placeholders}) AND read_at IS NULL
       RETURNING id`,
      [req.user.id, ...batch]
    );
    updatedCount += result.rows.length;
  }
  return res.status(200).json({ data: { updatedCount } });
};

module.exports = { listNotifications, markAllNotificationsRead, markNotificationRead };
