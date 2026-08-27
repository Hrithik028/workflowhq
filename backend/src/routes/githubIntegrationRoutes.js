const express = require("express");

const {
  getIntegrationStatus,
  getTaskDevelopmentLinks,
  listRepositories,
  setRepositorySelection
} = require("../controllers/githubIntegrationController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requirePermission } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { githubIntegrationSchemas } = require("../validation/githubIntegrationSchemas");

const router = express.Router();
router.use(authMiddleware);

router.get("/status", asyncHandler(getIntegrationStatus));
router.get(
  "/repositories",
  validate({ query: githubIntegrationSchemas.repositoryListQuery }),
  asyncHandler(listRepositories)
);
router.put(
  "/repositories/:repositoryId/selection",
  asyncHandler(requirePermission("github.manage")),
  validate({
    params: githubIntegrationSchemas.repositoryParams,
    body: githubIntegrationSchemas.repositorySelection
  }),
  asyncHandler(setRepositorySelection)
);
router.get(
  "/tasks/:taskId/development",
  validate({ params: githubIntegrationSchemas.taskParams }),
  asyncHandler(getTaskDevelopmentLinks)
);

module.exports = router;
