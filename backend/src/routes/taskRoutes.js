const express = require("express");
const { z } = require("zod");

const {
  createTask,
  deleteTask,
  getTaskById,
  getTasks,
  getTaskStats,
  updateTask
} = require("../controllers/taskController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { taskSchemas } = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);

router.get(
  "/stats",
  validate({ query: z.object({ projectId: z.coerce.number().int().positive().optional() }) }),
  asyncHandler(getTaskStats)
);
router.get("/", validate({ query: taskSchemas.list }), asyncHandler(getTasks));
router.post("/", validate({ body: taskSchemas.create }), asyncHandler(createTask));
router.get("/:id", validate({ params: taskSchemas.params }), asyncHandler(getTaskById));
router.put(
  "/:id",
  validate({ params: taskSchemas.params, body: taskSchemas.update }),
  asyncHandler(updateTask)
);
router.delete("/:id", validate({ params: taskSchemas.params }), asyncHandler(deleteTask));

module.exports = router;
