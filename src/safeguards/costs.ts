import { getDailyCost } from "../memory/short-term.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export function checkCostLimit(): boolean {
  const daily = getDailyCost();
  const underLimit = daily < config.DAILY_COST_LIMIT;

  if (!underLimit) {
    logger.warn(`Daily cost limit reached: $${daily.toFixed(4)} / $${config.DAILY_COST_LIMIT.toFixed(2)}`);
  }

  return underLimit;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(6)}`;
}

export function getCostSummary(): string {
  const daily = getDailyCost();
  return `Daily cost: ${formatCost(daily)} / ${formatCost(config.DAILY_COST_LIMIT)}`;
}
