import OpenAI from "openai";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall, StreamChunk } from "./types.js";
import { config } from "../config.js";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  private client: OpenAI;

  constructor() {
    if (!config.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required for Groq");
    this.client = new OpenAI({
      apiKey: config.GROQ_API_KEY,
      baseURL: GROQ_BASE,
      timeout: 30000,
    });
  }

  async *chatStream(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, undefined> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: config.GROQ_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    let fullContent = "";
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const stream = await this.client.chat.completions.create(requestOptions);
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        fullContent += delta.content;
        yield { content: fullContent, tool_calls: [], done: false };
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

    yield { content: fullContent || null, tool_calls: [], done: true, usage };
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: config.GROQ_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 4096,
    };

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
      if (err.status === 429) {
        const msg = err.error?.message || "Rate limit exceeded";
        return {
          content: `⚠️ *Limite de requisições atingido.*\n\nO Groq atingiu o limite de taxa.\n\n\`${msg}\`\n\n*Sugestões:*\n• Aguarde alguns segundos e tente novamente\n• O limite gratuito é de 30 requisições por minuto e 1000 por dia`,
          tool_calls: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      }
      throw err;
    }
  }
}
