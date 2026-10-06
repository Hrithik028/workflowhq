const fs = require("node:fs");
const path = require("node:path");

const { newDb } = require("pg-mem");
const request = require("supertest");

const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("workspace foundation", () => {
  it("lists only joined workspaces and filters projects without revealing other workspaces", async () => {
    const { app, db } = await buildTestApp();
    try {
      const owner = await registerUser(app, "workspace-list-owner");
      const other = await registerUser(app, "workspace-list-other");
      const created = await request(app)
        .post("/api/projects")
        .set(auth(owner.token))
        .send({ key: "SPACE", name: "Private project" });
      expect(created.status).toBe(201);
      const workspaceId = created.body.data.workspace_id;

      const ownerWorkspaces = await request(app).get("/api/workspaces").set(auth(owner.token));
      expect(ownerWorkspaces.status).toBe(200);
      expect(ownerWorkspaces.body.data).toEqual([
        expect.objectContaining({ id: workspaceId, my_role: "owner", my_project_count: 1 })
      ]);

      const privateWorkspace = await request(app).get("/api/workspaces").set(auth(other.token));
      expect(privateWorkspace.status).toBe(200);
      expect(privateWorkspace.body.data).toHaveLength(1);
      expect(privateWorkspace.body.data[0].id).not.toBe(workspaceId);

      const hiddenProjects = await request(app)
        .get(`/api/projects?workspaceId=${workspaceId}`)
        .set(auth(other.token));
      expect(hiddenProjects.status).toBe(404);
      expect(hiddenProjects.body.error.code).toBe("WORKSPACE_NOT_FOUND");

      const missingWorkspace = await request(app)
        .get("/api/projects?workspaceId=999999")
        .set(auth(other.token));
      expect(missingWorkspace.status).toBe(404);
      expect(missingWorkspace.body.error.code).toBe("WORKSPACE_NOT_FOUND");

      const scopedProjects = await request(app)
        .get(`/api/projects?workspaceId=${workspaceId}`)
        .set(auth(owner.token));
      expect(scopedProjects.status).toBe(200);
      expect(scopedProjects.body.data.map((project) => project.id)).toEqual([created.body.data.id]);

      const invited = await request(app)
        .post(`/api/projects/${created.body.data.id}/members`)
        .set(auth(owner.token))
        .send({ email: other.user.email, role: "viewer" });
      expect(invited.status).toBe(202);
      const collaboratorWorkspaces = await request(app)
        .get("/api/workspaces")
        .set(auth(other.token));
      expect(collaboratorWorkspaces.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: workspaceId, my_role: "member", my_project_count: 1 })
        ])
      );
      const collaboratorProjects = await request(app)
        .get(`/api/projects?workspaceId=${workspaceId}`)
        .set(auth(other.token));
      expect(collaboratorProjects.status).toBe(200);
      expect(collaboratorProjects.body.data).toHaveLength(1);

      await request(app)
        .delete(`/api/projects/${created.body.data.id}/members/${other.user.id}`)
        .set(auth(owner.token));
      const afterRevocation = await request(app)
        .get(`/api/projects?workspaceId=${workspaceId}`)
        .set(auth(other.token));
      expect(afterRevocation.status).toBe(404);
    } finally {
      await db.end();
    }
  });

  it("creates one personal workspace and assigns new projects to it", async () => {
    const { app, db } = await buildTestApp();
    try {
      const user = await registerUser(app, "workspace-owner");
      const workspace = (
        await db.query(
          `SELECT w.id, w.slug, wm.role FROM workspaces w
           JOIN workspace_members wm ON wm.workspace_id = w.id
           WHERE w.personal_owner_id = $1 AND wm.user_id = $1`,
          [user.user.id]
        )
      ).rows[0];
      expect(workspace.slug).toBe(`personal-${user.user.id}`);
      expect(workspace.role).toBe("owner");

      const created = await request(app)
        .post("/api/projects")
        .set(auth(user.token))
        .send({ key: "SPACE", name: "Workspace project", description: "" });
      expect(created.status).toBe(201);
      const project = (
        await db.query("SELECT workspace_id FROM projects WHERE id = $1", [created.body.data.id])
      ).rows[0];
      expect(Number(project.workspace_id)).toBe(Number(workspace.id));
      const collaborator = await registerUser(app, "workspace-collaborator");
      const invited = await request(app)
        .post(`/api/projects/${created.body.data.id}/members`)
        .set(auth(user.token))
        .send({ email: collaborator.user.email, role: "editor" });
      expect(invited.status).toBe(202);
      const membership = (
        await db.query(
          "SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [workspace.id, collaborator.user.id]
        )
      ).rows[0];
      expect(membership.role).toBe("member");
      const removed = await request(app)
        .delete(`/api/projects/${created.body.data.id}/members/${collaborator.user.id}`)
        .set(auth(user.token));
      expect(removed.status).toBe(204);
      const released = (
        await db.query(
          "SELECT COUNT(*)::int AS count FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [workspace.id, collaborator.user.id]
        )
      ).rows[0];
      expect(released.count).toBe(0);
      await request(app)
        .post(`/api/projects/${created.body.data.id}/members`)
        .set(auth(user.token))
        .send({ email: collaborator.user.email, role: "editor" });
      const deleted = await request(app)
        .delete(`/api/projects/${created.body.data.id}`)
        .set(auth(user.token));
      expect(deleted.status).toBe(204);
      const afterProjectDeletion = (
        await db.query(
          "SELECT COUNT(*)::int AS count FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
          [workspace.id, collaborator.user.id]
        )
      ).rows[0];
      expect(afterProjectDeletion.count).toBe(0);
      expect(
        (
          await db.query(
            "SELECT COUNT(*)::int AS count FROM workspaces WHERE personal_owner_id = $1",
            [user.user.id]
          )
        ).rows[0].count
      ).toBe(1);
    } finally {
      await db.end();
    }
  });

  it("backfills existing owners, collaborators, and projects without promoting collaborators", async () => {
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
    const adapter = memoryDb.adapters.createPg();
    const db = new adapter.Pool();
    try {
      const migrationsDirectory = path.resolve(__dirname, "../migrations");
      const files = fs
        .readdirSync(migrationsDirectory)
        .filter((file) => file.endsWith(".sql"))
        .sort();
      for (const file of files.filter((name) => name < "033_workspace_foundation.sql")) {
        await db.query(
          fs
            .readFileSync(path.join(migrationsDirectory, file), "utf8")
            .replaceAll("TIMESTAMPTZ", "TIMESTAMP")
        );
      }
      const owner = (
        await db.query(
          "INSERT INTO users (name, email, password_hash) VALUES ('Owner', 'owner@test.example', 'hash') RETURNING id"
        )
      ).rows[0];
      const collaborator = (
        await db.query(
          "INSERT INTO users (name, email, password_hash) VALUES ('Editor', 'editor@test.example', 'hash') RETURNING id"
        )
      ).rows[0];
      const project = (
        await db.query(
          "INSERT INTO projects (user_id, key, name) VALUES ($1, 'EXIST', 'Existing') RETURNING id",
          [owner.id]
        )
      ).rows[0];
      await db.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'editor')",
        [project.id, owner.id, collaborator.id]
      );
      await db.query(
        fs
          .readFileSync(path.join(migrationsDirectory, "033_workspace_foundation.sql"), "utf8")
          .replaceAll("TIMESTAMPTZ", "TIMESTAMP")
      );
      const roles = (
        await db.query(
          `SELECT wm.user_id, wm.role, p.workspace_id
         FROM projects p JOIN workspace_members wm ON wm.workspace_id = p.workspace_id
         WHERE p.id = $1 ORDER BY wm.user_id`,
          [project.id]
        )
      ).rows;
      expect(roles).toEqual([
        expect.objectContaining({ user_id: owner.id, role: "owner" }),
        expect.objectContaining({ user_id: collaborator.id, role: "member" })
      ]);
    } finally {
      await db.end();
    }
  });
});
