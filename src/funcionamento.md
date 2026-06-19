# src/ — Raiz do Projeto

Arquivos na raiz de `src/` que orquestram todo o sistema.

---

## config.ts — Configuração central

- Carrega variáveis de ambiente via `dotenv`
- Valida todas as variáveis com `zod` (tipos, valores padrão, enumeração)
- **Provedores LLM:** `claude`, `gpt`, `deepseek`, `ollama`, `openrouter`, `groq`
- **Modelo padrão OpenRouter:** `openai/gpt-4o`
- **Memória vetorial:** `pinecone` ou `local`
- **Voz:** `openai` ou `local` (para STT e TTS)
- **Limite de custo:** padrão $2.00/dia
- **Aprovações:** habilitadas por padrão com timeout de 120s

Exporta `config` — objeto tipado com todas as configurações.

---

## index.ts — Ponto de entrada

- Executa `processUserMessage()` para o agente processar a mensagem do usuário
- Inicializa heartbeats e reflexão noturna (cron)
- Gerencia sinais SIGINT/SIGTERM para desligamento limpo
- Chama `launchBot()` para iniciar a conexão com Telegram

**Fluxo de inicialização:**
1. Carrega configuração (`config.ts`)
2. Registra heartbeats diários (`agent/heartbeat.ts`)
3. Agenda reflexão noturna às 02:00 (`agent/reflection.ts`)
4. Inicia bot do Telegram (`telegram/bot.ts`)
