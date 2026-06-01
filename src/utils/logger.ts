const levels = ["debug", "info", "warn", "error"] as const;
type Level = (typeof levels)[number];

function log(level: Level, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console[level === "error" ? "error" : "log"](`[${ts}] [${level.toUpperCase()}]`, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => log("debug", ...args),
  info: (...args: unknown[]) => log("info", ...args),
  warn: (...args: unknown[]) => log("warn", ...args),
  error: (...args: unknown[]) => log("error", ...args),
};
