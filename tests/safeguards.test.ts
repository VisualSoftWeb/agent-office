import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, formatRateLimit } from "../src/safeguards/rate-limit.js";

describe("Rate Limit", () => {
  const testUser = "test-user-123";

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = "true";
    process.env.RATE_LIMIT_MAX_REQUESTS = "10";
    process.env.RATE_LIMIT_WINDOW_MS = "60000";
  });

  it("should allow first request", () => {
    expect(checkRateLimit(testUser)).toBe(true);
  });

  it("should return formatted rate limit info", () => {
    checkRateLimit(testUser);
    const formatted = formatRateLimit(testUser);
    expect(formatted).toMatch(/\d+\/\d+/);
  });
});
