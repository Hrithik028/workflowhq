const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
});

module.exports = pool;
