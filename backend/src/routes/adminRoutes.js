const express = require("express");

const {
  getAdminOverview,
  transferPlatformOwnership,
  updateUserAccess,
  updateWorkspaceRules
} = require("../controllers/adminController");
const {
  getAiGovernance,
  updateAiGovernanceSettings
} = require("../controllers/aiGovernanceController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requireAdmin, requirePlatformOwner } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { adminSchemas } = require("../validation/adminSchemas");

const router = express.Router();
router.use(authMiddleware, asyncHandler(requireAdmin));

router.get("/overview", asyncHandler(getAdminOverview));
router.get("/ai-governance", asyncHandler(requirePlatformOwner), asyncHandler(getAiGovernance));
router.put(
  "/ai-governance",
  asyncHandler(requirePlatformOwner),
  validate({ body: adminSchemas.aiGovernance }),
  asyncHandler(updateAiGovernanceSettings)
);
router.post(
  "/platform-owner/transfer",
  asyncHandler(requirePlatformOwner),
  validate({ body: adminSchemas.ownershipTransfer }),
  asyncHandler(transferPlatformOwnership)
);
router.put(
  "/users/:id/access",
  validate({ params: adminSchemas.userParams, body: adminSchemas.userAccess }),
  asyncHandler(updateUserAccess)
);
router.put("/rules", validate({ body: adminSchemas.rules }), asyncHandler(updateWorkspaceRules));

module.exports = router;
