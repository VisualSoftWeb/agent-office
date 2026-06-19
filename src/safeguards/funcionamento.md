# Safeguards — Segurança e Limites

A pasta `src/safeguards/` protege o sistema contra uso indevido, custos excessivos e ataques de injeção de prompt.

---

## approvals.ts — Sistema de aprovação

Gerencia aprovação do usuário para ações destrutivas:

- `requiresApproval()` — verifica se a ferramenta precisa de aprovação (padrões: `delete`, `remove`, `rm`, etc.)
- `createApprovalRequest()` — cria um pedido de aprovação com ID único
- `resolveApproval()` — aprova ou rejeita um pedido
- `consumeApproval()` — consome e remove pedido após processado
- `cleanupExpiredApprovals()` — limpa pedidos expirados baseado em `APPROVAL_TIMEOUT`

---

## costs.ts — Controle de custos

- `checkCostLimit()` — verifica se o gasto diário está dentro do limite
- `getCostSummary()` — retorna resumo formatado do custo diário
- Usa `getDailyCost()` da memória de curto prazo
- Limite configurável via `DAILY_COST_LIMIT` (padrão: $2.00)

---

## prompt-defense.ts — Proteção contra injeção de prompt

- `checkUserMessage()` — detecta tentativas de injeção (patterns como "ignore all previous instructions", "you are now", etc.)
- `sanitizeToolOutput()` — sanitiza saída de ferramentas substituindo tags HTML/XML sensíveis
- `wrapToolOutput()` — encapsula resultado de ferramenta em tag segura
