const express = require("express");

const {
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  verifyEmail
} = require("../controllers/accountRecoveryController");

const {
  getCurrentUser,
  listSessions,
  login,
  logout,
  refresh,
  register,
  revokeAllSessions,
  revokeSession
} = require("../controllers/authController");
const { asyncHandler } = require("../lib/asyncHandler");
const {
  disableMfa,
  enableMfa,
  getMfaStatus,
  startMfaSetup,
  verifyMfaLogin
} = require("../controllers/mfaController");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { authSchemas } = require("../validation/schemas");

const router = express.Router();

router.post("/register", validate({ body: authSchemas.register }), asyncHandler(register));
router.post("/login", validate({ body: authSchemas.login }), asyncHandler(login));
router.post(
  "/email-verification/request",
  validate({ body: authSchemas.emailRequest }),
  asyncHandler(requestEmailVerification)
);
router.post(
  "/email-verification/verify",
  validate({ body: authSchemas.accountToken }),
  asyncHandler(verifyEmail)
);
router.post(
  "/password-reset/request",
  validate({ body: authSchemas.emailRequest }),
  asyncHandler(requestPasswordReset)
);
router.post(
  "/password-reset/confirm",
  validate({ body: authSchemas.passwordReset }),
  asyncHandler(resetPassword)
);
router.post("/mfa/verify", validate({ body: authSchemas.mfaLogin }), asyncHandler(verifyMfaLogin));
router.post("/refresh", asyncHandler(refresh));
router.post("/logout", asyncHandler(logout));
router.get("/me", authMiddleware, asyncHandler(getCurrentUser));
router.get("/mfa", authMiddleware, asyncHandler(getMfaStatus));
router.post(
  "/mfa/setup",
  authMiddleware,
  validate({ body: authSchemas.mfaSetup }),
  asyncHandler(startMfaSetup)
);
router.post(
  "/mfa/enable",
  authMiddleware,
  validate({ body: authSchemas.mfaCode }),
  asyncHandler(enableMfa)
);
router.post(
  "/mfa/disable",
  authMiddleware,
  validate({ body: authSchemas.mfaDisable }),
  asyncHandler(disableMfa)
);
router.get("/sessions", authMiddleware, asyncHandler(listSessions));
router.delete(
  "/sessions/:id",
  authMiddleware,
  validate({ params: authSchemas.sessionParams }),
  asyncHandler(revokeSession)
);
router.delete("/sessions", authMiddleware, asyncHandler(revokeAllSessions));

module.exports = router;
