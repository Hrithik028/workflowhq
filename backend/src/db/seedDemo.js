require("dotenv").config();

const bcrypt = require("bcrypt");

const pool = require("../config/db");

const resolveDemoUser = (environment = process.env) => {
  const isProduction = environment.NODE_ENV === "production";
  if (isProduction && environment.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seeding is disabled in production. Set ALLOW_DEMO_SEED=true explicitly.");
  }

  if (
    isProduction &&
    (!environment.DEMO_USER_NAME || !environment.DEMO_USER_EMAIL || !environment.DEMO_USER_PASSWORD)
  ) {
    throw new Error(
      "Production demo seeding requires explicit DEMO_USER_NAME, EMAIL, and PASSWORD."
    );
  }

  return {
    name: environment.DEMO_USER_NAME || "WorkflowHQ Demo",
    email: (environment.DEMO_USER_EMAIL || "demo@workflowhq.app").toLowerCase(),
    password: environment.DEMO_USER_PASSWORD || "WorkflowHQ!2026"
  };
};

// Unlike the primary demo user, the collaborator is a nice-to-have (shows off
// multi-member projects) rather than the account people actually sign in
// with, so in production we skip it entirely instead of failing the whole
// seed run when no override is set - but its password must be just as
// unguessable as the primary account's whenever it does get created.
const resolveCollaborator = (environment = process.env) => {
  const isProduction = environment.NODE_ENV === "production";
  if (isProduction && !environment.DEMO_COLLABORATOR_PASSWORD) {
    return null;
  }
  return {
    name: environment.DEMO_COLLABORATOR_NAME || "WorkflowHQ Collaborator",
    email: (environment.DEMO_COLLABORATOR_EMAIL || "demo-collaborator@workflowhq.app").toLowerCase(),
    password: environment.DEMO_COLLABORATOR_PASSWORD || "WorkflowHQ!2026"
  };
};

const dateFromToday = (days) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isoHoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();

const projectFixtures = [
  {
    key: "launch",
    projectKey: "WHQ",
    name: "WorkflowHQ launch",
    description: "Coordinate the final product, quality, and storytelling work for launch."
  },
  {
    key: "portfolio",
    projectKey: "PORT",
    name: "Portfolio refresh",
    description: "Turn the build into a clear, evidence-led portfolio case study."
  },
  {
    key: "analytics",
    projectKey: "DATA",
    name: "Analytics sprint",
    description: "Define meaningful product signals and make delivery health visible."
  },
  {
    key: "operations",
    projectKey: "OPS",
    name: "Operations rhythm",
    description: "Keep releases, backups, documentation, and recurring checks reliable."
  }
];

const taskFixtures = [
  {
    project: "launch",
    title: "Finalise launch checklist",
    description: "Confirm owners, dependencies, rollback notes, and the release-day handoff.",
    status: "todo",
    priority: "high",
    dueInDays: 2,
    updatedHoursAgo: 1
  },
  {
    project: "portfolio",
    title: "Write recruiter-ready case study",
    description: "Explain the problem, key product decisions, architecture, and verified outcome.",
    status: "todo",
    priority: "medium",
    dueInDays: 5,
    updatedHoursAgo: 2
  },
  {
    project: "launch",
    title: "Validate mobile keyboard flow",
    description: "Check every modal and board action at phone width using keyboard navigation.",
    status: "todo",
    priority: "high",
    dueInDays: 1,
    updatedHoursAgo: 3
  },
  {
    project: "analytics",
    title: "Plan user feedback interviews",
    description: "Prepare five focused questions about prioritisation and daily planning habits.",
    status: "todo",
    priority: "medium",
    dueInDays: 7,
    updatedHoursAgo: 6
  },
  {
    project: "launch",
    title: "Close accessibility contrast review",
    description: "Resolve the remaining muted-text and focus-ring contrast findings.",
    status: "todo",
    priority: "high",
    dueInDays: -2,
    updatedHoursAgo: 8
  },
  {
    project: "portfolio",
    title: "Audit dashboard empty states",
    description: "Make first-use screens helpful while preserving the product's calm tone.",
    status: "todo",
    priority: "low",
    dueInDays: 9,
    updatedHoursAgo: 12
  },
  {
    project: "launch",
    title: "Ship production auth hardening",
    description: "Finish rotating refresh sessions, cookie policy, and user-isolation checks.",
    status: "in_progress",
    priority: "high",
    dueInDays: 0,
    updatedHoursAgo: 0.15
  },
  {
    project: "launch",
    title: "Polish onboarding motion",
    description: "Add purposeful movement to the sign-in story with reduced-motion fallbacks.",
    status: "in_progress",
    priority: "medium",
    dueInDays: 3,
    updatedHoursAgo: 0.5
  },
  {
    project: "analytics",
    title: "Build delivery metrics view",
    description: "Surface completion, active work, high priority items, and overdue risk.",
    status: "in_progress",
    priority: "high",
    dueInDays: 4,
    updatedHoursAgo: 1.5
  },
  {
    project: "portfolio",
    title: "Prepare launch screenshots",
    description: "Capture the login, populated workspace, project view, and mobile board.",
    status: "in_progress",
    priority: "medium",
    dueInDays: 2,
    updatedHoursAgo: 2.5
  },
  {
    project: "operations",
    title: "Automate database backups",
    description: "Document a tested backup and restore path before public deployment.",
    status: "in_progress",
    priority: "medium",
    dueInDays: 6,
    updatedHoursAgo: 4
  },
  {
    project: "analytics",
    title: "Reconcile analytics event names",
    description: "Align product events with the reporting vocabulary used in the case study.",
    status: "in_progress",
    priority: "low",
    dueInDays: -1,
    updatedHoursAgo: 7
  },
  {
    project: "operations",
    title: "Add CI quality gates",
    description: "Require linting, tests, type checking, production builds, and security audits.",
    status: "completed",
    priority: "high",
    dueInDays: -1,
    updatedHoursAgo: 0.4
  },
  {
    project: "launch",
    title: "Create responsive Kanban board",
    description: "Deliver clear task movement across desktop, tablet, and phone layouts.",
    status: "completed",
    priority: "high",
    dueInDays: -2,
    updatedHoursAgo: 5
  },
  {
    project: "analytics",
    title: "Implement project-level filters",
    description: "Let people narrow the board without losing context or useful totals.",
    status: "completed",
    priority: "medium",
    dueInDays: -3,
    updatedHoursAgo: 9
  },
  {
    project: "operations",
    title: "Document local Docker setup",
    description: "Provide one dependable path for running the frontend, API, and PostgreSQL.",
    status: "completed",
    priority: "low",
    dueInDays: -4,
    updatedHoursAgo: 15
  },
  {
    project: "launch",
    title: "Add refresh token rotation",
    description: "Use hashed sessions and short-lived access tokens for safer authentication.",
    status: "completed",
    priority: "high",
    dueInDays: -5,
    updatedHoursAgo: 20
  },
  {
    project: "operations",
    title: "Validate PostgreSQL migrations",
    description: "Run every migration against a clean database and verify query indexes.",
    status: "completed",
    priority: "medium",
    dueInDays: -6,
    updatedHoursAgo: 28
  }
];

const activityFixtures = [
  {
    action: "task_status_changed",
    entityType: "task",
    title: "Ship production auth hardening",
    details: { from: "todo", to: "in_progress" },
    hoursAgo: 0.15
  },
  {
    action: "task_completed",
    entityType: "task",
    title: "Add CI quality gates",
    details: { from: "in_progress", to: "completed" },
    hoursAgo: 0.4
  },
  {
    action: "task_priority_changed",
    entityType: "task",
    title: "Validate mobile keyboard flow",
    details: { from: "medium", to: "high" },
    hoursAgo: 0.7
  },
  {
    action: "task_updated",
    entityType: "task",
    title: "Polish onboarding motion",
    details: {},
    hoursAgo: 1.2
  },
  {
    action: "task_created",
    entityType: "task",
    title: "Write recruiter-ready case study",
    details: {},
    hoursAgo: 2
  },
  {
    action: "project_created",
    entityType: "project",
    title: "Analytics sprint",
    details: {},
    hoursAgo: 5
  },
  {
    action: "task_completed",
    entityType: "task",
    title: "Create responsive Kanban board",
    details: { from: "in_progress", to: "completed" },
    hoursAgo: 9
  },
  {
    action: "project_created",
    entityType: "project",
    title: "WorkflowHQ launch",
    details: {},
    hoursAgo: 18
  }
];

const seedDemo = async (db = pool) => {
  const demoUser = resolveDemoUser();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const passwordHash = await bcrypt.hash(demoUser.password, 12);
    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [demoUser.name, demoUser.email, passwordHash]
    );
    const userId = userResult.rows[0].id;

    await client.query("DELETE FROM activities WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM tasks WHERE user_id = $1", [userId]);
    await client.query("DELETE FROM projects WHERE user_id = $1", [userId]);

    const projectIds = new Map();
    for (const fixture of projectFixtures) {
      const result = await client.query(
        `INSERT INTO projects (user_id, key, name, description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING id`,
        [userId, fixture.projectKey, fixture.name, fixture.description, isoHoursAgo(96)]
      );
      projectIds.set(fixture.key, result.rows[0].id);
      // The demo user's projects are re-inserted (not just updated) on every
      // reseed, so the one-time migration backfill never covers these rows -
      // without this insert the demo user would lose access to their own projects.
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, created_at)
         VALUES ($1, $2, 'owner', $3)
         ON CONFLICT (project_id, user_id) DO NOTHING`,
        [result.rows[0].id, userId, isoHoursAgo(96)]
      );
    }

    // Seed a second lightweight collaborator so the "portfolio" project has a
    // real multi-member setup to demo/test against without manual setup.
    const collaborator = resolveCollaborator();
    if (collaborator) {
      const collaboratorPasswordHash = await bcrypt.hash(collaborator.password, 12);
      const collaboratorResult = await client.query(
        `INSERT INTO users (name, email, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
         RETURNING id`,
        [collaborator.name, collaborator.email, collaboratorPasswordHash]
      );
      const collaboratorId = collaboratorResult.rows[0].id;
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, invited_by, created_at)
         VALUES ($1, $2, 'editor', $3, $4)
         ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [projectIds.get("portfolio"), collaboratorId, userId, isoHoursAgo(90)]
      );
    }

    const entityIds = new Map();
    for (const fixture of taskFixtures) {
      const timestamp = isoHoursAgo(fixture.updatedHoursAgo);
      const result = await client.query(
        `INSERT INTO tasks
           (user_id, project_id, title, description, status, priority, due_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
         RETURNING id`,
        [
          userId,
          projectIds.get(fixture.project),
          fixture.title,
          fixture.description,
          fixture.status,
          fixture.priority,
          dateFromToday(fixture.dueInDays),
          timestamp
        ]
      );
      await client.query("UPDATE tasks SET issue_key = $1 WHERE id = $2", [
        `${projectFixtures.find((project) => project.key === fixture.project).projectKey}-${result.rows[0].id}`,
        result.rows[0].id
      ]);
      entityIds.set(`task:${fixture.title}`, result.rows[0].id);
    }

    for (const fixture of projectFixtures) {
      entityIds.set(`project:${fixture.name}`, projectIds.get(fixture.key));
    }

    for (const fixture of activityFixtures) {
      await client.query(
        `INSERT INTO activities
           (user_id, action, entity_type, entity_id, entity_title, details, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userId,
          fixture.action,
          fixture.entityType,
          entityIds.get(`${fixture.entityType}:${fixture.title}`),
          fixture.title,
          JSON.stringify(fixture.details),
          isoHoursAgo(fixture.hoursAgo)
        ]
      );
    }

    await client.query("COMMIT");
    return {
      email: demoUser.email,
      projects: projectFixtures.length,
      tasks: taskFixtures.length
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  seedDemo()
    .then(async ({ email, projects, tasks }) => {
      process.stdout.write(`Seeded ${projects} projects and ${tasks} tasks for ${email}.\n`);
      await pool.end();
    })
    .catch(async (error) => {
      process.stderr.write(`Demo seed failed: ${error.message}\n`);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { resolveDemoUser, seedDemo };
