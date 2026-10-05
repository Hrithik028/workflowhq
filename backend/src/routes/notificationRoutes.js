const express = require("express");
const { z } = require("zod");

const {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} = require("../controllers/notificationController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");

const router = express.Router();
router.use(authMiddleware);

router.get(
  "/",
  validate({
    query: z.object({
      unreadOnly: z.enum(["true", "false"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).max(100000).default(0)
    })
  }),
  asyncHandler(listNotifications)
);
router.post("/read-all", asyncHandler(markAllNotificationsRead));
router.post(
  "/:id/read",
  validate({ params: z.object({ id: z.coerce.number().int().positive() }) }),
  asyncHandler(markNotificationRead)
);

module.exports = router;
