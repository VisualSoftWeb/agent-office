# Agente — Funcionamento

A pasta `src/agent/` é o **cérebro do bot** — contém a lógica de processamento de mensagens, tomada de decisão e tarefas automáticas.

---

## loop.ts — Núcleo do processamento

Exporta `processUserMessage()`, função principal chamada pelo Telegram quando chega uma mensagem.

**O que faz:**
- Constrói o prompt de sistema
- Recupera histórico e memória do usuário
- Chama o LLM (OpenRouter/Ollama/etc.)
- Executa ferramentas (web_search, ler arquivos, etc.)
- Detecta automaticamente quando precisa buscar na web
- Calcula custos por requisição
- Sanitiza a resposta final

Faz **até 10 iterações** — o LLM pode chamar ferramentas, ver resultados e iterar até chegar numa resposta final.

---

## heartbeat.ts — Tarefas automáticas agendadas

Exporta `registerHeartbeat()` e `startDefaultHeartbeats()`.

Usa `node-cron` para executar ações automaticamente em horários fixos.

**Por padrão** registra um heartbeat `daily-summary` que roda todo dia às 08:00 com o prompt:
> "Resuma o que aconteceu nas últimas 24 horas com base no histórico de conversas e fatos registrados."

---

## reflection.ts — Reflexão noturna / extração de fatos

Exporta `nightlyReflection()`, chamada pelo cron em `src/index.ts` todo dia às 02:00.

Pega as últimas 100 mensagens, manda pro LLM analisar e extrair fatos sobre o usuário (ex: "Usuário prefere respostas concisas", "Usuário trabalha com TypeScript"), e salva na memória de curto prazo.

---

## Fluxo resumido

```
Telegram recebe mensagem
  → bot.ts chama processUserMessage() [loop.ts]
    → loop.ts: monta sistema + histórico + memória
    → loop.ts: chama LLM (openrouter/ollama/etc)
    → loop.ts: se LLM pedir ferramenta, executa e volta pro LLM
    → loop.ts: retorna resposta final
  → bot.ts envia resposta ao Telegram

Paralelamente:
  → heartbeat.ts: 08:00 - resumo diário
  → reflection.ts: 02:00 - extrai fatos do usuário
```
