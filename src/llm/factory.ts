import { config } from '../config/index.js'
import type { LLMProvider } from './interface.js'
import { ClaudeProvider } from './claude.js'
import { GPTProvider } from './gpt.js'
import { DeepSeekProvider } from './deepseek.js'
import { OllamaProvider } from './ollama.js'

const providers: Record<string, new () => LLMProvider> = {
  claude: ClaudeProvider,
  gpt: GPTProvider,
  deepseek: DeepSeekProvider,
  ollama: OllamaProvider,
}

let currentProvider: LLMProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (!currentProvider) {
    const Provider = providers[config.LLM_PROVIDER]
    if (!Provider) throw new Error(`Unknown LLM provider: ${config.LLM_PROVIDER}`)
    currentProvider = new Provider()
  }
  return currentProvider
}

export function switchProvider(name: string): LLMProvider {
  const Provider = providers[name]
  if (!Provider) throw new Error(`Unknown LLM provider: ${name}`)
  currentProvider = new Provider()
  return currentProvider
}
