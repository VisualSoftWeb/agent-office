import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, Message, ToolDefinition, LLMResponse, ToolCall, StreamChunk } from "./types.js";
import { config } from "../config.js";

type AnthropicMessage = Anthropic.Messages.MessageParam;

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  private client: Anthropic;

  constructor() {
    if (!config.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required for Claude");
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  }

  async *chatStream(messages: Message[], tools?: ToolDefinition[]): AsyncGenerator<StreamChunk, void, undefined> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const anthropicMessages: AnthropicMessage[] = nonSystem.map((m) => ({
      role: (m.role === "tool" ? "user" : m.role) as "user" | "assistant",
      content: m.content ?? "",
    }));

    const streamParams: Anthropic.Messages.MessageCreateParamsStreaming = {
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      system: systemMessages.map((m) => m.content).join("\n"),
      messages: anthropicMessages,
      stream: true,
    };

    if (tools && tools.length > 0) {
      streamParams.tools = tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters as Anthropic.Messages.Tool.InputSchema,
      }));
    }

    let fullContent = "";
    const toolCalls: ToolCall[] = [];
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    const stream = this.client.messages.stream(streamParams);

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          toolCalls.push({
            id: event.content_block.id,
            type: "function",
            function: {
              name: event.content_block.name,
              arguments: "",
            },
          });
        }
      }

      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta" && event.delta.text) {
          fullContent += event.delta.text;
          yield { content: fullContent, tool_calls: [], done: false };
        }
        if (event.delta.type === "input_json_delta" && toolCalls.length > 0) {
          toolCalls[toolCalls.length - 1].function.arguments += event.delta.partial_json;
        }
      }

      if (event.type === "message_delta") {
        usage.completion_tokens = event.usage.output_tokens;
      }

      if (event.type === "message_start") {
        usage.prompt_tokens = event.message.usage.input_tokens;
      }
    }

    yield { content: fullContent || null, tool_calls: toolCalls, done: true, usage };
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
