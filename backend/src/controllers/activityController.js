const getActivity = async (req, res) => {
  const result = await req.app.locals.db.query(
    `SELECT id, action, entity_type, entity_id, entity_title, details, created_at
     FROM activities
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [req.user.id, req.query.limit]
  );
  return res.status(200).json({ data: result.rows });
};

module.exports = { getActivity };
