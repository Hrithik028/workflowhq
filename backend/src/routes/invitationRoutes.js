const express = require("express");

const {
  acceptInvitation,
  declineInvitation,
  inspectInvitation
} = require("../controllers/projectInvitationController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { invitationSchemas } = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);

router.post(
  "/inspect",
  validate({ body: invitationSchemas.token }),
  asyncHandler(inspectInvitation)
);
router.post(
  "/accept",
  validate({ body: invitationSchemas.token }),
  asyncHandler(acceptInvitation)
);
router.post(
  "/decline",
  validate({ body: invitationSchemas.token }),
  asyncHandler(declineInvitation)
);

module.exports = router;
