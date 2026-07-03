import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  LLM_PROVIDER: z.enum(["claude", "gpt", "deepseek", "ollama", "openrouter", "groq", "deepsproxy"]).default("openrouter"),
  LLM_FALLBACK_PROVIDER: z.enum(["claude", "gpt", "deepseek", "ollama", "openrouter", "groq", "deepsproxy"]).optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("openai/gpt-4o"),
  OPENROUTER_MAX_TOKENS: z.coerce.number().default(4096),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:1.5b"),

  DEEPSPROXY_BASE_URL: z.string().default("http://localhost:3000/v1"),
  DEEPSPROXY_API_KEY: z.string().optional(),
  DEEPSPROXY_MODEL: z.string().default("deepseek-v4-flash"),
  VECTOR_STORE: z.enum(["pinecone", "local"]).default("local"),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  STT_PROVIDER: z.enum(["openai", "local"]).default("openai"),
  TTS_PROVIDER: z.enum(["openai", "local"]).default("openai"),
  MCP_FILESYSTEM_PATH: z.string().optional(),
  MCP_GITHUB_TOKEN: z.string().optional(),
  MCP_BRAVE_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  PLANNER_ENABLED: z.coerce.boolean().default(true),
  PLANNER_MIN_TOKENS: z.coerce.number().default(100),
  PLANNER_MAX_TASKS: z.coerce.number().default(6),
  PLANNER_MAX_REPLAN_ATTEMPTS: z.coerce.number().default(1),

  WEBHOOK_ENABLED: z.coerce.boolean().default(false),
  WEBHOOK_URL: z.string().optional(),
  WEBHOOK_PORT: z.coerce.number().default(8443),
  WEBHOOK_SECRET: z.string().optional(),

  OTEL_ENABLED: z.coerce.boolean().default(false),

  STT_LOCAL_BASE_URL: z.string().default("http://localhost:9000"),
  TTS_LOCAL_BASE_URL: z.string().default("http://localhost:9001"),

  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  DAILY_COST_LIMIT: z.coerce.number().default(2.0),
  APPROVALS_ENABLED: z.coerce.boolean().default(true),
  APPROVAL_TIMEOUT: z.coerce.number().default(120000),
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
