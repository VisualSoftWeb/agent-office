import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/index.js'
import type { LLMProvider, ChatMessage, ToolDefinition, LLMResponse } from './interface.js'

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude'
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY })
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system')
    const nonSystem = messages.filter(m => m.role !== 'system')

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemMsg?.content,
      messages: nonSystem.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
      tools: tools as any,
    })

    const content: string[] = []
    const tool_calls: any[] = []

    for (const block of response.content) {
      if (block.type === 'text') content.push(block.text)
      if (block.type === 'tool_use') {
        tool_calls.push({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input) },
        })
      }
    }

    return {
      content: content.join(''),
      tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
      usage: {
        prompt_tokens: response.usage?.input_tokens ?? 0,
        completion_tokens: response.usage?.output_tokens ?? 0,
      },
    }
  }
}
