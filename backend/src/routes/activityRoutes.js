const express = require("express");

const { getActivity } = require("../controllers/activityController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { activitySchemas } = require("../validation/schemas");

const router = express.Router();
router.use(authMiddleware);
router.get("/", validate({ query: activitySchemas.list }), asyncHandler(getActivity));

module.exports = router;
