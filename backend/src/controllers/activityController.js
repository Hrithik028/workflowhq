const { queryInWorkspace } = require("../lib/workspaceContext");
const getActivity = async (req, res) => {
  const result = await queryInWorkspace(
    req.app.locals.db,
    `SELECT id, action, entity_type, entity_id, entity_title, details, created_at
     FROM activities a
     WHERE user_id = $1 /* workspace */
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [req.user.id, req.query.limit],
    "a"
  );
  return res.status(200).json({ data: result.rows });
};

module.exports = { getActivity };
