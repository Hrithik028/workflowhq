const express = require("express");

const {
  getIntegrationStatus,
  getCommandSummary,
  getTaskDevelopmentLinks,
  getProjectDevelopment,
  finishConnection,
  listRepositories,
  setRepositorySelection,
  startConnection,
  syncInstallation
} = require("../controllers/githubIntegrationController");
const {
  deleteGithubIdentity,
  listGithubIdentities,
  listWebhookFailures,
  redeliverWebhookFailure,
  setGithubIdentity
} = require("../controllers/githubOperationsController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requirePermission } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { githubIntegrationSchemas } = require("../validation/githubIntegrationSchemas");

const router = express.Router();
router.get(
  "/callback",
  validate({ query: githubIntegrationSchemas.callbackQuery }),
  asyncHandler(finishConnection)
);
router.use(authMiddleware);

router.post(
  "/connect",
  asyncHandler(requirePermission("github.manage")),
  asyncHandler(startConnection)
);
router.get("/status", asyncHandler(getIntegrationStatus));
router.get("/summary", asyncHandler(getCommandSummary));
router.get(
  "/identities",
  asyncHandler(requirePermission("github.manage")),
  asyncHandler(listGithubIdentities)
);
router.put(
  "/identities",
  asyncHandler(requirePermission("github.manage")),
  validate({ body: githubIntegrationSchemas.identityMapping }),
  asyncHandler(setGithubIdentity)
);
router.delete(
  "/identities/:mappingId",
  asyncHandler(requirePermission("github.manage")),
  validate({ params: githubIntegrationSchemas.identityParams }),
  asyncHandler(deleteGithubIdentity)
);
router.get(
  "/webhook-deliveries/failed",
  asyncHandler(requirePermission("github.manage")),
  asyncHandler(listWebhookFailures)
);
router.post(
  "/webhook-deliveries/:deliveryId/redeliver",
  asyncHandler(requirePermission("github.manage")),
  validate({ params: githubIntegrationSchemas.deliveryParams }),
  asyncHandler(redeliverWebhookFailure)
);
router.get(
  "/projects/:projectId/development",
  validate({ params: githubIntegrationSchemas.projectParams }),
  asyncHandler(getProjectDevelopment)
);
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
router.post(
  "/installations/:installationId/sync",
  asyncHandler(requirePermission("github.manage")),
  validate({ params: githubIntegrationSchemas.installationParams }),
  asyncHandler(syncInstallation)
);

module.exports = router;
