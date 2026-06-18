const DEFAULT_MAX_CHARS = 4000;

export interface ToolResultMeta {
  tool: string;
  timestamp: string;
  duration_ms: number;
  truncated: boolean;
  original_length: number;
}

export function truncateText(text: string, maxChars: number = DEFAULT_MAX_CHARS): { text: string; truncated: boolean; originalLength: number } {
  if (text.length <= maxChars) {
    return { text, truncated: false, originalLength: text.length };
  }
  const truncated = text.slice(0, maxChars) + `\n\n... (truncated: ${text.length} chars -> ${maxChars} chars)`;
  return { text: truncated, truncated: true, originalLength: text.length };
}

export function wrapToolResult(toolName: string, result: string, startTime: number): string {
  const durationMs = Date.now() - startTime;
  const { text, truncated, originalLength } = truncateText(result);

  const meta: ToolResultMeta = {
    tool: toolName,
    timestamp: new Date().toISOString(),
    duration_ms: durationMs,
    truncated,
    original_length: originalLength,
  };

  return `<tool-result name="${meta.tool}" ts="${meta.timestamp}" dur="${meta.duration_ms}ms" truncated="${meta.truncated}">\n${text}\n</tool-result>`;
}

export function wrapToolError(toolName: string, error: unknown, startTime: number): string {
  const durationMs = Date.now() - startTime;
  const msg = error instanceof Error ? error.message : String(error);
  const recoverable = isRecoverable(error);

  return `<tool-error name="${toolName}" ts="${new Date().toISOString()}" dur="${durationMs}ms" recoverable="${recoverable}">${msg}</tool-error>`;
}

function isRecoverable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as any).code;
  const recoverableCodes = ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED", "EPIPE", "EAI_AGAIN"];
  if (code && recoverableCodes.includes(code)) return true;
  if (error.message?.includes("timeout")) return true;
  if (error.message?.includes("rate limit")) return true;
  if (error.message?.includes("429")) return true;
  return false;
}
