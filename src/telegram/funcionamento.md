# Telegram — Integração com Telegram

A pasta `src/telegram/` conecta o agente ao Telegram, recebendo mensagens e enviando respostas.

---

## bot.ts — Bot principal

Implementa polling manual (sem usar `bot.launch()` do Telegraf):

- `getBot()` — cria/retorna instância do Telegraf (usada apenas para captura de erros)
- `launchBot()` — autentica via `getMe()` e inicia loop de polling
- `startPolling()` — loop infinito que chama `getUpdates()` da API do Telegram
  - A cada update, extrai `userId`, `text` e `chatId`
  - Envia "⏳ Processando..." e chama `processUserMessage()` do agent
  - Suporta streaming: atualiza a mensagem conforme o LLM gera tokens
  - Trata erros e reconecta após 5s
- `stopBot()` — para o polling e libera recursos
- `sendReply()` — envia mensagem de texto (tenta Markdown primeiro)
- `editMessageText()` — edita mensagem existente (usado no streaming)

---

## handlers.ts — Handlers do Telegraf

Implementa handlers para quando o bot roda com `bot.launch()` (não usado atualmente):

- `registerMessageHandler()` — registra handlers para:
  - **Texto:** verifica limite de custo e injeção de prompt, processa mensagem, gerencia aprovações com botões inline
  - **Voz:** baixa áudio, transcreve com Whisper, processa texto, sintetiza resposta
  - **Ações:** botões "Aprovar" e "Rejeitar" para ações destrutivas
