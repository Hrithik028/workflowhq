const { newDb } = require("pg-mem");

const {
  compareMigrationState,
  getMigrationStatus,
  printMigrationStatus,
  readMigrationFiles
} = require("../src/db/migrationStatus");

describe("migration status", () => {
  it("separates applied, pending, and unknown migrations", () => {
    const status = compareMigrationState(
      ["001_initial.sql", "002_projects.sql", "003_archive.sql"],
      [
        { name: "001_initial.sql", applied_at: "2026-01-01T00:00:00.000Z" },
        { name: "002_projects.sql", applied_at: "2026-01-02T00:00:00.000Z" },
        { name: "999_manual.sql", applied_at: "2026-01-03T00:00:00.000Z" }
      ]
    );

    expect(status.applied.map((migration) => migration.name)).toEqual([
      "001_initial.sql",
      "002_projects.sql"
    ]);
    expect(status.pending).toEqual(["003_archive.sql"]);
    expect(status.unknown).toEqual(["999_manual.sql"]);
  });

  it("prints a concise summary without connection details", () => {
    let output = "";
    printMigrationStatus(
      {
        applied: [{ name: "018_archive.sql", appliedAt: "2026-09-02T00:00:00.000Z" }],
        pending: [],
        unknown: []
      },
      { write: (value) => (output += value) }
    );

    expect(output).toContain("[applied] 018_archive.sql");
    expect(output).toContain("1 applied, 0 pending, 0 unknown");
    expect(output).not.toContain("DATABASE_URL");
  });

  it("reads the complete applied state from a database", async () => {
    const memoryDb = newDb();
    const adapter = memoryDb.adapters.createPg();
    const db = new adapter.Pool();
    const migrationFiles = await readMigrationFiles();

    await db.query(`
      CREATE TABLE schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const name of migrationFiles) {
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }

    const status = await getMigrationStatus(db);
    expect(status.applied).toHaveLength(migrationFiles.length);
    expect(status.pending).toEqual([]);
    expect(status.unknown).toEqual([]);

    await db.end();
  });
});
