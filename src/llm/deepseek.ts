import OpenAI from "openai";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall } from "./types.js";
import { config } from "../config.js";

export class DeepSeekProvider implements LLMProvider {
  readonly name = "deepseek";
  private client: OpenAI;

  constructor() {
    if (!config.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required for DeepSeek");
    this.client = new OpenAI({
      apiKey: config.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com/v1",
      timeout: 30000, // Evita travamentos infinitos se a API da DeepSeek oscilar ou demorar
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: "deepseek-chat",
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 800,
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

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
  }
}
