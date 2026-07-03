import { describe, it, expect } from "vitest";
import { generateId, nowISO, truncate } from "../src/utils/helpers.js";

describe("helpers", () => {
  it("generateId should return a non-empty string", () => {
    const id = generateId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("nowISO should return a valid ISO string", () => {
    const iso = nowISO();
    expect(() => new Date(iso)).not.toThrow();
  });

  it("truncate should limit string length with ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncate(long, 10);
    expect(result).toHaveLength(13);
    expect(result.endsWith("...")).toBe(true);
  });

  it("truncate should not modify short strings", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
});
