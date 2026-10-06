const express = require("express");
const {
  createWorkspace,
  getSettings,
  listMembers,
  listWorkspaces,
  removeMember,
  saveAiPolicy,
  saveMember,
  saveSettings,
  switchWorkspace,
  transferOwnership
} = require("../controllers/workspaceController");
const { workspaceAiPolicySchema } = require("../lib/workspaceAiPolicy");
const { z } = require("zod");
const { validate } = require("../middleware/validate");
const { adminSchemas } = require("../validation/adminSchemas");
const { AppError } = require("../lib/errors");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
router.use(authMiddleware);
router.get("/", asyncHandler(listWorkspaces));
router.use((req, _res, next) =>
  req.app.locals.config.workspacesEnabled
    ? next()
    : next(new AppError(503, "WORKSPACES_DISABLED", "Workspace management is not enabled."))
);
const params = z.object({ id: z.coerce.number().int().positive() });
router.post(
  "/",
  validate({ body: z.object({ name: z.string().trim().min(1).max(120) }).strict() }),
  asyncHandler(createWorkspace)
);
router.post("/:id/switch", validate({ params }), asyncHandler(switchWorkspace));
router.post(
  "/:id/ownership",
  validate({
    params,
    body: z
      .object({
        targetUserId: z.number().int().positive(),
        password: z.string().min(8).max(200),
        recovery: z.boolean().default(false)
      })
      .strict()
  }),
  asyncHandler(transferOwnership)
);
router.get("/:id/members", validate({ params }), asyncHandler(listMembers));
router.put(
  "/:id/members",
  validate({
    params,
    body: z
      .object({
        email: z
          .string()
          .trim()
          .email()
          .transform((value) => value.toLowerCase()),
        role: z.enum(["admin", "member"])
      })
      .strict()
  }),
  asyncHandler(saveMember)
);
router.delete(
  "/:id/members/:userId",
  validate({ params: params.extend({ userId: z.coerce.number().int().positive() }) }),
  asyncHandler(removeMember)
);
router.get("/:id/settings", validate({ params }), asyncHandler(getSettings));
router.put(
  "/:id/settings",
  validate({ params, body: adminSchemas.rules }),
  asyncHandler(saveSettings)
);
router.put(
  "/:id/ai-policy",
  validate({ params, body: workspaceAiPolicySchema }),
  asyncHandler(saveAiPolicy)
);

module.exports = router;
