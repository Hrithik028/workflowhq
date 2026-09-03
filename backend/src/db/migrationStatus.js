require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");

const pool = require("../config/db");

const migrationsDirectory = path.resolve(__dirname, "../../migrations");

const compareMigrationState = (migrationFiles, appliedRows) => {
  const appliedByName = new Map(appliedRows.map((row) => [row.name, row.applied_at || null]));
  const localNames = new Set(migrationFiles);

  return {
    applied: migrationFiles
      .filter((name) => appliedByName.has(name))
      .map((name) => ({ name, appliedAt: appliedByName.get(name) })),
    pending: migrationFiles.filter((name) => !appliedByName.has(name)),
    unknown: appliedRows
      .map((row) => row.name)
      .filter((name) => !localNames.has(name))
      .sort()
  };
};

const readMigrationFiles = async (directory = migrationsDirectory) =>
  (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

const readAppliedMigrations = async (db = pool) => {
  try {
    const result = await db.query(
      "SELECT name, applied_at FROM schema_migrations ORDER BY name ASC"
    );
    return result.rows;
  } catch (error) {
    if (error.code === "42P01") return [];
    throw error;
  }
};

const getMigrationStatus = async (db = pool, directory = migrationsDirectory) => {
  const [migrationFiles, appliedRows] = await Promise.all([
    readMigrationFiles(directory),
    readAppliedMigrations(db)
  ]);
  return compareMigrationState(migrationFiles, appliedRows);
};

const printMigrationStatus = (status, output = process.stdout) => {
  for (const migration of status.applied) {
    const timestamp = migration.appliedAt
      ? ` (${new Date(migration.appliedAt).toISOString()})`
      : "";
    output.write(`[applied] ${migration.name}${timestamp}\n`);
  }

  for (const name of status.pending) output.write(`[pending] ${name}\n`);
  for (const name of status.unknown) output.write(`[unknown] ${name}\n`);

  output.write(
    `Migration status: ${status.applied.length} applied, ${status.pending.length} pending, ${status.unknown.length} unknown.\n`
  );
};

if (require.main === module) {
  getMigrationStatus()
    .then((status) => {
      printMigrationStatus(status);
      if (status.pending.length > 0 || status.unknown.length > 0) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(`Migration status failed: ${error.message}\n`);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = {
  compareMigrationState,
  getMigrationStatus,
  printMigrationStatus,
  readAppliedMigrations,
  readMigrationFiles
};
