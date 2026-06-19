# MCP — Model Context Protocol

A pasta `src/mcp/` implementa o protocolo MCP (Model Context Protocol), que permite ao agente conectar-se a servidores externos de ferramentas (sistema de arquivos, GitHub, Brave Search, etc.).

---

## index.ts — Barrel

Re-exporta todos os módulos:
- `client.ts`, `server.ts`, `connections.ts`

---

## client.ts — Cliente MCP

- `connectMCP()` — spawna um processo filho (ex: `npx`) que roda um servidor MCP
- Comunicação via JSON-RPC 2.0 sobre stdin/stdout
- Expõe `callTool()` para invocar ferramentas do servidor com timeout de 30s
- Mantém um registro de conexões ativas

---

## server.ts — Servidor MCP

- Implementa um servidor MCP que escuta requisições JSON-RPC
- `registerMCPTool()` — registra ferramentas que podem ser chamadas externamente
- `handleMCPRequest()` — processa requisições `tools/list` e `tools/call`

---

## connections.ts — Gerenciamento de conexões

- `initMCPConnections()` — inicializa conexões baseadas na configuração:
  - **filesystem** — se `MCP_FILESYSTEM_PATH` estiver definido
  - **github** — se `MCP_GITHUB_TOKEN` estiver definido
  - **brave-search** — se `MCP_BRAVE_API_KEY` estiver definido
