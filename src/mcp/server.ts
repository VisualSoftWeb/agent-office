import { logger } from "../utils/logger.js";

interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
}

interface MCPResponse {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string };
  id: number | string;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

const tools = new Map<string, { name: string; description: string; inputSchema: Record<string, unknown>; handler: ToolHandler }>();

export function registerMCPTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: ToolHandler
): void {
  tools.set(name, { name, description, inputSchema, handler });
}

export function handleMCPRequest(raw: string): string {
  try {
    const req: MCPRequest = JSON.parse(raw);

    if (req.method === "tools/list") {
      const response: MCPResponse = {
        jsonrpc: "2.0",
        result: {
          tools: Array.from(tools.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
        id: req.id,
      };
      return JSON.stringify(response);
    }

    if (req.method === "tools/call") {
      const tool = tools.get(req.params?.name as string);
      if (!tool) {
        return JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32601, message: `Tool not found: ${req.params?.name}` },
          id: req.id,
        });
      }

      tool.handler(req.params?.arguments as Record<string, unknown> ?? {}).then((result) => {
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0",
          result,
          id: req.id,
        }) + "\n");
      });
      return "";
    }

    return JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32601, message: `Method not found: ${req.method}` },
      id: req.id,
    });
  } catch (err) {
    logger.error("MCP server error:", err);
    return JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32700, message: "Parse error" },
      id: null,
    });
  }
}
