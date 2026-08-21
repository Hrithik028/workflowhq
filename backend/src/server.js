require("dotenv").config();

const { createApp } = require("./app");
const pool = require("./config/db");
const { loadConfig } = require("./config/env");

const config = loadConfig();
const app = createApp({ config, db: pool });

const server = app.listen(config.port, () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "server_started", port: config.port })}\n`
  );
});

const shutdown = async (signal) => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "server_stopping", signal })}\n`
  );
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
