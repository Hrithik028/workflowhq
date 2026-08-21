const express = require("express");

const {
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  updateProject
} = require("../controllers/projectController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { projectSchemas } = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);

router.get("/", asyncHandler(getProjects));
router.post("/", validate({ body: projectSchemas.create }), asyncHandler(createProject));
router.get("/:id", validate({ params: projectSchemas.params }), asyncHandler(getProjectById));
router.put(
  "/:id",
  validate({ params: projectSchemas.params, body: projectSchemas.update }),
  asyncHandler(updateProject)
);
router.delete("/:id", validate({ params: projectSchemas.params }), asyncHandler(deleteProject));

module.exports = router;
