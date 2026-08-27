const express = require("express");

const {
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  updateProject
} = require("../controllers/projectController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requirePermission, requireRule } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { projectSchemas } = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);

router.get("/", asyncHandler(getProjects));
router.post(
  "/",
  asyncHandler(requirePermission("projects.create")),
  validate({ body: projectSchemas.create }),
  asyncHandler(createProject)
);
router.get("/:id", validate({ params: projectSchemas.params }), asyncHandler(getProjectById));
router.put(
  "/:id",
  asyncHandler(requirePermission("projects.edit")),
  validate({ params: projectSchemas.params, body: projectSchemas.update }),
  asyncHandler(updateProject)
);
router.delete(
  "/:id",
  asyncHandler(requirePermission("projects.delete")),
  asyncHandler(requireRule("allow_project_deletion")),
  validate({ params: projectSchemas.params }),
  asyncHandler(deleteProject)
);

module.exports = router;
