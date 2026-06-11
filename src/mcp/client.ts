import { logger } from "../utils/logger.js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPConnection {
  name: string;
  tools: MCPTool[];
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
}

const connections = new Map<string, MCPConnection>();

export interface MCPConnectOptions {
  env?: Record<string, string>;
}

export async function connectMCP(name: string, command: string, args: string[], options?: MCPConnectOptions): Promise<MCPConnection> {
  try {
    const { spawn } = await import("node:child_process");
    const { readdir, readFile, writeFile } = await import("node:fs/promises");

    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options?.env },
    });

    const connection: MCPConnection = {
      name,
      tools: [],
      async callTool(toolName: string, toolArgs: Record<string, unknown>): Promise<string> {
        return new Promise((resolve, reject) => {
          const request = JSON.stringify({ jsonrpc: "2.0", method: "tools/call", params: { name: toolName, arguments: toolArgs }, id: 1 }) + "\n";
          let response = "";

          const onData = (data: Buffer) => {
            response += data.toString();
            try {
              const parsed = JSON.parse(response);
              if (parsed.result) {
                resolve(JSON.stringify(parsed.result));
              } else if (parsed.error) {
                resolve(`<tool-error>${parsed.error.message}</tool-error>`);
              }
            } catch {}
          };

          child.stdout?.on("data", onData);
          child.stdin?.write(request);
          setTimeout(() => {
            child.stdout?.removeListener("data", onData);
            reject(new Error("MCP call timeout"));
          }, 30000);
        });
      },
    };

    connections.set(name, connection);
    logger.info(`MCP connected: ${name}`);
    return connection;
  } catch (err) {
    logger.error(`Failed to connect MCP ${name}:`, err);
    throw err;
  }
}

export function getMCPConnections(): MCPConnection[] {
  return Array.from(connections.values());
}
