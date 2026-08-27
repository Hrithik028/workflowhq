import type {
  Activity,
  Project,
  ProjectInput,
  Task,
  TaskInput,
  TaskQuery,
  TaskStats,
  WorkspaceClient
} from "../types";

const now = new Date();
const isoMinutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const isoDaysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

let projects: Project[] = [
  {
    id: 1,
    userId: 1,
    key: "LAUNCH",
    name: "Product launch",
    description: "Coordinate the final work for the WorkflowHQ public launch.",
    taskCount: 4,
    completedCount: 1,
    createdAt: isoDaysAgo(18),
    updatedAt: isoMinutesAgo(8)
  },
  {
    id: 2,
    userId: 1,
    key: "MOBILE",
    name: "Mobile onboarding",
    description: "Refine the new-user journey across small screens.",
    taskCount: 3,
    completedCount: 1,
    createdAt: isoDaysAgo(12),
    updatedAt: isoDaysAgo(1)
  },
  {
    id: 3,
    userId: 1,
    key: "OPS",
    name: "Operations",
    description: "Recurring engineering and release readiness work.",
    taskCount: 2,
    completedCount: 1,
    createdAt: isoDaysAgo(30),
    updatedAt: isoDaysAgo(3)
  }
];

let tasks: Task[] = [
  {
    id: 1,
    userId: 1,
    projectId: 1,
    projectName: "Product launch",
    projectKey: "LAUNCH",
    issueKey: "LAUNCH-1",
    taskType: "epic",
    parentId: null,
    parentTitle: null,
    childCount: 3,
    completedChildCount: 1,
    title: "Finalize launch checklist",
    description: "Confirm owners, dependencies, and release-day handoff.",
    status: "todo",
    priority: "high",
    startDate: "2026-08-18",
    dueDate: "2026-08-24",
    createdAt: isoDaysAgo(5),
    updatedAt: isoMinutesAgo(18)
  },
  {
    id: 2,
    userId: 1,
    projectId: 2,
    projectName: "Mobile onboarding",
    projectKey: "MOBILE",
    issueKey: "MOBILE-2",
    taskType: "story",
    parentId: 8,
    parentTitle: "Map sign-up journey",
    childCount: 0,
    completedChildCount: 0,
    title: "Review empty states",
    description: "Make first-use states helpful without adding extra steps.",
    status: "todo",
    priority: "medium",
    startDate: "2026-08-21",
    dueDate: "2026-08-27",
    createdAt: isoDaysAgo(4),
    updatedAt: isoDaysAgo(1)
  },
  {
    id: 3,
    userId: 1,
    projectId: 1,
    projectName: "Product launch",
    projectKey: "LAUNCH",
    issueKey: "LAUNCH-3",
    taskType: "story",
    parentId: 1,
    parentTitle: "Finalize launch checklist",
    childCount: 0,
    completedChildCount: 0,
    title: "Write release notes",
    description: "Summarise the user-facing improvements in plain language.",
    status: "todo",
    priority: "low",
    startDate: "2026-08-23",
    dueDate: "2026-08-29",
    createdAt: isoDaysAgo(3),
    updatedAt: isoDaysAgo(2)
  },
  {
    id: 4,
    userId: 1,
    projectId: 1,
    projectName: "Product launch",
    projectKey: "LAUNCH",
    issueKey: "LAUNCH-4",
    taskType: "task",
    parentId: 1,
    parentTitle: "Finalize launch checklist",
    childCount: 0,
    completedChildCount: 0,
    title: "Run production smoke tests",
    description: "Verify auth, projects, task movement, and logout after deployment.",
    status: "in_progress",
    priority: "high",
    startDate: "2026-08-16",
    dueDate: "2026-08-22",
    createdAt: isoDaysAgo(6),
    updatedAt: isoMinutesAgo(8)
  },
  {
    id: 5,
    userId: 1,
    projectId: 2,
    projectName: "Mobile onboarding",
    projectKey: "MOBILE",
    issueKey: "MOBILE-5",
    taskType: "task",
    parentId: 8,
    parentTitle: "Map sign-up journey",
    childCount: 0,
    completedChildCount: 0,
    title: "Tighten mobile navigation",
    description: "Keep the main actions reachable at tablet and phone widths.",
    status: "in_progress",
    priority: "medium",
    startDate: "2026-08-19",
    dueDate: "2026-08-25",
    createdAt: isoDaysAgo(8),
    updatedAt: isoMinutesAgo(45)
  },
  {
    id: 6,
    userId: 1,
    projectId: 3,
    projectName: "Operations",
    projectKey: "OPS",
    issueKey: "OPS-6",
    taskType: "task",
    parentId: 9,
    parentTitle: "Define pull request checks",
    childCount: 0,
    completedChildCount: 0,
    title: "Configure deployment health check",
    description: "Use the API health route for service availability checks.",
    status: "in_progress",
    priority: "medium",
    startDate: "2026-08-20",
    dueDate: "2026-08-26",
    createdAt: isoDaysAgo(7),
    updatedAt: isoDaysAgo(1)
  },
  {
    id: 7,
    userId: 1,
    projectId: 1,
    projectName: "Product launch",
    projectKey: "LAUNCH",
    issueKey: "LAUNCH-7",
    taskType: "task",
    parentId: 1,
    parentTitle: "Finalize launch checklist",
    childCount: 0,
    completedChildCount: 0,
    title: "Add authorization coverage",
    description: "Verify one user cannot read or change another user's work.",
    status: "completed",
    priority: "high",
    startDate: "2026-08-13",
    dueDate: "2026-08-20",
    createdAt: isoDaysAgo(11),
    updatedAt: isoMinutesAgo(32)
  },
  {
    id: 8,
    userId: 1,
    projectId: 2,
    projectName: "Mobile onboarding",
    projectKey: "MOBILE",
    issueKey: "MOBILE-8",
    taskType: "epic",
    parentId: null,
    parentTitle: null,
    childCount: 2,
    completedChildCount: 0,
    title: "Map sign-up journey",
    description: "Document each step from registration to first task.",
    status: "completed",
    priority: "medium",
    startDate: "2026-08-04",
    dueDate: "2026-08-18",
    createdAt: isoDaysAgo(14),
    updatedAt: isoDaysAgo(2)
  },
  {
    id: 9,
    userId: 1,
    projectId: 3,
    projectName: "Operations",
    projectKey: "OPS",
    issueKey: "OPS-9",
    taskType: "epic",
    parentId: null,
    parentTitle: null,
    childCount: 1,
    completedChildCount: 0,
    title: "Define pull request checks",
    description: "Require linting, tests, type checking, and production builds.",
    status: "completed",
    priority: "low",
    startDate: "2026-08-01",
    dueDate: "2026-08-17",
    createdAt: isoDaysAgo(16),
    updatedAt: isoDaysAgo(3)
  }
];

let activities: Activity[] = [
  {
    id: 4,
    action: "task_status_changed",
    entityType: "task",
    entityId: 4,
    entityTitle: "Run production smoke tests",
    details: { from: "todo", to: "in_progress" },
    createdAt: isoMinutesAgo(8)
  },
  {
    id: 3,
    action: "task_created",
    entityType: "task",
    entityId: 1,
    entityTitle: "Finalize launch checklist",
    details: {},
    createdAt: isoMinutesAgo(18)
  },
  {
    id: 2,
    action: "task_completed",
    entityType: "task",
    entityId: 7,
    entityTitle: "Add authorization coverage",
    details: { from: "in_progress", to: "completed" },
    createdAt: isoMinutesAgo(32)
  },
  {
    id: 1,
    action: "project_created",
    entityType: "project",
    entityId: 1,
    entityTitle: "Product launch",
    details: {},
    createdAt: isoDaysAgo(18)
  }
];

const delay = () => new Promise((resolve) => setTimeout(resolve, 120));
const nextTaskId = () => Math.max(0, ...tasks.map((task) => task.id)) + 1;
const nextProjectId = () => Math.max(0, ...projects.map((project) => project.id)) + 1;
const nextActivityId = () => Math.max(0, ...activities.map((activity) => activity.id)) + 1;

const addActivity = (activity: Omit<Activity, "id" | "createdAt">) => {
  activities = [
    { ...activity, id: nextActivityId(), createdAt: new Date().toISOString() },
    ...activities
  ];
};

const refreshProjectCounts = () => {
  projects = projects.map((project) => ({
    ...project,
    taskCount: tasks.filter((task) => task.projectId === project.id).length,
    completedCount: tasks.filter(
      (task) => task.projectId === project.id && task.status === "completed"
    ).length
  }));
};

const refreshHierarchyMetadata = () => {
  tasks = tasks.map((task) => {
    const project = projects.find((item) => item.id === task.projectId);
    const parent = tasks.find((item) => item.id === task.parentId);
    const children = tasks.filter((item) => item.parentId === task.id);
    return {
      ...task,
      projectName: project?.name || null,
      projectKey: project?.key || null,
      parentTitle: parent?.title || null,
      childCount: children.length,
      completedChildCount: children.filter((item) => item.status === "completed").length
    };
  });
};

export const demoWorkspaceApi: WorkspaceClient = {
  async listProjects() {
    await delay();
    refreshProjectCounts();
    return projects.map((project) => ({ ...project }));
  },

  async createProject(input: ProjectInput) {
    await delay();
    const timestamp = new Date().toISOString();
    const project: Project = {
      id: nextProjectId(),
      userId: 1,
      ...input,
      taskCount: 0,
      completedCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    projects = [project, ...projects];
    addActivity({
      action: "project_created",
      entityType: "project",
      entityId: project.id,
      entityTitle: project.name,
      details: {}
    });
    return { ...project };
  },

  async updateProject(id: number, input: ProjectInput) {
    await delay();
    const project = projects.find((item) => item.id === id);
    if (!project) throw new Error("Project not found.");
    if (project.key !== input.key && project.taskCount > 0) {
      throw new Error("A project key cannot change after its first ticket is created.");
    }
    Object.assign(project, input, { updatedAt: new Date().toISOString() });
    refreshHierarchyMetadata();
    return { ...project };
  },

  async deleteProject(id: number) {
    await delay();
    const project = projects.find((item) => item.id === id);
    if (!project) throw new Error("Project not found.");
    projects = projects.filter((item) => item.id !== id);
    tasks = tasks.map((task) =>
      task.projectId === id
        ? { ...task, projectId: null, projectName: null, projectKey: null }
        : task
    );
    refreshHierarchyMetadata();
    addActivity({
      action: "project_deleted",
      entityType: "project",
      entityId: null,
      entityTitle: project.name,
      details: {}
    });
  },

  async listTasks(query: TaskQuery = {}) {
    await delay();
    let result = [...tasks];
    if (query.status) result = result.filter((task) => task.status === query.status);
    if (query.priority) result = result.filter((task) => task.priority === query.priority);
    if (query.projectId) result = result.filter((task) => task.projectId === query.projectId);
    if (query.search) {
      const search = query.search.toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search) ||
          task.issueKey.toLowerCase().includes(search)
      );
    }
    const sort = query.sort || "updated_at";
    const keyMap = {
      updated_at: "updatedAt",
      created_at: "createdAt",
      due_date: "dueDate",
      title: "title",
      priority: "priority"
    } as const;
    result.sort((left, right) =>
      String(left[keyMap[sort]] || "").localeCompare(String(right[keyMap[sort]] || ""))
    );
    if ((query.order || "desc") === "desc") result.reverse();
    const page = query.page || 1;
    const limit = query.limit || 100;
    const total = result.length;
    return {
      data: result.slice((page - 1) * limit, page * limit).map((task) => ({ ...task })),
      pagination: { page, limit, total, pages: total ? Math.ceil(total / limit) : 0 }
    };
  },

  async createTask(input: TaskInput) {
    await delay();
    const timestamp = new Date().toISOString();
    const project = projects.find((item) => item.id === input.projectId);
    const id = nextTaskId();
    const task: Task = {
      id,
      userId: 1,
      ...input,
      projectName: project?.name || null,
      projectKey: project?.key || null,
      issueKey: `${project?.key || "INB"}-${id}`,
      parentTitle: null,
      childCount: 0,
      completedChildCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    tasks = [task, ...tasks];
    refreshProjectCounts();
    refreshHierarchyMetadata();
    addActivity({
      action: "task_created",
      entityType: "task",
      entityId: task.id,
      entityTitle: task.title,
      details: {}
    });
    return { ...task };
  },

  async updateTask(id: number, input: TaskInput) {
    await delay();
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new Error("Task not found.");
    const previousStatus = task.status;
    const previousPriority = task.priority;
    const project = projects.find((item) => item.id === input.projectId);
    Object.assign(task, input, {
      projectName: project?.name || null,
      projectKey: project?.key || null,
      updatedAt: new Date().toISOString()
    });
    refreshProjectCounts();
    refreshHierarchyMetadata();
    if (previousStatus !== task.status) {
      addActivity({
        action: task.status === "completed" ? "task_completed" : "task_status_changed",
        entityType: "task",
        entityId: task.id,
        entityTitle: task.title,
        details: { from: previousStatus, to: task.status }
      });
    } else if (previousPriority !== task.priority) {
      addActivity({
        action: "task_priority_changed",
        entityType: "task",
        entityId: task.id,
        entityTitle: task.title,
        details: { from: previousPriority, to: task.priority }
      });
    } else {
      addActivity({
        action: "task_updated",
        entityType: "task",
        entityId: task.id,
        entityTitle: task.title,
        details: {}
      });
    }
    return { ...task };
  },

  async deleteTask(id: number) {
    await delay();
    const task = tasks.find((item) => item.id === id);
    if (!task) throw new Error("Task not found.");
    if (tasks.some((item) => item.parentId === id)) {
      throw new Error("Move or delete this task's children first.");
    }
    tasks = tasks.filter((item) => item.id !== id);
    refreshProjectCounts();
    refreshHierarchyMetadata();
    addActivity({
      action: "task_deleted",
      entityType: "task",
      entityId: null,
      entityTitle: task.title,
      details: {}
    });
  },

  async getStats(projectId?: number) {
    await delay();
    const scoped = projectId ? tasks.filter((task) => task.projectId === projectId) : tasks;
    const today = new Date().toISOString().slice(0, 10);
    const stats: TaskStats = {
      totalTasks: scoped.length,
      completedTasks: scoped.filter((task) => task.status === "completed").length,
      inProgressTasks: scoped.filter((task) => task.status === "in_progress").length,
      todoTasks: scoped.filter((task) => task.status === "todo").length,
      highPriorityTasks: scoped.filter((task) => task.priority === "high").length,
      overdueTasks: scoped.filter(
        (task) => task.dueDate && task.dueDate < today && task.status !== "completed"
      ).length
    };
    return stats;
  },

  async getActivity(limit = 12) {
    await delay();
    return activities.slice(0, limit).map((activity) => ({ ...activity }));
  }
};
