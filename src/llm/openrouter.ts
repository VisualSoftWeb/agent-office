import OpenAI from "openai";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall } from "./types.js";
import { config } from "../config.js";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterProvider implements LLMProvider {
  readonly name = "openrouter";
  private client: OpenAI;

  constructor() {
    if (!config.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for OpenRouter");
    this.client = new OpenAI({
      apiKey: config.OPENROUTER_API_KEY,
      baseURL: OPENROUTER_BASE,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/telegram-ai-agent",
        "X-Title": "Telegram AI Agent",
      },
      timeout: 30000, // Evita travamentos infinitos se a API do OpenRouter oscilar ou demorar
    });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: config.OPENROUTER_MODEL,
      messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: 800,
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
      if (err.status === 429) {
        const msg = err.error?.message || "Rate limit exceeded";
        return {
          content: `⚠️ *Limite de requisições atingido.*\n\nO modelo gratuito do OpenRouter atingiu o limite diário.\n\n\`${msg}\`\n\n*Sugestões:*\n• Adicione créditos no OpenRouter (mínimo $10) para desbloquear 1000 requisições grátis/dia\n• Aguarde até o próximo dia para o limite resetar\n• Configure um provedor alternativo (ex: Gemini API grátis)`,
          tool_calls: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      }
      throw err;
    }
  }
}
