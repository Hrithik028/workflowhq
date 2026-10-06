const express = require("express");
const { applyAiPlan, previewAiPlan } = require("../controllers/aiPlannerController");
const {
  createConversation,
  discardProposal,
  getConversation,
  listConversations,
  runConversation
} = require("../controllers/aiConversationController");

const {
  archiveProject,
  createProject,
  deleteProject,
  getProjectById,
  getProjects,
  restoreProject,
  updateProject
} = require("../controllers/projectController");
const {
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel
} = require("../controllers/labelController");
const {
  addMember,
  listMembers,
  removeMember,
  updateMemberRole
} = require("../controllers/projectMemberController");
const {
  createProjectInvitation,
  listProjectInvitations,
  revokeProjectInvitation
} = require("../controllers/projectInvitationController");
const {
  getProjectWorkflow,
  updateProjectWorkflow
} = require("../controllers/projectWorkflowController");
const { applyJiraImport, previewJiraImport } = require("../controllers/jiraImportController");
const {
  createTaskDependency,
  deleteTaskDependency,
  listProjectRoadmap
} = require("../controllers/projectRoadmapController");
const {
  createSprint,
  deleteSprint,
  listSprints,
  updateSprint
} = require("../controllers/sprintController");
const { asyncHandler } = require("../lib/asyncHandler");
const { requirePermission, requireRule } = require("../middleware/accessControl");
const authMiddleware = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const {
  labelSchemas,
  dependencySchemas,
  invitationSchemas,
  projectMemberSchemas,
  projectSchemas,
  sprintSchemas,
  workflowSchemas
} = require("../validation/schemas");
const { aiConversationSchemas, aiPlannerSchemas } = require("../validation/aiPlannerSchemas");
const { jiraImportSchemas } = require("../validation/jiraImportSchemas");

const router = express.Router();
router.use(authMiddleware);

router.get("/", validate({ query: projectSchemas.list }), asyncHandler(getProjects));
router.post(
  "/",
  asyncHandler(requirePermission("projects.create")),
  validate({ body: projectSchemas.create }),
  asyncHandler(createProject)
);
router.get("/:id", validate({ params: projectSchemas.params }), asyncHandler(getProjectById));
router.get(
  "/:id/roadmap",
  validate({ params: dependencySchemas.params }),
  asyncHandler(listProjectRoadmap)
);
router.post(
  "/:id/dependencies",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: dependencySchemas.params, body: dependencySchemas.create }),
  asyncHandler(createTaskDependency)
);
router.delete(
  "/:id/dependencies/:blockerTaskId/:blockedTaskId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: dependencySchemas.edgeParams }),
  asyncHandler(deleteTaskDependency)
);
router.post(
  "/:id/jira-import/preview",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: jiraImportSchemas.params, body: jiraImportSchemas.preview }),
  asyncHandler(previewJiraImport)
);
router.post(
  "/:id/jira-import/apply",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: jiraImportSchemas.params, body: jiraImportSchemas.apply }),
  asyncHandler(applyJiraImport)
);
router.get(
  "/:id/ai-conversations",
  validate({ params: aiConversationSchemas.params }),
  asyncHandler(listConversations)
);
router.post(
  "/:id/ai-conversations",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: aiConversationSchemas.params, body: aiConversationSchemas.create }),
  asyncHandler(createConversation)
);
router.get(
  "/:id/ai-conversations/:conversationId",
  validate({ params: aiConversationSchemas.params }),
  asyncHandler(getConversation)
);
router.post(
  "/:id/ai-conversations/:conversationId/runs",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: aiConversationSchemas.params, body: aiConversationSchemas.run }),
  asyncHandler(runConversation)
);
router.post(
  "/:id/ai-conversations/:conversationId/proposals/:proposalId/discard",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: aiConversationSchemas.params }),
  asyncHandler(discardProposal)
);
router.post(
  "/:id/ai-plan/preview",
  asyncHandler(requirePermission("tasks.create")),
  validate({ params: aiPlannerSchemas.params, body: aiPlannerSchemas.preview }),
  asyncHandler(previewAiPlan)
);
router.post(
  "/:id/ai-plan/apply",
  validate({ params: aiPlannerSchemas.params, body: aiPlannerSchemas.apply }),
  asyncHandler(applyAiPlan)
);
router.put(
  "/:id",
  asyncHandler(requirePermission("projects.edit")),
  validate({ params: projectSchemas.params, body: projectSchemas.update }),
  asyncHandler(updateProject)
);
router.post(
  "/:id/archive",
  asyncHandler(requirePermission("projects.edit")),
  validate({ params: projectSchemas.params }),
  asyncHandler(archiveProject)
);
router.post(
  "/:id/restore",
  asyncHandler(requirePermission("projects.edit")),
  validate({ params: projectSchemas.params }),
  asyncHandler(restoreProject)
);
router.delete(
  "/:id",
  asyncHandler(requirePermission("projects.delete")),
  asyncHandler(requireRule("allow_project_deletion")),
  validate({ params: projectSchemas.params }),
  asyncHandler(deleteProject)
);

router.get(
  "/:id/workflow",
  validate({ params: workflowSchemas.params }),
  asyncHandler(getProjectWorkflow)
);
router.put(
  "/:id/workflow",
  asyncHandler(requirePermission("projects.edit")),
  validate({ params: workflowSchemas.params, body: workflowSchemas.update }),
  asyncHandler(updateProjectWorkflow)
);

router.get(
  "/:id/invitations",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: invitationSchemas.params }),
  asyncHandler(listProjectInvitations)
);
router.post(
  "/:id/invitations",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: invitationSchemas.params, body: invitationSchemas.create }),
  asyncHandler(createProjectInvitation)
);
router.delete(
  "/:id/invitations/:invitationId",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: invitationSchemas.invitationParams }),
  asyncHandler(revokeProjectInvitation)
);

router.get(
  "/:id/members",
  validate({ params: projectMemberSchemas.params }),
  asyncHandler(listMembers)
);
router.post(
  "/:id/members",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.params, body: projectMemberSchemas.add }),
  asyncHandler(addMember)
);
router.patch(
  "/:id/members/:userId",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.memberParams, body: projectMemberSchemas.updateRole }),
  asyncHandler(updateMemberRole)
);
router.delete(
  "/:id/members/:userId",
  asyncHandler(requirePermission("projects.members")),
  validate({ params: projectMemberSchemas.memberParams }),
  asyncHandler(removeMember)
);

router.get("/:id/labels", validate({ params: labelSchemas.params }), asyncHandler(listLabels));
router.post(
  "/:id/labels",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.params, body: labelSchemas.create }),
  asyncHandler(createLabel)
);
router.put(
  "/:id/labels/:labelId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.labelParams, body: labelSchemas.update }),
  asyncHandler(updateLabel)
);
router.delete(
  "/:id/labels/:labelId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: labelSchemas.labelParams }),
  asyncHandler(deleteLabel)
);

router.get("/:id/sprints", validate({ params: sprintSchemas.params }), asyncHandler(listSprints));
router.post(
  "/:id/sprints",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: sprintSchemas.params, body: sprintSchemas.create }),
  asyncHandler(createSprint)
);
router.put(
  "/:id/sprints/:sprintId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: sprintSchemas.sprintParams, body: sprintSchemas.update }),
  asyncHandler(updateSprint)
);
router.delete(
  "/:id/sprints/:sprintId",
  asyncHandler(requirePermission("tasks.edit")),
  validate({ params: sprintSchemas.sprintParams }),
  asyncHandler(deleteSprint)
);

module.exports = router;
