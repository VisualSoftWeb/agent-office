# Tools — Ferramentas do Agente

A pasta `src/tools/` implementa as ferramentas que o LLM pode invocar para interagir com o sistema do usuário e a web.

---

## registry.ts — Registro e execução

- `registerTool()` — registra uma ferramenta com nome, definição e handler
- `getToolDefinitions()` — retorna definições de todas as ferramentas (enviado ao LLM)
- `executeToolCall()` — executa uma chamada de ferramenta:
  1. Verifica se a ferramenta existe
  2. Verifica se precisa de aprovação (ações destrutivas)
  3. Executa o handler e retorna resultado ou erro

---

## web-search.ts — Busca na web

- Faz scraping do HTML do DuckDuckGo
- Cache de resultados por 5 minutos
- 3 tentativas com backoff em caso de rate limit
- Rotação de User-Agent entre 3 perfis
- Extrai resultados com 3 estratégias de parsing diferentes (v1, v2, v3)

---

## search-files.ts — Busca de arquivos

- Varre diretórios recursivamente até profundidade 8
- Suporta padrões glob-like: `*.pdf`, `*fatura*`, `relatorio*`
- Exclui diretórios de sistema (Windows, node_modules, AppData, etc.)
- Timeout de 15s, máximo de 20 resultados
- Retorna caminho completo, tamanho e data de modificação

---

## read-file.ts — Leitura de arquivos

- Lê arquivos de texto (JS, TS, JSON, MD, TXT, etc.)
- Máximo 100 KB para texto
- Máximo 4000 caracteres de saída
- Detecta arquivos binários (PDF, PNG, ZIP, etc.) e retorna metadados
- Detecta imagens e retorna informações

---

## send-file.ts — Envio de arquivos

- Envia arquivos diretamente para o chat do Telegram
- Suporta imagens (como foto) e documentos
- Resolve caminhos relativos (Desktop, Downloads)
- Máximo 50 MB

---

## delete-file.ts — Deleção de arquivos

- Exclui arquivos ou pastas vazias
- **Protege diretórios de sistema** (Windows, Program Files, AppData, etc.)
- Requer `confirm=true` para executar
- Não permite deletar pastas não-vazias sem `recursive=true`
- Mensagens de erro claras para permissão, não encontrado, etc.

---

## tool-result.ts — Formatação de resultados

- `truncateText()` — trunca texto longo (padrão 4000 chars)
- `wrapToolResult()` — encapsula resultado em tag XML `<tool-result>`
- `wrapToolError()` — encapsula erro em tag `<tool-error>` com metadados
- `isRecoverable()` — detecta erros temporários (timeout, rate limit, etc.)

---

## index.ts — Barrel

Importa todas as ferramentas para que sejam registradas automaticamente:
```ts
import "./web-search.js";
import "./read-file.js";
import "./search-files.js";
import "./send-file.js";
import "./delete-file.js";
```
