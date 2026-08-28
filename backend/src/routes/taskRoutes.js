const express = require("express");
const { z } = require("zod");

const { attachLabel, detachLabel } = require("../controllers/labelController");
const {
  createChildTask,
  createTask,
  deleteTask,
  getTaskById,
  getTaskChildren,
  getTasks,
  getTaskStats,
  updateTask
} = require("../controllers/taskController");
const { asyncHandler } = require("../lib/asyncHandler");
const { enforceTaskRules, requirePermission, requireRule } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { taskLabelSchemas, taskSchemas } = require("../validation/schemas");

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
router.delete(
  "/:id",
  asyncHandler(requirePermission("tasks.delete")),
  asyncHandler(requireRule("allow_task_deletion")),
  validate({ params: taskSchemas.params }),
  asyncHandler(deleteTask)
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

module.exports = router;
