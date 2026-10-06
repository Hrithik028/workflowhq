const { Pool, types } = require("pg");

// PostgreSQL DATE represents a calendar day, not an instant. The default pg
// parser creates local-midnight Date objects, whose JSON conversion can shift
// the day in timezones ahead of UTC. Keep date-only values as YYYY-MM-DD strings.
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined
});

module.exports = pool;
