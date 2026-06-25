import OpenAI from 'openai'
import { config } from '../config/index.js'
import type { LLMProvider, ChatMessage, ToolDefinition, LLMResponse } from './interface.js'

export class GPTProvider implements LLMProvider {
  readonly name = 'gpt'
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY })
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_call_id: m.tool_call_id,
      })),
      tools: tools as any,
    })

    const choice = response.choices[0]
    return {
      content: choice.message.content ?? '',
      tool_calls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens ?? 0,
        completion_tokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }
}
