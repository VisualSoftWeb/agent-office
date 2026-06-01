# Análise de Melhorias e Otimizações — Telegram AI Agent

Este documento apresenta uma análise técnica detalhada sobre as recentes modificações implementadas no bot de Telegram, destacando correções críticas de arquitetura, pontos de atenção e alternativas viáveis de evolução de recursos.

---

## 1. Correção Crítica no Fluxo do Agente (`src/agent/loop.ts`)

### O Problema: Quebra de Alternância de Papéis (Roles)

Ao implementar o tratamento para respostas nulas/vazias (`content: null`), foi inserido um re-prompt enviado diretamente ao modelo no bloco `else`:

```typescript
} else {
  emptyResponseCount++;
  if (emptyResponseCount >= MAX_EMPTY_RETRIES) {
    logger.warn(`LLM returned empty content ${MAX_EMPTY_RETRIES} times consecutively for user ${userId}`);
    return "I'm sorry, I couldn't generate a proper response. Please try rephrasing your question.";
  }
  messages.push({
    role: "user",
    content: "Please provide a complete response to the user's original question based on the information you have gathered so far.",
  });
}
```

> [!WARNING]  
> **Bug Crítico de API:** Se o assistente retornar vazio, você não adiciona nenhuma mensagem com papel (`role`) `"assistant"` na lista `messages` antes de empilhar a mensagem do `"user"` com o re-prompt. 
>
> Provedores rígidos de LLM (como a API oficial da **Anthropic/Claude** ou regras rígidas em wrappers da OpenAI) exigem a alternância estrita e contínua de mensagens (`user` -> `assistant` -> `user`). O envio de duas mensagens de `user` seguidas resultará em um erro imediato da API (ex: `400 Bad Request: messages: alternative roles required`).

### Solução Proposta:
Injetar uma resposta simulada do assistente (um placeholder de "pensamento" ou processamento) antes de emitir o re-prompt do usuário. Dessa forma, a alternância de turnos é preservada perfeitamente.

```diff
  } else {
    emptyResponseCount++;
    if (emptyResponseCount >= MAX_EMPTY_RETRIES) {
      logger.warn(`LLM returned empty content ${MAX_EMPTY_RETRIES} times consecutively for user ${userId}`);
      return "I'm sorry, I couldn't generate a proper response. Please try rephrasing your question.";
    }
+   
+   // Mantém a alternância estrita de papéis exigida pelas APIs de LLM
+   messages.push({
+     role: "assistant",
+     content: "[Processing state...]"
+   });

    messages.push({
      role: "user",
      content: "Please provide a complete response to the user's original question based on the information you have gathered so far.",
    });
  }
```

---

## 2. Resiliência do Web Search (`src/tools/web-search.ts`)

A migração de buscas para o DuckDuckGo HTML (`html.duckduckgo.com`) resolveu brilhantemente a falta de informações recentes no bot (esportes, notícias e tempo). No entanto, o scraping cru de HTML introduz riscos operacionais.

### Pontos de Atenção:
1. **Fragilidade do Parser (Regex):** O método `extractResults` divide e analisa o HTML puro usando expressões regulares para capturar `result__a` e `result__snippet`. Se o DuckDuckGo atualizar sua estrutura HTML/classes CSS, a busca parará de funcionar silenciosamente, retornando sempre resultados vazios.
2. **Bloqueio de IP (Captchas):** Requisições consecutivas sem uso de proxies ou rotações podem disparar bloqueios preventivos de IP no servidor do DuckDuckGo.

### Alternativas de APIs Estruturadas (Com Planos Gratuitos):

Para escala de produção e alta resiliência, a migração para uma API estruturada oficial é altamente recomendada. Veja as opções:

| API de Busca | Cota Gratuita (Free Tier) | Custo Adicional | Principais Benefícios |
| :--- | :--- | :--- | :--- |
| **Brave Search API** | **2.000 buscas/mês** (66 por dia) | ~ US$ 3.00 / 1.000 buscas | API independente de terceiros (não usa Google/Bing), muito rápida e estruturada em JSON limpo. |
| **Tavily Search API** | **1.000 buscas/mês** | Planos desde US$ 15.00/mês | Desenvolvida exclusivamente para agentes de IA. Ela já limpa, filtra e resume o conteúdo economizando tokens. |
| **Serper.dev** | **2.500 buscas de boas-vindas** | ~ US$ 1.00 / 1.000 buscas | Traz dados exatos do buscador oficial do Google de forma extremamente barata e rápida. |
| **Google Custom Search** | **100 buscas/dia** (3.000/mês) | ~ US$ 5.00 / 1.000 buscas | Canal oficial do Google com limite diário renovável. |
| **SearXNG** | **100% Gratuito e Sem Limites** | Grátis (auto-hospedado) | Metabuscardor open-source que você mesmo hospeda no Docker. Sem chaves de API externas ou limites comerciais. |

---

## 3. Melhores Práticas Identificadas

* **Excelente Tratamento de Erros e Logs:** A implementação de `logger.warn` no `loop.ts` é uma fantástica prática de observabilidade que facilitará muito o debug remoto.
* **Timeout na Busca:** A inclusão de `AbortSignal.timeout(15000)` impede travamentos infinitos na chamada de rede, mantendo o bot responsivo.
