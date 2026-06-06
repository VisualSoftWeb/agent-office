import type { LLMProvider } from "./types.js";
import { config } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { GPTProvider } from "./gpt.js";
import { DeepSeekProvider } from "./deepseek.js";
import { OllamaProvider } from "./ollama.js";
import { OpenRouterProvider } from "./openrouter.js";
import { GroqProvider } from "./groq.js";
import { MyProverProvider } from "./myprover.js";
import { logger } from "../utils/logger.js";

let provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (provider) return provider;

  switch (config.LLM_PROVIDER) {
    case "claude":
      provider = new ClaudeProvider();
      break;
    case "gpt":
      provider = new GPTProvider();
      break;
    case "deepseek":
      provider = new DeepSeekProvider();
      break;
    case "ollama":
      provider = new OllamaProvider();
      break;
    case "openrouter":
      provider = new OpenRouterProvider();
      break;
    case "groq":
      provider = new GroqProvider();
      break;
    case "myprover":
      provider = new MyProverProvider();
      break;
    default:
      throw new Error(`Unknown LLM provider: ${config.LLM_PROVIDER}`);
  }

  logger.info(`LLM provider initialized: ${provider.name}`);
  return provider;
}

export function setLLMProvider(p: LLMProvider): void {
  provider = p;
  logger.info(`LLM provider swapped: ${p.name}`);
}
