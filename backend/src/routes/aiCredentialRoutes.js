const express = require("express");

const {
  listCredentials,
  removeCredential,
  replaceCredential,
  saveCredential,
  validateCredential
} = require("../controllers/aiCredentialController");
const { asyncHandler } = require("../lib/asyncHandler");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { aiCredentialSchemas } = require("../validation/aiCredentialSchemas");

const router = express.Router();
router.use(authMiddleware);

router.get("/", asyncHandler(listCredentials));
router.post(
  "/validate",
  validate({ body: aiCredentialSchemas.credential }),
  asyncHandler(validateCredential)
);
router.post("/", validate({ body: aiCredentialSchemas.credential }), asyncHandler(saveCredential));
router.put(
  "/:provider",
  validate({ params: aiCredentialSchemas.providerParams, body: aiCredentialSchemas.replacement }),
  asyncHandler(replaceCredential)
);
router.delete(
  "/:provider",
  validate({ params: aiCredentialSchemas.providerParams }),
  asyncHandler(removeCredential)
);

module.exports = router;
