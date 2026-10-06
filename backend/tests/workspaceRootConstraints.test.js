const request = require("supertest");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

describe("mandatory workspace roots", () => {
  let app, db, first, second, project, installation, repository;
  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    first = await registerUser(app, "root-first");
    second = await registerUser(app, "root-second");
    project = (
      await request(app)
        .post("/api/projects")
        .set(auth(first.token))
        .send({ name: "Root", key: "ROOT" })
    ).body.data;
    installation = (
      await db.query(
        `INSERT INTO github_installations (user_id, workspace_id, github_installation_id, github_account_id, account_login, account_type, repository_selection)
      VALUES ($1,$2,801,901,'root','User','selected') RETURNING *`,
        [
          first.user.id,
          first.response.body.data.activeWorkspaceId ||
            (
              await db.query("SELECT id FROM workspaces WHERE personal_owner_id=$1", [
                first.user.id
              ])
            ).rows[0].id
        ]
      )
    ).rows[0];
    repository = (
      await db.query(
        `INSERT INTO github_repositories (user_id,workspace_id,installation_id,github_repository_id,github_node_id,owner_login,name,full_name,html_url)
      VALUES ($1,$2,$3,701,'R_701','root','repo','root/repo','https://github.com/root/repo') RETURNING *`,
        [first.user.id, installation.workspace_id, installation.id]
      )
    ).rows[0];
  });
  afterEach(async () => db.end());
  it("rejects missing project and task roots at the database boundary", async () => {
    await expect(
      db.query("INSERT INTO projects(user_id,key,name) VALUES($1,'BAD','Unscoped')", [
        first.user.id
      ])
    ).rejects.toThrow();
    await expect(
      db.query("INSERT INTO tasks(user_id,title) VALUES($1,'Unscoped')", [first.user.id])
    ).rejects.toThrow();
  });
  it("rejects repository and project links across tenants", async () => {
    const otherRoot = (
      await db.query("SELECT id FROM workspaces WHERE personal_owner_id=$1", [second.user.id])
    ).rows[0].id;
    await expect(
      db.query("UPDATE github_repositories SET workspace_id=$1 WHERE id=$2", [
        otherRoot,
        repository.id
      ])
    ).rejects.toThrow();
    await expect(
      db.query(
        "INSERT INTO project_github_repositories(repository_id,project_id,linked_by,workspace_id) VALUES($1,$2,$3,$4)",
        [repository.id, project.id, first.user.id, otherRoot]
      )
    ).rejects.toThrow();
  });
  it("writes refresh session roots atomically", async () => {
    const session = (
      await db.query("SELECT workspace_id FROM refresh_sessions WHERE user_id=$1", [first.user.id])
    ).rows[0];
    expect(Number(session.workspace_id)).toBe(Number(installation.workspace_id));
  });
});
