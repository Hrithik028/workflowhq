const express = require("express");

const authMiddleware = require("../middleware/authMiddleware");
const {
  getTasks,
  createTask,
  getTaskById,
  updateTask,
  deleteTask,
  getTaskStats
} = require("../controllers/taskController");

const router = express.Router();

router.use(authMiddleware);
router.get("/stats", getTaskStats);
router.get("/", getTasks);
router.post("/", createTask);
router.get("/:id", getTaskById);
router.put("/:id", updateTask);
router.delete("/:id", deleteTask);

module.exports = router;

