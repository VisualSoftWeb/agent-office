# LLM — Provedores de IA

A pasta `src/llm/` gerencia a conexão com diferentes provedores de linguagem (LLMs). Implementa uma interface padronizada para que o resto do sistema possa trocar de modelo sem alterar código.

---

## types.ts — Tipos e contratos

Define as interfaces que todos os provedores devem seguir:

- **Message, LLMResponse, ToolCall, ToolDefinition, StreamChunk** — estruturas de dados padronizadas
- **LLMProvider** — interface que cada provedor implementa (`chat` + opcional `chatStream`)

---

## provider.ts — Fábrica de provedores

Centraliza a criação e acesso aos provedores:

- `createProvider(name)` — instancia o provedor correto baseado na string (`claude`, `gpt`, `deepseek`, `ollama`, `openrouter`, `groq`)
- `getLLMProvider()` — retorna o provedor principal (cacheado)
- `getFallbackProvider()` — retorna um provedor secundário para fallback se o principal falhar

---

## openrouter.ts — OpenRouter

- Usa a SDK OpenAI para chamar a API do OpenRouter
- Suporta streaming (`chatStream`) com tokenização em tempo real
- Trata erros específicos: 401 (auth), 402 (créditos), 429 (rate limit)

---

## ollama.ts — Ollama (local)

- Conecta em `http://localhost:11434/v1` via SDK OpenAI
- Suporta streaming e ferramentas
- Configura `temperature: 0.1` e `top_p: 0.3` para respostas mais determinísticas

---

## claude.ts — Anthropic Claude

- Usa a SDK oficial do Anthropic
- Modelo fixo: `claude-sonnet-4-20250514`
- Implementa streaming nativo com eventos `content_block_delta`
- Converte mensagens `system` para o formato Anthropic

---

## gpt.ts — OpenAI GPT

- Usa a SDK OpenAI com modelo `gpt-4o`
- Suporta streaming e ferramentas

---

## deepseek.ts — DeepSeek

- Conecta em `https://api.deepseek.com/v1` via SDK OpenAI
- Modelo fixo: `deepseek-chat`

---

## groq.ts — Groq

- Conecta em `https://api.groq.com/openai/v1` via SDK OpenAI
- Modelo configurável via `config.GROQ_MODEL`
- `max_tokens: 4096` — maior que os outros provedores
- Trata erro 429 com mensagem amigável
