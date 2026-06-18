import { getLLMProvider, getFallbackProvider } from "../llm/provider.js";
import type { Message, LLMResponse, LLMProvider, StreamChunk } from "../llm/types.js";
import { getToolDefinitions, executeToolCall } from "../tools/registry.js";
import { setSendFileChatId } from "../tools/send-file.js";
import { addMessage, getRecentMessages, getFacts, addCost, getDailyCost } from "../memory/short-term.js";
import { indexText, searchSimilar } from "../memory/semantic.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { generateId } from "../utils/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  claude: { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  gpt: { input: 2.5 / 1_000_000, output: 10.0 / 1_000_000 },
  deepseek: { input: 0.27 / 1_000_000, output: 1.10 / 1_000_000 },
  ollama: { input: 0, output: 0 },
  openrouter: { input: 0.0983 / 1_000_000, output: 0.1966 / 1_000_000 },
};

const MAX_ITERATIONS = 10;
const MAX_EMPTY_RETRIES = 5;

function buildSystemPrompt(soulContent: string, facts: string, semanticMemory: string): string {
  return `<soul>
${soulContent}
</soul>

<facts>
${facts}
</facts>

<semantic-memory>
${semanticMemory}
</semantic-memory>

[system-instructions]
- You are a helpful AI agent. You MUST answer in Portuguese (PT-BR).

=== FILE SEARCH & READ (CRITICAL) ===
When the user asks to find, search, or locate files, you MUST call search_files immediately.
Do NOT write Python or any code to search files. Do NOT say you don't have access. Call the tool.

Correct examples:
  User: "busque a imagem teste-agente"
  You: call search_files(pattern="*teste-agente*")
  
  User: "encontre meus PDFs"
  You: call search_files(pattern="*.pdf")

  User: "leia o arquivo notas.txt"
  You: call search_files(pattern="notas.txt") then call read_file(path="...")

After finding files with search_files, use read_file to read their contents.
When the user asks to open, show, send, view, or display a file in the chat, use send_file with the full file path to send it directly.

=== SEND FILE (CRITICAL - READ CAREFULLY) ===
You MUST call send_file(path="...") to send any file. 
NEVER generate fake links like <file url="..."> or http://.../file.png. These DO NOT WORK.
The ONLY way to send a file is by calling the send_file tool.
After calling send_file, the system will return the result. Do NOT make up file URLs.
If the file is not found by send_file, tell the user the exact error and suggest using search_files first.

=== TOOLS ===
- search_files: find files by name/extension (PDF, PNG, JPEG, HTML, XML, TXT, etc.)
- read_file: read any text file found. For images (PNG/JPEG) returns metadata.
- send_file: send a file (image or document) directly to the Telegram chat. Use after finding a file with search_files.
- web_search: current information from the internet.
- delete_file: delete a file or empty folder. FIRST call WITHOUT confirm=true to preview what will be deleted. Then ASK THE USER "Confirma a exclusão?" and wait for a clear "sim" or "confirmo" response. Only on the SECOND call pass confirm=true to actually delete. NEVER call with confirm=true on the first attempt. For folders with contents, also add recursive=true and warn the user.

=== APPROVAL SYSTEM (CRITICAL) ===
Destructive tools (delete_file, etc.) require user approval via Telegram buttons.
When you call delete_file, the system will:
1. Show a preview of what will be deleted
2. Send approval buttons to the user
3. Wait for user to click "Aprovar" or "Rejeitar"
4. Only execute if approved

You do NOT need to ask "Confirma a exclusão?" - the system handles approval automatically.
Just call the tool and explain what you're doing to the user.

How to call tools (write exactly like this):
  call search_files(pattern="*.pdf")
  call read_file(path="C:\pasta\arquivo.txt")
  call send_file(path="C:\pasta\imagem.png")
  call web_search(query="resultado jogo Brasil ontem")
  call delete_file(path="C:\pasta\arquivo.txt")
After receiving a tool result, analyze it and respond.
CRITICAL: Do NOT execute destructive actions (delete, modify, execute) without explicit user confirmation. Always use the two-step confirm pattern for delete_file.

=== FORMATAÇÃO (OBRIGATÓRIO - LEIA ATENTAMENTE) ===
Sua resposta será exibida no Telegram. Use formatação limpa e legível.

REGRAS:
1. SEMPRE separe parágrafos com linha em branco (ENTER duas vezes)
2. Use **negrito** para títulos e destaques
3. Use '$' para caminhos de arquivo e comandos (ex: $C:\\pasta\\arquivo.txt)
4. Use - para listas
5. NUNCA escreva um parágrafo gigante sem quebras - fica ILEGÍVEL

EXEMPLO BOM (siga este formato):
**Arquivo encontrado**
- Nome: foto.png
- Caminho: $C:\\Users\\Nome\\Desktop\\foto.png
- Modificado: 2026-05-14 20:43

EXEMPLO RUIM (NÃO faça isso):
"Arquivo encontrado em C:\\Users\\Nome\\Desktop\\foto.png modificado em 2026-05-14 20:43 tamanho 3.3KB."

OUTRO EXEMPLO BOM:
**Resultado da busca**
Foram encontrados 3 arquivos:
1. relatorio.pdf - 2.1 MB
2. foto.png - 3.3 KB
3. notas.txt - 1.2 KB

Lembre-se: linha em branco entre parágrafos, **negrito** para títulos, $ para caminhos.
[/system-instructions]`;
}

function sanitizeResponse(text: string): string {
  let r = text;

  // 0. Protect URLs and absolute paths BEFORE any modifications
  const protectedUrls: string[] = [];
  r = r.replace(/(https?:\/\/[^\s]+)/g, (m) => {
    protectedUrls.push(m);
    return `__URL_${protectedUrls.length - 1}__`;
  });
  const protectedPaths: string[] = [];
  r = r.replace(/([A-Za-z]:(?:\\[^<>:"|?*\s]+)+)/g, (m) => {
    protectedPaths.push(m);
    return `__PATH_${protectedPaths.length - 1}__`;
  });

  // 1. Ensure space after punctuation (. ! ?) when followed by a letter/number
  r = r.replace(/([.!?])(?=[A-Za-zÀ-ÿ0-9])/g, "$1 ");

  // 2. Ensure space after : when followed by a letter (but not in timestamps like 10:30)
  r = r.replace(/:([A-Za-zÀ-ÿ])/g, ": $1");

  // 3. Normalize multiple consecutive spaces into one (preserve newlines)
  r = r.replace(/[ \t]{2,}/g, " ");

  // 4. Normalize excessive newlines (3+ -> 2)
  r = r.replace(/\n{3,}/g, "\n\n");

  // 5. Restore protected items
  protectedPaths.forEach((p, i) => {
    r = r.replace(`__PATH_${i}__`, p);
  });
  protectedUrls.forEach((u, i) => {
    r = r.replace(`__URL_${i}__`, u);
  });

  return r.trim();
}

export async function processUserMessage(userId: string, userMessage: string, chatId?: number, onToken?: (text: string) => void, skipApproval?: boolean): Promise<string> {
  const dailyCost = getDailyCost();
  if (dailyCost >= config.DAILY_COST_LIMIT && config.LLM_PROVIDER !== "ollama") {
    return "Daily cost limit reached. Cannot process more requests today.";
  }

  const llm = getLLMProvider();
  if (chatId) setSendFileChatId(userId, chatId);

  const soulContent = await readFile(path.resolve(__dirname, "../../soul.md"), "utf-8").catch(() => "No soul.md found.");
  const facts = getFacts(userId).map((f) => `- ${f.fact} (${f.category})`).join("\n");
  const semanticMemory = await searchSimilar(userId, userMessage, 3).then((r) => r.join("\n")).catch(() => "");

  const recentMessages = getRecentMessages(userId);
  const history: Message[] = recentMessages.reverse().map((m) => ({
    role: m.role as Message["role"],
    content: m.content,
    tool_call_id: m.role === "tool" ? (m.tool_call_id || "fallback_" + m.id) : undefined,
    name: m.role === "tool" ? (m.name || "unknown") : undefined,
  })).filter((m) => m.role !== "tool" || m.tool_call_id);

  const systemMsg: Message = { role: "system", content: buildSystemPrompt(soulContent, facts, semanticMemory) };
  const messages: Message[] = [systemMsg, ...history, { role: "user", content: userMessage }];

  const conversationId = generateId();

  let emptyResponseCount = 0;
  let webSearchDone = false;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const hasToolResult = messages.some((m) => m.role === "tool");
    const currentTools = hasToolResult ? undefined : getToolDefinitions();

    let response: LLMResponse;
    try {
      const isLastIteration = i >= MAX_ITERATIONS - 1;
      const canStream = onToken !== undefined && llm.chatStream;

      if (canStream && isLastIteration) {
        response = await consumeStream(llm, messages, currentTools, onToken!);
      } else {
        response = await llm.chat(messages, currentTools);
      }
    } catch (err) {
      logger.error(`LLM chat error (${llm.name}):`, err);

      const fallback = getFallbackProvider();
      if (fallback) {
        logger.info(`[Fallback] Trying fallback provider: ${fallback.name}`);
        try {
          if (onToken && fallback.chatStream) {
            response = await consumeStream(fallback, messages, currentTools, onToken);
          } else {
            response = await fallback.chat(messages, currentTools);
          }
          logger.info(`[Fallback] ${fallback.name} succeeded!`);
        } catch (fallbackErr) {
          logger.error(`[Fallback] ${fallback.name} also failed:`, fallbackErr);
          return "Desculpe, ocorreu um erro inesperado ao processar sua solicitação. Todos os provedores de IA falharam. Já registrei para análise.";
        }
      } else {
        return "Desculpe, ocorreu um erro inesperado ao processar sua solicitação. Já registrei para análise.";
      }
    }

    addCost({
      user_id: userId,
      conversation_id: conversationId,
      provider: llm.name,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      cost_usd: calculateCost(llm.name, response.usage.prompt_tokens, response.usage.completion_tokens),
    });

    if (response.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: null, tool_calls: response.tool_calls });

      for (const tc of response.tool_calls) {
        const result = await executeToolCall(tc, userId, chatId, skipApproval);
        indexText(userId, `Tool call: ${tc.function.name}(${tc.function.arguments}) -> ${result}`);
        messages.push({
          role: "tool",
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
        addMessage({
          user_id: userId,
          role: "tool",
          content: result,
          tool_calls: JSON.stringify(tc),
          tool_call_id: tc.id,
          name: tc.function.name,
          tokens: 0,
        });
      }
    } else if (response.content !== null && response.content.trim().length > 0) {
      const finalContent = response.content.trim();

      let textToolMatch = finalContent.match(/<(search_files|web_search|read_file|send_file|delete_file)>([\s\S]*?)<\/(search_files|web_search|read_file|send_file|delete_file)>/i);

      if (!textToolMatch) {
        const pythonMatch = finalContent.match(/```(?:python|bash|shell)?\s*\n?\s*(?:call\s+)?(search_files|web_search|read_file|send_file|delete_file)\(\s*([\s\S]*?)\s*\)\s*\n?```/i);
        if (pythonMatch) {
          const toolName = pythonMatch[1].toLowerCase();
          let rawArgs = pythonMatch[2].trim();
          try {
            const parsed = Object.fromEntries(
              [...rawArgs.matchAll(/(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'/g)].map(m => [m[1] || m[3], m[2] || m[4]])
            );
            textToolMatch = [null, toolName, JSON.stringify(parsed)] as any;
          } catch {}
        }
      }

      if (!textToolMatch) {
        const inlineMatch = finalContent.match(/(?:call\s+)?(search_files|web_search|read_file|send_file|delete_file)\s*\(\s*((?:[^)]|\\\))*)\s*\)/i);
        if (inlineMatch && inlineMatch.index !== undefined) {
          const toolName = inlineMatch[1].toLowerCase();
          let rawArgs = inlineMatch[2].trim();
          try {
            const parsed = Object.fromEntries(
              [...rawArgs.matchAll(/(\w+)\s*=\s*"([^"]*)"|(\w+)\s*=\s*'([^']*)'/g)].map(m => [m[1] || m[3], m[2] || m[4]])
            );
            textToolMatch = [null, toolName, JSON.stringify(parsed)] as any;
          } catch {}
        }
      }

      if (textToolMatch) {
        const toolName = textToolMatch[1].toLowerCase();
        let toolArgs: string;
        try {
          const parsed = JSON.parse(textToolMatch[2]);
          toolArgs = textToolMatch[2];
        } catch {
          toolArgs = textToolMatch[2].trim();
        }
        const args: Record<string, unknown> = { query: toolArgs };
        if (toolName === "search_files") {
          try { Object.assign(args, JSON.parse(toolArgs)); } catch {
            args.query = toolArgs;
          }
        }
        if (toolName === "send_file") {
          try {
            const parsed = JSON.parse(toolArgs);
            if (parsed.filePath) { args.filePath = parsed.filePath; delete args.query; }
            else if (parsed.path) { args.filePath = parsed.path; delete args.query; }
            else { args.filePath = toolArgs; delete args.query; }
          } catch {
            args.filePath = toolArgs;
            delete args.query;
          }
        }
        if (toolName === "read_file") {
          try {
            const parsed = JSON.parse(toolArgs);
            if (parsed.path) { args.path = parsed.path; delete args.query; }
            else { args.path = toolArgs; delete args.query; }
          } catch {
            args.path = toolArgs;
            delete args.query;
          }
        }
        if (toolName === "delete_file") {
          try {
            const parsed = JSON.parse(toolArgs);
            args.path = parsed.path || parsed.filePath || toolArgs;
            args.confirm = parsed.confirm === true;
            args.recursive = parsed.recursive === true;
            delete args.query;
          } catch {
            args.path = toolArgs;
            args.confirm = false;
            args.recursive = false;
            delete args.query;
          }
        }
        messages.push({ role: "assistant", content: null, tool_calls: [{ id: "text_fallback", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }] });
        const result = await executeToolCall({ id: "text_fallback", type: "function", function: { name: toolName, arguments: JSON.stringify(args) } }, userId, chatId, skipApproval);
        messages.push({ role: "tool", content: result, tool_call_id: "text_fallback", name: toolName });
        indexText(userId, `Tool call (text fallback): ${toolName}(${JSON.stringify(args)}) -> ${result}`);
        continue;
      }

      // Auto-detect web search need (LLM didn't call any tool)
      const isProviderError = response.usage.total_tokens === 0 && finalContent.startsWith("⚠️");
      if (!isProviderError) {
        const searchTriggers = /\b(jogo|jogos|partida|resultado|not[íi]cia|clima|tempo|previs[ãa]o|campeonato|quem ganhou|[úu]ltimas?|placar|mundial|olimp[ií]adas|copa|brasileir[ãa]o|libertadores|futebol|f1|f[oó]rmula 1|ufc|boxe|vôlei|v[oó]lei|basquete|nba|nfl|t[ée]nis|news|breaking|live|stream|ao vivo|pre[çc]o|valor|cotação|cotação|ação|açao|bolsa|bitcoin|ethereum|moeda|d[óo]lar|euro|inflação|inflacao|eleição|eleicao|governo|presidente|ministro|congresso|senado|política|política|guerra|ataque|terremoto|furacão|furacao|enchente|pandemia|vacina|vacina|trump|lula|putin|zelensky|netanyahu|hamas|r[úu]ssia|ucrânia|ucrania|israel|gaza|china|eua|coreia|japão|japao|india|mudança|mudanca|tecnologia|lançamento|lancamento|bilheteria|oscar|grammy|bbb|reality|explosão|explosao|acidente|incêndio|incendio|desabamento|prisão|prisao|lei|projeto|votação|votacao|supremo|stf|congresso|senado|deputado|prefeito|governador|câmara|camara)/i;
        const userNeedsWebSearch = searchTriggers.test(userMessage);
        const llmExpressedUncertainty = /\b(n[ãa]o tenho|n[ãa]o sei|n[ãa]o encontrei|n[ãa]o possuo|n[ãa]o consigo|n[ãa]o tenho acesso|infelizmente|desculpe|não disponho|sem acesso|não foi possível|não tenho dados|não encontrei|não sei informar|não possuo informação|não tenho informação|peço desculpas|não posso|não consigo acessar|não tenho como|não está disponível|não disponível|não foi encontrado|não sei responder|não tenho conhecimento)\b/i;
        if (!webSearchDone && (userNeedsWebSearch || llmExpressedUncertainty.test(finalContent))) {
          webSearchDone = true;
          const searchQuery = userMessage.replace(/busca|pesquisa|procura|encontra|acha|abre|mostra|exibe|veja|olha/gi, "").trim();
          logger.info(`Auto web_search triggered for: "${searchQuery}"`);
          const result = await executeToolCall({ id: "auto_web_search", type: "function", function: { name: "web_search", arguments: JSON.stringify({ query: searchQuery || userMessage }) } }, userId, chatId, skipApproval);
          const truncatedResult = result.length > 2000 ? result.slice(0, 2000) + "\n... (resultado truncado)" : result;
          messages.push({ role: "system", content: `Busca automática na web acionada. O usuário perguntou sobre "${userMessage}". Resultado da busca:\n${truncatedResult}` });
          indexText(userId, `Auto web_search: "${searchQuery}" -> ${result}`);
          continue;
        }
      }

      addMessage({
        user_id: userId,
        role: "assistant",
        content: finalContent,
        tool_calls: null,
        tool_call_id: null,
        name: null,
        tokens: response.usage.total_tokens,
      });
      addMessage({
        user_id: userId,
        role: "user",
        content: userMessage,
        tool_calls: null,
        tool_call_id: null,
        name: null,
        tokens: 0,
      });
      const sanitized = sanitizeResponse(finalContent);
      logger.info(`[RAW LLM] First 300 chars: "${finalContent.slice(0, 300)}"`);
      logger.info(`[SANITIZED] First 300 chars: "${sanitized.slice(0, 300)}"`);
      if (sanitized !== finalContent) {
        logger.debug(`[sanitizeResponse] Reformatted response for user ${userId}`);
      }
      indexText(userId, `User: ${userMessage}\nAssistant: ${finalContent}`);
      return sanitized;
    } else {
      emptyResponseCount++;
      if (emptyResponseCount >= MAX_EMPTY_RETRIES) {
        logger.warn(`LLM returned empty content ${MAX_EMPTY_RETRIES} times consecutively for user ${userId}`);
        return "I'm sorry, I couldn't generate a proper response. Please try rephrasing your question.";
      }
      messages.push({
        role: "assistant",
        content: "[I need more information to provide a complete answer.]",
      });
      messages.push({
        role: "user",
        content: "Please provide a complete response to the user's original question based on the information you have gathered so far.",
      });
    }
  }

  return "I've reached the maximum number of iterations without a final answer. Please try rephrasing your request.";
}

function calculateCost(provider: string, promptTokens: number, completionTokens: number): number {
  const rate = MODEL_RATES[provider];
  if (!rate) return 0;
  return (promptTokens * rate.input) + (completionTokens * rate.output);
}

async function consumeStream(
  llm: LLMProvider,
  messages: Message[],
  tools: import("../llm/types.js").ToolDefinition[] | undefined,
  onToken: (text: string) => void,
): Promise<LLMResponse> {
  let lastContent: string | null = null;
  const toolCalls: import("../llm/types.js").ToolCall[] = [];
  let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  for await (const chunk of llm.chatStream!(messages, tools)) {
    if (chunk.content !== null && chunk.content !== lastContent) {
      lastContent = chunk.content;
      const sanitized = sanitizeResponse(chunk.content);
      onToken(sanitized);
    }
    if (chunk.tool_calls.length > 0) {
      toolCalls.push(...chunk.tool_calls);
    }
    if (chunk.usage) {
      usage = chunk.usage;
    }
    if (chunk.done) break;
  }

  return { content: lastContent, tool_calls: toolCalls, usage };
}
