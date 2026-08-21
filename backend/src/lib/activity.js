const logActivity = async (
  db,
  { userId, action, entityType, entityId = null, entityTitle, details = {} }
) => {
  await db.query(
    `INSERT INTO activities (user_id, action, entity_type, entity_id, entity_title, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, action, entityType, entityId, entityTitle, JSON.stringify(details)]
  );
};

module.exports = { logActivity };
