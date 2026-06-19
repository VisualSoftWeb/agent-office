# Memory — Sistema de Memória

A pasta `src/memory/` implementa os diferentes tipos de memória do agente: curto prazo (banco SQLite), semântica (vetores) e esquemas de dados.

---

## short-term.ts — Memória de curto prazo

Banco SQLite em `data/agent.db` com três tabelas:

- **messages** — histórico de conversas por usuário (limitado a 10 mensagens recentes)
- **facts** — fatos extraídos sobre cada usuário via reflexão
- **costs** — registro de custos por chamada de API

**Funções exportadas:**
- `addMessage()` — salva mensagem e remove as mais antigas se exceder o limite
- `getRecentMessages()` — recupera últimas N mensagens
- `upsertFact()` — insere ou atualiza fato sobre o usuário
- `getFacts()` — lista fatos conhecidos
- `addCost()` — registra custo de uma chamada
- `getDailyCost()` — soma dos custos do dia atual

---

## semantic.ts — Memória semântica (vetorial)

Armazena embeddings de textos para busca por similaridade.

- **Local:** usa um hash simples (dummyEmbed) quando `VECTOR_STORE=local`
- **Pinecone:** usa OpenAI embeddings quando `VECTOR_STORE=pinecone`
- `indexText()` — indexa um texto com embedding
- `searchSimilar()` — busca textos similares por similaridade de cosseno
- Limite: 500 entradas por usuário

---

## schema.ts — Tipos de dados

Define as interfaces TypeScript para os registros:
- **MessageRecord** — mensagem no banco
- **FactRecord** — fato sobre usuário
- **CostRecord** — registro de custo
