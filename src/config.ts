import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  LLM_PROVIDER: z.enum(["claude", "gpt", "deepseek", "ollama", "openrouter", "groq", "qwenproxy"]).default("qwenproxy"),
  LLM_FALLBACK_PROVIDER: z.enum(["claude", "gpt", "deepseek", "ollama", "openrouter", "groq", "qwenproxy"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3"),
  VECTOR_STORE: z.enum(["pinecone", "local"]).default("local"),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  STT_PROVIDER: z.enum(["openai", "local"]).default("openai"),
  TTS_PROVIDER: z.enum(["openai", "local"]).default("openai"),
  QWENPROXY_MODEL: z.string().default("qwen3.7-plus"),
  QWENPROXY_BASE_URL: z.string().default("http://127.0.0.1:3000/v1"),
  DAILY_COST_LIMIT: z.coerce.number().default(2.0),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Config validation failed:", result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
