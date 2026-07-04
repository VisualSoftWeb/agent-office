# OpenCode — Ferramentas do Agente & Flags Úteis

> Guia completo de referência para usar o OpenCode de forma produtiva.

---

## Ferramentas do Agente (dentro da sessão)

Estas ferramentas estão disponíveis durante uma sessão interativa do OpenCode (`opencode` ou `opencode web`).

### `bash`

Executa comandos no terminal. Suporta PowerShell, Git, Docker, npm e qualquer outro comando do sistema.

```
bash: <comando>
```

**Exemplos:**
- `git status`
- `npm run dev`
- `docker compose up -d`
- `pytest tests/`

**Parâmetros:**
- `command` (obrigatório) — Comando a ser executado
- `timeout` (opcional) — Tempo limite em milissegundos (padrão: 120000)
- `workdir` (opcional) — Diretório de trabalho para o comando

---

### `read`

Lê o conteúdo de arquivos ou diretórios. Suporta imagens e PDFs.

```
read: <caminho_do_arquivo>
```

**Exemplos:**
- `read: src/index.ts` — Lê um arquivo TypeScript
- `read: src/` — Lista o conteúdo do diretório

**Parâmetros:**
- `filePath` (obrigatório) — Caminho absoluto do arquivo
- `offset` (opcional) — Número da linha inicial (começa em 1)
- `limit` (opcional) — Máximo de linhas a retornar

---

### `write`

Cria ou sobrescreve um arquivo. **Use com cuidado** — arquivos existentes serão substituídos.

```
write: <caminho> <conteúdo>
```

**Parâmetros:**
- `filePath` (obrigatório) — Caminho absoluto do arquivo
- `content` (obrigatório) — Conteúdo a ser escrito

> ⚠️ Para arquivos existentes, use `edit` para edições parciais.

---

### `edit`

Realiza substituições exatas em arquivos. Ideal para edições pontuais sem reescrever o arquivo inteiro.

```
edit: <caminho> <antigo> <novo>
```

**Parâmetros:**
- `filePath` (obrigatório) — Caminho absoluto do arquivo
- `oldString` (obrigatório) — Texto original a ser substituído
- `newString` (obrigatório) — Novo texto
- `replaceAll` (opcional) — Substitui todas as ocorrências (padrão: false)

**Dica:** Use `replaceAll: true` para renomear variáveis ou funções em todo o arquivo.

---

### `glob`

Busca arquivos por padrão de nome (glob pattern). Funciona com qualquer tamanho de projeto.

```
glob: <padrão>
```

**Exemplos:**
- `**/*.ts` — Todos os arquivos TypeScript
- `src/**/*.test.ts` — Todos os testes em src/
- `.env*` — Arquivos .env, .env.example, etc.

**Parâmetros:**
- `pattern` (obrigatório) — Padrão glob
- `path` (opcional) — Diretório raiz para busca

---

### `grep`

Busca conteúdo dentro de arquivos usando expressões regulares.

```
grep: <padrão_regex>
```

**Exemplos:**
- `import.*from` — Busca imports
- `TODO|FIXME` — Busca TODOs e FIXMEs
- `function\s+\w+` — Busca declarações de funções

**Parâmetros:**
- `pattern` (obrigatório) — Expressão regular
- `path` (opcional) — Diretório para buscar
- `include` (opcional) — Padrão de arquivos (ex: `*.ts`)

---

### `webfetch`

Busca conteúdo de uma URL. Converte automaticamente para Markdown.

```
webfetch: <url>
```

**Parâmetros:**
- `url` (obrigatório) — URL completa para buscar
- `format` (opcional) — Formato de saída: `markdown` (padrão), `text`, `html`
- `timeout` (opcional) — Tempo limite em segundos (máximo: 120)

---

### `websearch`

Pesquisa na web em tempo real. Retorna resultados atualizados.

```
websearch: <consulta>
```

**Parâmetros:**
- `query` (obrigatório) — Termo de busca
- `numResults` (opcional) — Número de resultados (padrão: 8)
- `type` (opcional) — `auto`, `fast`, `deep`
- `livecrawl` (opcional) — `fallback` ou `preferred`

> ⚠️ O OpenCode usa o ano atual (2026) em buscas automaticamente.

---

### `task`

Lança um sub-agente para realizar tarefas complexas e multistep de forma autônoma.

```
task: <descrição>
```

**Subagentes disponíveis:**
- `explore` — Exploração rápida de código (grep, glob, leitura)
- `general` — Tarefas gerais e complexas

**Parâmetros:**
- `description` (obrigatório) — Descrição curta da tarefa (3-5 palavras)
- `prompt` (obrigatório) — Instrução detalhada para o agente
- `subagent_type` (obrigatório) — Tipo do subagente
- `task_id` (opcional) — ID para continuar uma tarefa anterior
- `command` (opcional) — Comando que disparou a tarefa

---

### `todowrite`

Cria e mantém uma lista de tarefas estruturada para a sessão atual.

```
todowrite: <lista_de_tarefas>
```

**Estados:**
- `pending` — Não iniciada
- `in_progress` — Em andamento (apenas uma por vez)
- `completed` — Concluída
- `cancelada` — Não necessária

**Exemplo:**
```
todowrite:
- content: "Corrigir bug no login"
  status: in_progress
  priority: high
- content: "Escrever testes"
  status: pending
  priority: medium
```

**Parâmetros:**
- `todos` (obrigatório) — Array de objetos com `content`, `status`, `priority`

---

### `question`

Faz perguntas ao usuário durante a execução. Permite coletar preferências e decisões.

```
question: <pergunta>
```

**Parâmetros:**
- `questions` (obrigatório) — Array de objetos com `question`, `header`, `options`
- `multiple` (opcional) — Permite selecionar múltiplas opções

---

### `skill`

Carrega uma skill especializada (instruções e workflows) para tarefas específicas.

```
skill: <nome_da_skill>
```

**Skills disponíveis:**
- `customize-opencode` — Edição de configuração do OpenCode
- `sap-cap` — Desenvolvimento SAP CAP

**Parâmetros:**
- `name` (obrigatório) — Nome da skill a carregar

---

## Flags Úteis do CLI

### Conexão e Sessão

| Flag | Descrição |
|------|-----------|
| `-c, --continue` | Continua a última sessão |
| `-s, --session <id>` | Continua uma sessão específica |
| `--fork` | Cria uma cópia da sessão (usar com `--continue`) |
| `--attach <url>` | Conecta a um servidor rodando |

### Modelo e Provider

| Flag | Descrição |
|------|-----------|
| `-m, --model <provider/model>` | Define o modelo a usar |
| `--prompt <texto>` | Define o prompt do sistema |
| `--agent <nome>` | Usa um agent específico |

### Interface

| Flag | Descrição |
|------|-----------|
| `--mini` | Interface minimalista |
| `--no-replay` | Sem replay de histórico ao retomar |
| `--replay-limit <N>` | Limita replay às N mensagens mais recentes |
| `--pure` | Roda sem plugins externos |

### Servidor

| Flag | Descrição |
|------|-----------|
| `--port <porta>` | Porta do servidor (padrão: aleatória) |
| `--hostname <host>` | Hostname (padrão: 127.0.0.1) |
| `--cors <domínios>` | Domínios extras para CORS |
| `--mdns` | Habilita descoberta mDNS |
| `--mdns-domain <domínio>` | Domínio customizado para mDNS |

### Permissões

| Flag | Descrição |
|------|-----------|
| `--auto` | Auto-aprova permissões não negadas (**perigoso!**) |

### Debug e Logs

| Flag | Descrição |
|------|-----------|
| `--print-logs` | Mostra logs no stderr |
| `--log-level <level>` | Nível: `DEBUG`, `INFO`, `WARN`, `ERROR` |

### Versão e Atualização

| Flag | Descrição |
|------|-----------|
| `-v, --version` | Mostra versão do OpenCode |
| `-h, --help` | Mostra ajuda |

---

## Comandos Rápidos

| Comando | Ação |
|---------|------|
| `opencode` | Inicia TUI interativo |
| `opencode web` | Inicia interface web |
| `opencode models` | Lista modelos disponíveis |
| `opencode providers` | Gerencia credenciais |
| `opencode stats` | Mostra uso de tokens |
| `opencode session` | Gerencia sessões |
| `opencode db` | Ferramentas de banco de dados |
| `opencode debug` | Troubleshooting |
| `opencode upgrade` | Atualiza para última versão |

---

## Atalhos de Teclado (TUI)

| Tecla | Ação |
|-------|------|
| `Ctrl+P` | Paleta de comandos |
| `Ctrl+C` | Cancelar/Sair |
| `Tab` | Autocompletar |
| `↑/↓` | Navegar no histórico |

---

*Gerado em: 2026-07-04*
