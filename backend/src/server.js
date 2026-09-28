require("dotenv").config();

const { createApp } = require("./app");
const pool = require("./config/db");
const { loadConfig } = require("./config/env");
const { purgeExpiredAiConversationDetails } = require("./lib/aiConversations");

const config = loadConfig();
const app = createApp({ config, db: pool });

const server = app.listen(config.port, () => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "server_started", port: config.port })}\n`
  );
});

const runConversationRetention = () =>
  purgeExpiredAiConversationDetails(pool).catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ level: "error", message: "ai_conversation_retention_failed", error: error.message })}\n`
    );
  });
void runConversationRetention();
const conversationRetentionTimer = setInterval(runConversationRetention, 6 * 60 * 60 * 1000);
conversationRetentionTimer.unref();

const shutdown = async (signal) => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", message: "server_stopping", signal })}\n`
  );
  clearInterval(conversationRetentionTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
