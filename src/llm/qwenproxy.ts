import OpenAI from "openai";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall } from "./types.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export class QwenProxyProvider implements LLMProvider {
  readonly name = "qwenproxy";
  private client: OpenAI;

  constructor() {
    const baseURL = config.QWENPROXY_BASE_URL || "http://127.0.0.1:3000/v1";
    logger.info(`[QwenProxy] Connecting to ${baseURL}`);
    this.client = new OpenAI({
      apiKey: "no-key-needed",
      baseURL,
      timeout: 120000, // QwenProxy usa Playwright, pode demorar
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: config.QWENPROXY_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 800,
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.chat.completions.create(requestOptions);
        const choice = response.choices[0];

        const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        }));

        return {
          content: choice.message.content,
          tool_calls: toolCalls,
          usage: {
            prompt_tokens: response.usage?.prompt_tokens ?? 0,
            completion_tokens: response.usage?.completion_tokens ?? 0,
            total_tokens: response.usage?.total_tokens ?? 0,
          },
        };
      } catch (err: any) {
        lastError = err;
        const isConnectionError = err.code === "ECONNREFUSED" || 
                                   err.cause?.code === "ECONNREFUSED" ||
                                   err.message?.includes("Connection error");
        
        if (isConnectionError && attempt < MAX_RETRIES) {
          logger.warn(`[QwenProxy] Connection failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
          continue;
        }
        
        if (isConnectionError) {
          logger.error(`[QwenProxy] All ${MAX_RETRIES} connection attempts failed. Is qwenproxy running?`);
        }
        throw err;
      }
    }

    throw lastError;
  }
}

