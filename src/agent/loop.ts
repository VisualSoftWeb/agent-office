import { getLLMProvider, getFallbackProvider } from "../llm/provider.js";
import type { Message, LLMResponse, LLMProvider, StreamChunk, ToolCall } from "../llm/types.js";
import { getToolDefinitions, executeToolCall } from "../tools/registry.js";
import { setSendFileChatId } from "../tools/send-file.js";
import { addMessage, getRecentMessages, getFacts, addCost, getDailyCost } from "../memory/short-term.js";
import { indexText, searchSimilar } from "../memory/semantic.js";
import { loadSkills } from "../skills/loader.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import { generateId } from "../utils/helpers.js";
import { recordMetric } from "../utils/metrics.js";
import { checkRateLimit, formatRateLimit } from "../safeguards/rate-limit.js";
import { shouldPlan, createPlan, executePlan, type Plan } from "./planner.js";
import { getPathShortcutsHelp } from "../utils/paths.js";

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

let cachedSkills: string | null = null;

async function getSkillsSection(): Promise<string> {
  if (cachedSkills !== null) return cachedSkills;
  const skills = await loadSkills();
  if (skills.length === 0) {
    cachedSkills = "";
    return "";
  }
  cachedSkills = skills.map((s) => `### ${s.name}\n${s.description}\n${s.content}`).join("\n\n");
  return cachedSkills;
}

export function invalidateSkillsCache(): void {
  cachedSkills = null;
}

function buildSystemPrompt(soulContent: string, facts: string, semanticMemory: string, skillsSection: string): string {
  return `<soul>
${soulContent}
</soul>

<facts>
${facts}
</facts>

<semantic-memory>
${semanticMemory}
</semantic-memory>

${skillsSection ? `<skills>\n${skillsSection}\n</skills>` : ""}

${getPathShortcutsHelp()}

[system-instructions]
Você é um assistente AI para escritórios. Responda em português (PT-BR).

**Ferramentas disponíveis:**
${getToolDefinitions().map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n")}

**Regras:**
- Use ferramentas quando necessário, não finja ter acesso à informação
- Separe parágrafos com linha em branco
- Use **negrito** para títulos
- Use $ para caminhos de arquivo (ex: $C:\\pasta\\arquivo.txt)
- Use - para listas
- NUNCA gere links falsos. Só use send_file para enviar arquivos.
- Após executar uma ferramenta, analise o resultado e responda
- Se não souber, diga "não sei" em vez de inventar
- Se uma resposta parecer desatualizada ou você não tiver dados recentes, use web_search para buscar
[/system-instructions]`;
}

function sanitizeResponse(text: string): string {
  let r = text;

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

  r = r.replace(/(?:\[?citation:\d+\]?)+/gi, "");
  r = r.replace(/(?:\[\d+(?:[-,]\s*\d+)*\])+/g, "");
  r = r.replace(/([.!?])(?=[A-Za-zÀ-ÿ0-9])/g, "$1 ");
  r = r.replace(/:([A-Za-zÀ-ÿ])/g, ": $1");
  r = r.replace(/[ \t]{2,}/g, " ");
  r = r.replace(/\n{3,}/g, "\n\n");

  protectedPaths.forEach((p, i) => {
    r = r.replace(`__PATH_${i}__`, p);
  });
  protectedUrls.forEach((u, i) => {
    r = r.replace(`__URL_${i}__`, u);
  });

  return r.trim();
}

export async function processUserMessage(
  userId: string,
  userMessage: string,
  chatId?: number,
  onToken?: (text: string) => void,
  skipApproval?: boolean,
): Promise<string> {
  const dailyCost = getDailyCost();
  if (dailyCost >= config.DAILY_COST_LIMIT && config.LLM_PROVIDER !== "ollama") {
    return "Daily cost limit reached. Cannot process more requests today.";
  }

  if (!checkRateLimit(userId)) {
    return `Rate limit exceeded (${formatRateLimit(userId)}). Aguarde um momento e tente novamente.`;
  }

  const llm = getLLMProvider();
  if (chatId) setSendFileChatId(userId, chatId);

  if (shouldPlan(userMessage)) {
    return processWithPlanning(llm, userId, userMessage, chatId, skipApproval);
  }

  return processReactively(llm, userId, userMessage, chatId, onToken, skipApproval);
}

async function processWithPlanning(
  llm: LLMProvider,
  userId: string,
  userMessage: string,
  chatId?: number,
  skipApproval?: boolean,
): Promise<string> {
  logger.info(`[PLANNER] Planning triggered for user ${userId}: "${userMessage.slice(0, 100)}..."`);

  const plan: Plan = await createPlan(llm, userMessage);
  logger.info(`[PLANNER] Plan created: ${plan.tasks.length} tasks`);

  if (plan.tasks.length <= 1) {
    logger.info("[PLANNER] Single task plan, falling back to reactive");
    return processReactively(llm, userId, userMessage, chatId, undefined, skipApproval);
  }

  const planResult = await executePlan(llm, plan, userId, chatId, skipApproval);

  const soulContent = await readFile(path.resolve(__dirname, "../../soul.md"), "utf-8").catch(() => "");
  const finalMessages: Message[] = [
    { role: "system", content: `${soulContent}\n\nVocê é um assistente que executou um plano de tarefas. Abaixo estão os resultados de cada tarefa. Sintetize uma resposta final para o usuário em português, de forma clara e organizada.\n\nPlano original: ${plan.objective}` },
    { role: "user", content: `Resultados do plano:\n${planResult}\n\nCom base nesses resultados, gere uma resposta completa para o usuário que solicitou: "${userMessage}"` },
  ];

  const finalLLM = getLLMProvider();
  try {
    const response = await finalLLM.chat(finalMessages);
    if (response.content && response.content.trim().length > 0) {
      const sanitized = sanitizeResponse(response.content.trim());
      indexText(userId, `User: ${userMessage}\n[Planned execution]\nAssistant: ${sanitized}`);
      return sanitized;
    }
  } catch (err) {
    logger.error("[PLANNER] Final synthesis failed:", err);
  }

  return `Plano executado.\n\n${planResult}`;
}

async function processReactively(
  llm: LLMProvider,
  userId: string,
  userMessage: string,
  chatId?: number,
  onToken?: (text: string) => void,
  skipApproval?: boolean,
): Promise<string> {
  const soulContent = await readFile(path.resolve(__dirname, "../../soul.md"), "utf-8").catch(() => "No soul.md found.");
  const facts = getFacts(userId).map((f) => `- ${f.fact} (${f.category})`).join("\n");
  const semanticMemory = await searchSimilar(userId, userMessage, 3).then((r) => r.join("\n")).catch(() => "");
  const skillsSection = await getSkillsSection();

  const recentMessages = getRecentMessages(userId);
  const assistantToolCallIds = new Set<string>();

  const rawHistory: Message[] = recentMessages.reverse().map((m) => {
    const msg: Message = {
      role: m.role as Message["role"],
      content: m.content,
    };
    if (m.role === "tool") {
      msg.tool_call_id = m.tool_call_id || "fallback_" + m.id;
      msg.name = m.name || "unknown";
    }
    if (m.role === "assistant" && m.tool_calls) {
      try {
        const parsed = JSON.parse(m.tool_calls);
        msg.tool_calls = Array.isArray(parsed) ? parsed : [parsed];
        for (const tc of msg.tool_calls) {
          if (tc.id) assistantToolCallIds.add(tc.id);
        }
      } catch {
        // invalid stored tool_calls, skip
      }
    }
    return msg;
  });

  const history: Message[] = rawHistory.filter((m) => {
    if (m.role !== "tool") return true;
    return m.tool_call_id && assistantToolCallIds.has(m.tool_call_id);
  });

  const systemMsg: Message = { role: "system", content: buildSystemPrompt(soulContent, facts, semanticMemory, skillsSection) };
  const messages: Message[] = [systemMsg, ...history, { role: "user", content: userMessage }];

  const conversationId = generateId();
  let emptyResponseCount = 0;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const hasToolResult = messages.some((m) => m.role === "tool");
    const currentTools = hasToolResult ? undefined : getToolDefinitions();

    let response: LLMResponse;
    try {
      const isLastIteration = i >= MAX_ITERATIONS - 1;
      const canStream = onToken !== undefined && llm.chatStream;

      const llmStart = performance.now();
      if (canStream && isLastIteration) {
        response = await consumeStream(llm, messages, currentTools, onToken!);
      } else {
        response = await llm.chat(messages, currentTools);
      }
      const llmTime = Math.round(performance.now() - llmStart);
      logger.info(`[TIMING] LLM call (${llm.name}, iter ${i + 1}): ${llmTime}ms`);
      recordMetric({ timestamp: Date.now(), durationMs: llmTime, type: "llm", label: `${llm.name} iter ${i + 1}`, tokens: response.usage.total_tokens });
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
        const toolStart = performance.now();
        const result = await executeToolCall(tc, userId, chatId, skipApproval);
        const toolTime = Math.round(performance.now() - toolStart);
        logger.info(`[TIMING] Tool "${tc.function.name}": ${toolTime}ms`);
        recordMetric({ timestamp: Date.now(), durationMs: toolTime, type: "tool", label: tc.function.name });
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
  const toolCalls: ToolCall[] = [];
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