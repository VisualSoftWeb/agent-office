import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  LLM_PROVIDER: z.enum(['claude', 'gpt', 'deepseek', 'ollama']).default('claude'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3'),
  SEMANTIC_MEMORY_PROVIDER: z.enum(['local', 'pinecone']).default('local'),
  PINECONE_API_KEY: z.string().optional(),
  PINECONE_INDEX: z.string().optional(),
  WHISPER_MODEL: z.string().default('base'),
  ELEVENLABS_API_KEY: z.string().optional(),
  COST_LIMIT_USD_PER_DAY: z.coerce.number().default(5.0),
  DASHBOARD_PORT: z.coerce.number().default(3000),
  ADMIN_USER_IDS: z.string().default(''),
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten())
  process.exit(1)
}

export const config = parsed.data
export type Config = typeof config
