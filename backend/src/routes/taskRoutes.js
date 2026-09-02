const express = require("express");
const { z } = require("zod");

const {
  createAcceptanceCriterion,
  deleteAcceptanceCriterion,
  listAcceptanceCriteria,
  reorderAcceptanceCriteria,
  updateAcceptanceCriterion
} = require("../controllers/acceptanceCriteriaController");
const {
  createComment,
  deleteComment,
  listComments,
  updateComment
} = require("../controllers/commentController");
const { attachLabel, detachLabel } = require("../controllers/labelController");
const {
  archiveTask,
  createChildTask,
  createTask,
  deleteTask,
  getTaskById,
  getTaskChildren,
  getTasks,
  getTaskStats,
  restoreTask,
  updateTask,
  updateTaskRank
} = require("../controllers/taskController");
const { asyncHandler } = require("../lib/asyncHandler");
const { enforceTaskRules, requirePermission, requireRule } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const {
  acceptanceCriteriaSchemas,
  commentSchemas,
  taskLabelSchemas,
  taskRankSchema,
  taskSchemas
} = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);

router.get(
  "/stats",
  validate({ query: z.object({ projectId: z.coerce.number().int().positive().optional() }) }),
  asyncHandler(getTaskStats)
);
router.get("/", validate({ query: taskSchemas.list }), asyncHandler(getTasks));
router.post(
  "/",
  asyncHandler(requirePermission("tasks.create")),
  validate({ body: taskSchemas.create }),
  asyncHandler(enforceTaskRules({ creating: true })),
  asyncHandler(createTask)
);
router.get(
  "/:id/children",
  validate({ params: taskSchemas.params }),
  asyncHandler(getTaskChildren)
);
router.post(
  "/:id/children",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: taskSchemas.params, body: taskSchemas.create }),
  asyncHandler(enforceTaskRules({ creating: true })),
  asyncHandler(createChildTask)
);
router.get("/:id", validate({ params: taskSchemas.params }), asyncHandler(getTaskById));
router.put(
  "/:id",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskSchemas.params, body: taskSchemas.update }),
  asyncHandler(enforceTaskRules()),
  asyncHandler(updateTask)
);
router.post(
  "/:id/archive",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskSchemas.params }),
  asyncHandler(archiveTask)
);
router.post(
  "/:id/restore",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskSchemas.params }),
  asyncHandler(restoreTask)
);
router.delete(
  "/:id",
  asyncHandler(requirePermission("tasks.delete")),
  asyncHandler(requireRule("allow_task_deletion")),
  validate({ params: taskSchemas.params }),
  asyncHandler(deleteTask)
);
router.patch(
  "/:id/rank",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskSchemas.params, body: taskRankSchema }),
  asyncHandler(updateTaskRank)
);

router.get(
  "/:id/criteria",
  validate({ params: acceptanceCriteriaSchemas.params }),
  asyncHandler(listAcceptanceCriteria)
);
router.post(
  "/:id/criteria",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: acceptanceCriteriaSchemas.params, body: acceptanceCriteriaSchemas.create }),
  asyncHandler(createAcceptanceCriterion)
);
router.put(
  "/:id/criteria/order",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: acceptanceCriteriaSchemas.params, body: acceptanceCriteriaSchemas.reorder }),
  asyncHandler(reorderAcceptanceCriteria)
);
router.put(
  "/:id/criteria/:criterionId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({
    params: acceptanceCriteriaSchemas.criterionParams,
    body: acceptanceCriteriaSchemas.update
  }),
  asyncHandler(updateAcceptanceCriterion)
);
router.delete(
  "/:id/criteria/:criterionId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: acceptanceCriteriaSchemas.criterionParams }),
  asyncHandler(deleteAcceptanceCriterion)
);

router.post(
  "/:id/labels",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskLabelSchemas.params, body: taskLabelSchemas.attach }),
  asyncHandler(attachLabel)
);
router.delete(
  "/:id/labels/:labelId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: taskLabelSchemas.labelParams }),
  asyncHandler(detachLabel)
);

router.get(
  "/:id/comments",
  validate({ params: commentSchemas.params }),
  asyncHandler(listComments)
);
router.post(
  "/:id/comments",
  validate({ params: commentSchemas.params, body: commentSchemas.create }),
  asyncHandler(createComment)
);
router.put(
  "/:id/comments/:commentId",
  validate({ params: commentSchemas.commentParams, body: commentSchemas.update }),
  asyncHandler(updateComment)
);
router.delete(
  "/:id/comments/:commentId",
  validate({ params: commentSchemas.commentParams }),
  asyncHandler(deleteComment)
);

module.exports = router;
