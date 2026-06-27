O que dá pra melhorar (para ficar mais moderno ainda):
1. Streaming — response token a token no Telegram (mais responsivo)
2. Observabilidade — logs estruturados, tracing (OpenTelemetry)
3. Testes automatizados — tem quase zero testes unitários
4. Webhook em vez de polling (se tiver um domínio/public IP)
5. Tool-call parsing — o loop.ts faz parsing textual frágil com regex em vez de usar tool_calls nativos do OpenAI SDK
6. Rate limiting por usuário (além do cost limit)
7. Containerização do bot (Docker)



Seu agente hoje é puramente reativo — o LLM decide UM passo por vez, sem visão do todo. O Tópico 5 propõe uma fase de planejamento onde o agente primeiro estrutura o objetivo em sub-tarefas com dependências, depois executa.
Arquitetura Proposta
[Entrada do usuário]
       │
       ▼
┌─────────────────────────────┐
│  DECISÃO: Planejar ou agir? │  ← Nova lógica
│  Simples (1 tool)? → reativo │     (heurística)
│  Complexo? → planejar       │
└──────────┬──────────────────┘
           │ (se complexo)
           ▼
┌─────────────────────────────┐
│  FASE 1: PLANEJAMENTO       │  ← NOVO
│  LLM → cria Plano (JSON)    │
│  Task Decomposition         │
│  Dependências entre tarefas │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  FASE 2: EXECUÇÃO (DAG)     │  ← NOVO engine
│  Tarefas independentes →    │
│    Promise.all (paralelo)   │
│  Tarefas dependentes →      │
│    sequencial em ordem      │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  FASE 3: VERIFICAÇÃO        │  ← NOVO
│  Plano completo? → fim      │
│  Faltou algo? → replanejar  │
└──────────┬──────────────────┘
           ▼
        Resposta final
Novos Arquivos
1. src/agent/planner.ts (NOVO)
Responsabilidade: Fase de planejamento — LLM gera um plano estruturado.
interface PlanTask {
  id: string
  description: string       // O que fazer
  dependsOn: string[]       // IDs das tarefas das quais depende
  status: TaskStatus         // pending | running | completed | failed
  result?: string
  subAgent?: string          // explore | code | default (futuro)
}

interface Plan {
  objective: string
  tasks: PlanTask[]
}
Funções:
- shouldPlan(userMessage: string): boolean — heurística para decidir se planeja
- createPlan(llm, objective, context): Promise<Plan> — chama LLM com prompt especial de planejamento
- parsePlan(llmResponse: string): Plan — extrai JSON do plano da resposta
Prompt de planejamento:
[system]
You are a planning agent. Given an objective, break it into sub-tasks
with explicit dependencies. Output ONLY a JSON plan.

Example:
{"tasks":[
  {"id":"1","description":"Buscar relatórios Gartner","dependsOn":[]},
  {"id":"2","description":"Coletar dados funding 2025-2026","dependsOn":[]},
  {"id":"3","description":"Sintetizar insights","dependsOn":["1","2"]}
]}
Heurística shouldPlan:
- Mensagens curtas (< 50 chars, 1 verbo) → reativo
- Mensagens com múltiplos verbos/etapas → planejar
- Palavras-chave: "pesquise", "crie", "analise", "compare", "elabore", "relatório"
2. src/agent/task-graph.ts (NOVO)
Responsabilidade: Engine de execução de DAG.
class TaskGraph {
  addTask(task: PlanTask): void
  addDependency(fromId: string, toId: string): void
  
  getReadyTasks(): PlanTask[]      // Sem dependências pendentes
  markCompleted(id: string): void
  markFailed(id: string): void
  isComplete(): boolean
  getExecutionPlan(): PlanTask[][]  // Agrupados por nível (paralelizáveis)
}
Funções:
- executeTask(task, userId, chatId): Promise<string> — executa UMA tarefa (pode chamar o LLM + tools)
- executePlan(plan, userId, chatId): Promise<Map<string, string>> — orquestra execução:
1. Pega tarefas ready (sem dependências)
2. Executa em paralelo via Promise.all
3. Atualiza status
4. Repete até todas completarem
5. Retorna mapa de resultados por task ID
3. Modificar src/agent/loop.ts
Mudanças:
- Logo após receber a mensagem do usuário, chama shouldPlan()
- Se deve planejar → chama createPlan() → executePlan()
- Se não → mantém o loop reativo atual
- Ao final da execução do plano, coleta resultados e gera resposta final
Prompt do Sistema (modificações)
Adicionar seção no buildSystemPrompt:
=== PLANEJAMENTO ===
Para tarefas complexas (múltiplas etapas, pesquisa, análise),
você DEVE criar um plano antes de executar.
O plano é uma lista de tarefas com dependências.
Tarefas independentes podem rodar em paralelo.
Tarefas dependentes rodam em ordem sequencial.

Exemplo de plano bom:
{"tasks":[
  {"id":"1","description":"Pesquisar dados X","dependsOn":[]},
  {"id":"2","description":"Pesquisar dados Y","dependsOn":[]},
  {"id":"3","description":"Cruzar dados X e Y","dependsOn":["1","2"]}
]}
Dependências do Código Atual
Funcionalidade existente	Como se integra
src/llm/types.ts (LLMProvider)	Planner reusa o mesmo provider
src/tools/registry.ts	Task executor chama executeToolCall()
src/memory/short-term.ts	Cada task registra seu custo/histórico
src/utils/logger.ts	Log de planos criados e tasks executadas
src/telegram/handlers.ts	Resposta final enviada normalmente
src/safeguards/approvals.ts	Tasks destrutivas passam pelo approval system
