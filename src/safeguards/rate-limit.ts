import { config } from "../config.js";
import { logger } from "../utils/logger.js";

interface WindowEntry {
  timestamp: number;
}

const windows = new Map<string, WindowEntry[]>();

export function checkRateLimit(userId: string): boolean {
  if (!config.RATE_LIMIT_ENABLED) return true;

  const now = Date.now();
  const windowStart = now - config.RATE_LIMIT_WINDOW_MS;

  let entries = windows.get(userId);
  if (!entries) {
    entries = [];
    windows.set(userId, entries);
  }

  const recent = entries.filter((e) => e.timestamp >= windowStart);
  windows.set(userId, recent);

  if (recent.length >= config.RATE_LIMIT_MAX_REQUESTS) {
    const oldest = recent[0]?.timestamp ?? now;
    const retryAfter = Math.ceil((oldest + config.RATE_LIMIT_WINDOW_MS - now) / 1000);
    logger.warn(`[RATE_LIMIT] User ${userId} exceeded: ${recent.length}/${config.RATE_LIMIT_MAX_REQUESTS} (retry in ${retryAfter}s)`);
    return false;
  }

  recent.push({ timestamp: now });
  return true;
}

export function formatRateLimit(userId: string): string {
  const entries = windows.get(userId);
  if (!entries) return "0";
  const recent = entries.filter((e) => e.timestamp >= Date.now() - config.RATE_LIMIT_WINDOW_MS);
  return `${recent.length}/${config.RATE_LIMIT_MAX_REQUESTS}`;
}

setInterval(() => {
  const cutoff = Date.now() - config.RATE_LIMIT_WINDOW_MS;
  for (const [userId, entries] of windows) {
    const recent = entries.filter((e) => e.timestamp >= cutoff);
    if (recent.length === 0) {
      windows.delete(userId);
    } else {
      windows.set(userId, recent);
    }
  }
}, 60000).unref();