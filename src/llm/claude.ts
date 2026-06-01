import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall } from "./types.js";
import { config } from "../config.js";

type AnthropicMessage = Anthropic.Messages.MessageParam;
type AnthropicTool = Anthropic.Messages.Tool;

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor() {
    if (!config.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for Claude");
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const anthropicMessages: AnthropicMessage[] = nonSystem.map((m) => ({
      role: (m.role === "tool" ? "user" : m.role) as "user" | "assistant",
      content: m.content ?? "",
    }));

    const requestOptions: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemMessages.map((m) => m.content).join("\n"),
      messages: anthropicMessages,
    };

    if (tools && tools.length > 0) {
      requestOptions.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters as Anthropic.Messages.Tool.InputSchema,
      }));
    }

    const response = await this.client.messages.create(requestOptions);

    const toolCalls: ToolCall[] = [];
    let content = "";

    for (const block of response.content) {
      if (block.type === "text") content += block.text;
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content: content || null,
      tool_calls: toolCalls,
      usage: {
        prompt_tokens: response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
