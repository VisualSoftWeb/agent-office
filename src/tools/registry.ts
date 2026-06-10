import type { ToolDefinition, ToolCall } from "../llm/types.js";

export type ToolHandler = (args: Record<string, unknown>, userId?: string) => Promise<string>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

const tools = new Map<string, RegisteredTool>();

export function registerTool(name: string, definition: ToolDefinition, handler: ToolHandler): void {
  tools.set(name, { definition, handler });
}

export function getToolDefinitions(): ToolDefinition[] {
  return Array.from(tools.values()).map((t) => t.definition);
}

export async function executeToolCall(tc: ToolCall, userId?: string): Promise<string> {
  const registered = tools.get(tc.function.name);
  if (!registered) {
    return `<tool-error>Tool "${tc.function.name}" not found</tool-error>`;
  }

  try {
    const args = JSON.parse(tc.function.arguments);
    const result = await registered.handler(args, userId);
    return `<tool-result name="${tc.function.name}">\n${result}\n</tool-result>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<tool-error name="${tc.function.name}">${msg}</tool-error>`;
  }
}
