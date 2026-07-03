import { describe, it, expect } from "vitest";

// Re-import with fresh config module
async function getShouldPlan() {
  process.env.PLANNER_ENABLED = "true";
  const { shouldPlan } = await import("../src/agent/planner.js");
  return shouldPlan;
}

describe("shouldPlan", () => {
  it("should return true for messages with multiple action verbs", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "pesquise os dados e crie uma planilha com os resultados";
    expect(shouldPlan(msg)).toBe(true);
  });

  it("should trigger on multi-step keyword matches (short msg + trigger word)", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "liste os arquivos";
    // "liste" is in PLAN_TRIGGERS and msg.length < 50 → triggers planning
    expect(shouldPlan(msg)).toBe(true);
  });

  it("should return false for simple greeting messages", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "Olá, tudo bem?";
    expect(shouldPlan(msg)).toBe(false);
  });

  it("should trigger on 'compare' keyword", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "compare os preços dos fornecedores";
    // "compare" is in PLAN_TRIGGERS and msg.length < 50 → triggers planning
    expect(shouldPlan(msg)).toBe(true);
  });

  it("should NOT trigger for single verb not in triggers list", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "diga olá";
    expect(shouldPlan(msg)).toBe(false);
  });

  it("should return true for messages with 2+ action verbs", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "pesquise dados e crie planilha";
    expect(shouldPlan(msg)).toBe(true);
  });

  it("should return true for compile data requests (trigger word)", async () => {
    const shouldPlan = await getShouldPlan();
    const msg = "compile dados de vendas do último trimestre";
    expect(shouldPlan(msg)).toBe(true);
  });
});
