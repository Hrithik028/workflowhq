const express = require("express");

const {
  getCurrentUser,
  login,
  logout,
  refresh,
  register
} = require("../controllers/authController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { authSchemas } = require("../validation/schemas");

const router = express.Router();

router.post("/register", validate({ body: authSchemas.register }), asyncHandler(register));
router.post("/login", validate({ body: authSchemas.login }), asyncHandler(login));
router.post("/refresh", asyncHandler(refresh));
router.post("/logout", asyncHandler(logout));
router.get("/me", authMiddleware, asyncHandler(getCurrentUser));

module.exports = router;
