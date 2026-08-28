const express = require("express");

const {
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  updateProject
} = require("../controllers/projectController");
const {
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel
} = require("../controllers/labelController");
const {
  addMember,
  listMembers,
  removeMember,
  updateMemberRole
} = require("../controllers/projectMemberController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requirePermission, requireRule } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { labelSchemas, projectMemberSchemas, projectSchemas } = require("../validation/schemas");

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

router.get(
  "/:id/members",
  validate({ params: projectMemberSchemas.params }),
  asyncHandler(listMembers)
);
router.post(
  "/:id/members",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.params, body: projectMemberSchemas.add }),
  asyncHandler(addMember)
);
router.patch(
  "/:id/members/:userId",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.memberParams, body: projectMemberSchemas.updateRole }),
  asyncHandler(updateMemberRole)
);
router.delete(
  "/:id/members/:userId",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.memberParams }),
  asyncHandler(removeMember)
);

router.get("/:id/labels", validate({ params: labelSchemas.params }), asyncHandler(listLabels));
router.post(
  "/:id/labels",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.params, body: labelSchemas.create }),
  asyncHandler(createLabel)
);
router.put(
  "/:id/labels/:labelId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.labelParams, body: labelSchemas.update }),
  asyncHandler(updateLabel)
);
router.delete(
  "/:id/labels/:labelId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.labelParams }),
  asyncHandler(deleteLabel)
);

module.exports = router;
