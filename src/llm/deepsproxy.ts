import OpenAI from "openai";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall, StreamChunk } from "./types.js";
import { config } from "../config.js";

const DEEPSPROXY_BASE = "http://localhost:3000/v1";

export class DeepSProxyProvider implements LLMProvider {
  readonly name = "deepsproxy";
  private client: OpenAI;

  constructor() {
    const baseURL = config.DEEPSPROXY_BASE_URL || DEEPSPROXY_BASE;
    this.client = new OpenAI({
      apiKey: config.DEEPSPROXY_API_KEY || "sk-no-key-required",
      baseURL,
      timeout: 60000,
    });
  }

  async *chatStream(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, undefined> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: config.DEEPSPROXY_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

    let fullContent = "";
    const toolCalls: ToolCall[] = [];
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    try {
      const stream = await this.client.chat.completions.create(requestOptions);
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) {
          fullContent += delta.content;
          yield { content: fullContent, tool_calls: [], done: false };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              while (toolCalls.length <= tc.index) {
                toolCalls.push({ id: "", type: "function", function: { name: "", arguments: "" } });
              }
              const existing = toolCalls[tc.index];
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name += tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }
        }
        if (chunk.usage) {
          usage = {
            prompt_tokens: chunk.usage.prompt_tokens ?? 0,
            completion_tokens: chunk.usage.completion_tokens ?? 0,
            total_tokens: chunk.usage.total_tokens ?? 0,
          };
        }
        if (chunk.choices[0]?.finish_reason) break;
      }

      yield { content: fullContent || null, tool_calls: toolCalls, done: true, usage };
    } catch (err: any) {
      const baseURL = config.DEEPSPROXY_BASE_URL || DEEPSPROXY_BASE;
      if (err.code === "ECONNREFUSED" || err.message?.includes("connect ECONNREFUSED")) {
        throw new Error(
          `DeepSProxy não está rodando em ${baseURL}.\n\n` +
          `Para usar o DeepSProxy, primeiro faça login no DeepSeek:\n` +
          `  npm run login:deepseek\n\n` +
          `Depois inicie o proxy junto com o agente:\n` +
          `  npm run dev\n\n` +
          `Ou em produção com PM2:\n` +
          `  npm run iniciar`
        );
      }
      throw err;
    }
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: config.DEEPSPROXY_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 4096,
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

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
      const baseURL = config.DEEPSPROXY_BASE_URL || DEEPSPROXY_BASE;
      if (err.code === "ECONNREFUSED" || err.message?.includes("connect ECONNREFUSED")) {
        throw new Error(
          `DeepSProxy não está rodando em ${baseURL}.\n\n` +
          `Para usar o DeepSProxy, primeiro faça login no DeepSeek:\n` +
          `  npm run login:deepseek\n\n` +
          `Depois inicie o proxy junto com o agente:\n` +
          `  npm run dev\n\n` +
          `Ou em produção com PM2:\n` +
          `  npm run iniciar`
        );
      }
      throw err;
    }
  }
}
