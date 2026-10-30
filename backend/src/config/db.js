const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
});

// An idle connection can fail when the database restarts or the network drops.
// pg removes that connection; handling its error lets later requests reconnect
// instead of Node terminating on an unhandled EventEmitter error.
pool.on("error", () => {
  process.stderr.write(
    `${JSON.stringify({ level: "error", message: "database_idle_connection_error" })}\n`
  );
});

module.exports = pool;
