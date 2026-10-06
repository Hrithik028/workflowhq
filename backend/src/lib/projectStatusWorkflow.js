const { AppError } = require("./errors");

const DEFAULT_STATUS_LABELS = [
  { status: "todo", label: "Backlog" },
  { status: "in_progress", label: "In progress" },
  { status: "completed", label: "Released" }
];

const DEFAULT_TRANSITIONS = DEFAULT_STATUS_LABELS.flatMap(({ status: fromStatus }) =>
  DEFAULT_STATUS_LABELS.filter(({ status }) => status !== fromStatus).map(
    ({ status: toStatus }) => ({ fromStatus, toStatus })
  )
);

const ensureProjectStatusWorkflow = async (db, projectId) => {
  const existing = await db.query(
    "SELECT COUNT(*)::int AS count FROM project_status_labels WHERE project_id = $1",
    [projectId]
  );
  if (Number(existing.rows[0].count) > 0) return;
  for (const { status, label } of DEFAULT_STATUS_LABELS) {
    await db.query(
      `INSERT INTO project_status_labels (project_id, status, label)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [projectId, status, label]
    );
  }
  // New projects receive all the moves that were previously available.
  for (const transition of DEFAULT_TRANSITIONS) {
    await db.query(
      `INSERT INTO project_status_transitions (project_id, from_status, to_status)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [projectId, transition.fromStatus, transition.toStatus]
    );
  }
};

const selectProjectStatusWorkflow = async (db, projectId) => {
  const [statusResult, transitionResult] = await Promise.all([
    db.query(
      `SELECT status, label FROM project_status_labels WHERE project_id = $1
       ORDER BY CASE status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END`,
      [projectId]
    ),
    db.query(
      `SELECT from_status, to_status FROM project_status_transitions WHERE project_id = $1
       ORDER BY from_status, to_status`,
      [projectId]
    )
  ]);
  return {
    statuses: statusResult.rows,
    transitions: transitionResult.rows.map((row) => ({
      fromStatus: row.from_status,
      toStatus: row.to_status
    }))
  };
};

const assertManualTransition = async (db, projectId, fromStatus, toStatus) => {
  if (!projectId || fromStatus === toStatus) return;
  const result = await db.query(
    `SELECT 1 FROM project_status_transitions
     WHERE project_id = $1 AND from_status = $2 AND to_status = $3`,
    [projectId, fromStatus, toStatus]
  );
  if (!result.rows[0]) {
    throw new AppError(
      409,
      "WORKFLOW_TRANSITION_NOT_ALLOWED",
      "This project does not allow that manual status change."
    );
  }
};

module.exports = {
  DEFAULT_STATUS_LABELS,
  DEFAULT_TRANSITIONS,
  assertManualTransition,
  ensureProjectStatusWorkflow,
  selectProjectStatusWorkflow
};
