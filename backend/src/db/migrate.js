require("dotenv").config();

const fs = require("node:fs/promises");
const path = require("node:path");

const pool = require("../config/db");

const migrationsDirectory = path.resolve(__dirname, "../../migrations");

const runMigrations = async (db = pool) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await fs.readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const applied = await db.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (applied.rows.length > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDirectory, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      process.stdout.write(`Applied migration ${file}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (error) => {
      process.stderr.write(`Migration failed: ${error.message}\n`);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runMigrations };
