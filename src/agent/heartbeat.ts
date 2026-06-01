import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { processUserMessage } from "./loop.js";

interface HeartbeatTask {
  id: string;
  cronExpression: string;
  userId: string;
  prompt: string;
}

const tasks: Map<string, cron.ScheduledTask> = new Map();

export function registerHeartbeat(task: HeartbeatTask): void {
  if (tasks.has(task.id)) {
    tasks.get(task.id)!.stop();
  }

  const cronTask = cron.schedule(task.cronExpression, async () => {
    logger.info(`Heartbeat triggered: ${task.id}`);
    try {
      const result = await processUserMessage(task.userId, task.prompt);
      logger.info(`Heartbeat ${task.id} result: ${result.slice(0, 200)}`);
    } catch (err) {
      logger.error(`Heartbeat ${task.id} failed:`, err);
    }
  });

  tasks.set(task.id, cronTask);
  logger.info(`Heartbeat registered: ${task.id} (${task.cronExpression})`);
}

export function stopHeartbeat(id: string): void {
  const t = tasks.get(id);
  if (t) {
    t.stop();
    tasks.delete(id);
  }
}

export function startDefaultHeartbeats(): void {
  registerHeartbeat({
    id: "daily-summary",
    cronExpression: "0 8 * * *",
    userId: "system",
    prompt: "Resuma o que aconteceu nas últimas 24 horas com base no histórico de conversas e fatos registrados.",
  });
}
