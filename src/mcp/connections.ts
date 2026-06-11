import { connectMCP } from "./client.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export async function initMCPConnections() {
  const connections = [];

  if (config.MCP_FILESYSTEM_PATH) {
    try {
      connections.push(await connectMCP("filesystem", "npx", [
        "-y", "@modelcontextprotocol/server-filesystem", config.MCP_FILESYSTEM_PATH
      ]));
      logger.info("MCP filesystem connected");
    } catch (err) {
      logger.error("Failed to connect MCP filesystem:", err);
    }
  }

  if (config.MCP_GITHUB_TOKEN) {
    try {
      connections.push(await connectMCP("github", "npx", [
        "-y", "@modelcontextprotocol/server-github"
      ], { env: { GITHUB_PERSONAL_ACCESS_TOKEN: config.MCP_GITHUB_TOKEN } }));
      logger.info("MCP github connected");
    } catch (err) {
      logger.error("Failed to connect MCP github:", err);
    }
  }

  if (config.MCP_BRAVE_API_KEY) {
    try {
      connections.push(await connectMCP("brave-search", "npx", [
        "-y", "@modelcontextprotocol/server-brave-search"
      ], { env: { BRAVE_API_KEY: config.MCP_BRAVE_API_KEY } }));
      logger.info("MCP brave-search connected");
    } catch (err) {
      logger.error("Failed to connect MCP brave-search:", err);
    }
  }

  return connections;
}