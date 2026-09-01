const express = require("express");

const { receiveGithubWebhook } = require("../controllers/githubWebhookController");
const { asyncHandler } = require("../lib/asyncHandler");

const router = express.Router();

router.post(
  "/",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(receiveGithubWebhook)
);

module.exports = router;
