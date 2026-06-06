process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err.message);
});

import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { launchBot, stopBot } from "./telegram/bot.js";
import "./tools/index.js";
import { startDefaultHeartbeats } from "./agent/heartbeat.js";
import cron from "node-cron";
import { nightlyReflection } from "./agent/reflection.js";

async function main() {
  logger.info("Starting Telegram AI Agent...");
  logger.info(`LLM Provider: ${config.LLM_PROVIDER}`);
  logger.info(`Vector Store: ${config.VECTOR_STORE}`);

  startDefaultHeartbeats();

  cron.schedule("0 2 * * *", () => {
    nightlyReflection("system").catch((err) => logger.error("Nightly reflection failed:", err));
  });

  process.once("SIGINT", () => stopBot());
  process.once("SIGTERM", () => stopBot());

  launchBot();
}

main().catch((err) => {
  logger.error("Fatal error:", err);
  process.exit(1);
});
