import type { ToolDefinition, ToolCall } from "../llm/types.js";
import { wrapToolResult, wrapToolError } from "./tool-result.js";
import { requiresApproval, createApprovalRequest } from "../safeguards/approvals.js";
import { logger } from "../utils/logger.js";
import { createN8nToolHandler } from "./n8n-executor.js";

export type ToolHandler = (args: Record<string, unknown>, userId?: string) => Promise<string>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  n8nWebhookPath?: string;
}

const tools = new Map<string, RegisteredTool>();

export function registerTool(
  name: string,
  definition: ToolDefinition,
  handler: ToolHandler,
  options?: { n8nWebhookPath?: string }
): void {
  tools.set(name, { definition, handler, n8nWebhookPath: options?.n8nWebhookPath });
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map((t) => t.definition);
}

export async function executeToolCall(
  tc: ToolCall,
  userId?: string,
  chatId?: number,
  skipApproval?: boolean,
): Promise<string> {
  const registered = tools.get(tc.function.name);
  if (!registered) {
    return `<tool-error name="${tc.function.name}" recoverable="false">Tool "${tc.function.name}" not found</tool-error>`;
  }

  if (!skipApproval && requiresApproval(tc.function.name) && chatId) {
    const args = JSON.parse(tc.function.arguments);
    const request = createApprovalRequest(tc.function.name, args, userId || "unknown", chatId, tc);
    logger.info(`Approval required for ${tc.function.name} [id=${request.id}]`);
    return `<approval-required id="${request.id}" tool="${tc.function.name}">Aguardando aprovação para ${tc.function.name}.</approval-required>`;
  }

  const startTime = Date.now();
  try {
    const args = JSON.parse(tc.function.arguments);

    let handler = registered.handler;
    if (registered.n8nWebhookPath) {
      handler = createN8nToolHandler(registered.n8nWebhookPath);
    }

    const result = await handler(args, userId);
    return wrapToolResult(tc.function.name, result, startTime);
  } catch (err) {
    return wrapToolError(tc.function.name, err, startTime);
  }
}
