const MAX_SAMPLES = 100;

interface MetricSample {
  timestamp: number;
  durationMs: number;
  type: "llm" | "tool" | "total";
  label: string;
  tokens?: number;
}

const samples: MetricSample[] = [];

export function recordMetric(sample: MetricSample): void {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES * 3) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

function stats(samples: MetricSample[]): { avg: number; min: number; max: number; count: number } {
  if (samples.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const durations = samples.map((s) => s.durationMs);
  return {
    avg: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    min: Math.round(Math.min(...durations)),
    max: Math.round(Math.max(...durations)),
    count: durations.length,
  };
}

function formatMs(ms: number): string {
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}min`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function getMetricsReport(): string {
  const now = Date.now();
  const recent = samples.filter((s) => now - s.timestamp < 3600000);

  const totalStats = stats(samples.filter((s) => s.type === "total"));
  const recentTotalStats = stats(recent.filter((s) => s.type === "total"));
  const llmStats = stats(samples.filter((s) => s.type === "llm"));
  const toolStats = stats(samples.filter((s) => s.type === "tool"));

  return [
    "**📊 Métricas de Desempenho**",
    "",
    `**Respostas (total):** ${totalStats.count}`,
    `  Avg: ${formatMs(totalStats.avg)} | Min: ${formatMs(totalStats.min)} | Max: ${formatMs(totalStats.max)}`,
    "",
    `**Respostas (última hora):** ${recentTotalStats.count}`,
    `  Avg: ${formatMs(recentTotalStats.avg)} | Min: ${formatMs(recentTotalStats.min)} | Max: ${formatMs(recentTotalStats.max)}`,
    "",
    `**LLM (IA):** ${llmStats.count} chamadas`,
    `  Avg: ${formatMs(llmStats.avg)} | Min: ${formatMs(llmStats.min)} | Max: ${formatMs(llmStats.max)}`,
    "",
    `**Ferramentas:** ${toolStats.count} execuções`,
    `  Avg: ${formatMs(toolStats.avg)} | Min: ${formatMs(toolStats.min)} | Max: ${formatMs(toolStats.max)}`,
  ].join("\n");
}

export function getLastResponseTime(): number | null {
  const last = samples.filter((s) => s.type === "total").pop();
  return last ? last.durationMs : null;
}
