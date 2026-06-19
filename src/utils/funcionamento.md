# Utils — Utilitários

A pasta `src/utils/` contém funções auxiliares usadas por todo o sistema.

---

## logger.ts — Sistema de log

- Logger simples com 4 níveis: `debug`, `info`, `warn`, `error`
- Formato: `[timestamp] [LEVEL] mensagem`
- Usa `console.log` para todos os níveis exceto `error` (usa `console.error`)

---

## helpers.ts — Funções auxiliares

- `generateId()` — gera UUID v4
- `nowISO()` — retorna timestamp ISO atual
- `truncate()` — trunca string com `...` no final

---

## metrics.ts — Métricas de desempenho

- Armazena amostras de tempo de execução (LLM, ferramentas, respostas)
- Máximo de 100 amostras mantidas
- `recordMetric()` — registra uma amostra
- `getMetricsReport()` — gera relatório formatado com médias, mínimos e máximos
- `getLastResponseTime()` — retorna tempo da última resposta
