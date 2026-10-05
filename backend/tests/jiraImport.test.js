const request = require("supertest");

const { parseJiraCsv } = require("../src/lib/jiraCsv");
const { auth, buildTestApp, registerUser } = require("./helpers/testApp");

const csv = `Issue key,Summary,Description,Issue Type,Status,Priority,Due Date\nTEAM-1,"Fix login, then test","Description with\na newline",Bug,In Progress,High,2026-11-01\nTEAM-2,Plan rollout,,Epic,To Do,Low,\n`;

describe("Jira CSV parser", () => {
  it("reads quoted commas and newlines and normalizes supported fields", () => {
    expect(parseJiraCsv(csv, "TEAM")).toMatchObject([
      {
        sourceKey: "TEAM-1",
        title: "Fix login, then test",
        taskType: "bug",
        status: "in_progress",
        priority: "high"
      },
      { sourceKey: "TEAM-2", taskType: "epic", status: "todo", priority: "low" }
    ]);
  });

  it("rejects other project keys and duplicate rows", () => {
    expect(() => parseJiraCsv(csv.replace("TEAM-1", "OTHER-1"), "TEAM")).toThrow();
    expect(() => parseJiraCsv(csv.replace("TEAM-2", "TEAM-1"), "TEAM")).toThrow();
  });
});

describe("Jira one-time import", () => {
  let app;
  let db;
  let owner;
  let outsider;
  let projectId;

  beforeEach(async () => {
    ({ app, db } = await buildTestApp());
    owner = await registerUser(app, "jira-owner");
    outsider = await registerUser(app, "jira-outsider");
    const project = await request(app)
      .post("/api/projects")
      .set(auth(owner.token))
      .send({ key: "WHQ", name: "Import destination", description: "" });
    projectId = project.body.data.id;
  });

  afterEach(async () => {
    await db.end();
  });

  const preview = (token, input = {}) =>
    request(app)
      .post(`/api/projects/${projectId}/jira-import/preview`)
      .set(auth(token))
      .send({ siteUrl: "https://team.atlassian.net", jiraProjectKey: "TEAM", csv, ...input });

  it("requires project ownership and rejects non-Cloud site URLs", async () => {
    expect((await preview(outsider.token)).status).toBe(404);
    expect((await preview(owner.token, { siteUrl: "http://localhost:8080" })).status).toBe(400);
  });

  it("previews and imports selected issues once with stable mappings and an audit summary", async () => {
    const reviewed = await preview(owner.token);
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.issues).toHaveLength(2);
    expect((await db.query("SELECT COUNT(*)::int AS count FROM tasks")).rows[0].count).toBe(0);
    const applied = await request(app)
      .post(`/api/projects/${projectId}/jira-import/apply`)
      .set(auth(owner.token))
      .send({ previewId: reviewed.body.data.previewId, issueKeys: ["TEAM-1"], csv });
    expect(applied.status).toBe(200);
    expect(applied.body.data.imported).toMatchObject([{ sourceKey: "TEAM-1" }]);
    expect(
      (await db.query("SELECT COUNT(*)::int AS count FROM jira_issue_mappings")).rows[0].count
    ).toBe(1);
    expect(
      (await db.query("SELECT action FROM activities WHERE action = 'jira_import_applied'")).rows
    ).toHaveLength(1);
    expect(
      (
        await request(app)
          .post(`/api/projects/${projectId}/jira-import/apply`)
          .set(auth(owner.token))
          .send({ previewId: reviewed.body.data.previewId, issueKeys: ["TEAM-1"], csv })
      ).status
    ).toBe(409);
    const again = await preview(owner.token);
    expect(again.body.data.issues[0].alreadyImported).toBe(true);
  });

  it("rejects changed CSV and another user's attempt to apply the owner's preview", async () => {
    const reviewed = await preview(owner.token);
    const applyPath = `/api/projects/${projectId}/jira-import/apply`;
    const input = { previewId: reviewed.body.data.previewId, issueKeys: ["TEAM-1"], csv };
    expect((await request(app).post(applyPath).set(auth(outsider.token)).send(input)).status).toBe(
      404
    );
    expect(
      (
        await request(app)
          .post(applyPath)
          .set(auth(owner.token))
          .send({ ...input, csv: csv.replace("Fix login", "Change login") })
      ).status
    ).toBe(409);
    expect((await db.query("SELECT COUNT(*)::int AS count FROM tasks")).rows[0].count).toBe(0);
  });
});
