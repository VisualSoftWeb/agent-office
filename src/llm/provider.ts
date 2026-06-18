import type { LLMProvider } from "./types.js";
import { config } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { GPTProvider } from "./gpt.js";
import { DeepSeekProvider } from "./deepseek.js";
import { OllamaProvider } from "./ollama.js";
import { OpenRouterProvider } from "./openrouter.js";
import { GroqProvider } from "./groq.js";
import { logger } from "../utils/logger.js";

let provider: LLMProvider | null = null;
let fallbackProvider: LLMProvider | null = null;

export function createProvider(name: string): LLMProvider {
  switch (name) {
    case "claude":
      return new ClaudeProvider();
    case "gpt":
      return new GPTProvider();
    case "deepseek":
      return new DeepSeekProvider();
    case "ollama":
      return new OllamaProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "groq":
      return new GroqProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}`);
  }
}

export function getLLMProvider(): LLMProvider {
  if (provider) return provider;

  provider = createProvider(config.LLM_PROVIDER);
  logger.info(`LLM provider initialized: ${provider.name}`);
  return provider;
}

export function getFallbackProvider(): LLMProvider | null {
  if (!config.LLM_FALLBACK_PROVIDER) return null;
  if (config.LLM_FALLBACK_PROVIDER === config.LLM_PROVIDER) return null;
  
  if (fallbackProvider) return fallbackProvider;

  try {
    fallbackProvider = createProvider(config.LLM_FALLBACK_PROVIDER);
    logger.info(`LLM fallback provider initialized: ${fallbackProvider.name}`);
    return fallbackProvider;
  } catch (err) {
    logger.warn(`Failed to initialize fallback provider ${config.LLM_FALLBACK_PROVIDER}:`, err);
    return null;
  }
}

export function setLLMProvider(p: LLMProvider): void {
  provider = p;
  logger.info(`LLM provider swapped: ${p.name}`);
}

