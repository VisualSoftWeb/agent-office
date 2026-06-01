import { logger } from "../utils/logger.js";

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|above|prior)/i,
  /forget\s+(all\s+)?(previous|above|prior)/i,
  /you\s+are\s+(now|not\s+an?\s+ai)/i,
  /system\s+(prompt|instruction)/i,
  /new\s+(instruction|directive)/i,
];

export function hasInjectionAttempt(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export function sanitizeToolOutput(output: string): string {
  return output
    .replace(/<system>/gi, "‹system›")
    .replace(/<\/system>/gi, "‹/system›")
    .replace(/<soul>/gi, "‹soul›")
    .replace(/<\/soul>/gi, "‹/soul›")
    .replace(/<user>/gi, "‹user›")
    .replace(/<\/user>/gi, "‹/user›");
}

export function wrapToolOutput(content: string, toolName: string): string {
  const sanitized = sanitizeToolOutput(content);
  return `<function-result tool="${toolName}">
${sanitized}
</function-result>`;
}

export function checkUserMessage(text: string): { safe: boolean; reason?: string } {
  if (hasInjectionAttempt(text)) {
    logger.warn(`Potential prompt-injection detected: "${text.slice(0, 100)}"`);
    return { safe: false, reason: "Message contains potential prompt injection patterns." };
  }
  return { safe: true };
}
