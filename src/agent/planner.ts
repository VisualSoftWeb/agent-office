import type { LLMProvider, Message } from "../llm/types.js";
import { getToolDefinitions } from "../tools/registry.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { TaskGraph, type Plan } from "./task-graph.js";
export type { Plan };

const PLAN_TRIGGERS = [
  "gere relatório", "prepare reunião", "agende", "envie para",
  "crie planilha", "analise contratos", "faça follow-up",
  "compile dados", "extraia do crm", "processe notas",
  "compare", "resuma", "sintetize", "elabore", "pesquise",
  "busque", "levante", "mapeie", "liste", "organize",
];

export function shouldPlan(userMessage: string): boolean {
  if (!config.PLANNER_ENABLED) return false;

  const msg = userMessage.toLowerCase();

  if (msg.length < 50 && PLAN_TRIGGERS.some((t) => msg.includes(t))) return true;

  const verbs = msg.match(/\b(\w+)\b/g) ?? [];
  const actionCount = verbs.filter((v) =>
    ["gere", "prepare", "agende", "envie", "crie", "analise", "faça",
     "compile", "extraia", "processe", "busque", "levante", "mapeie",
     "liste", "organize", "compare", "resuma", "sintetize", "elabore",
     "pesquise", "crie", "monte", "gere"].includes(v)
  ).length;

  return actionCount >= 2;
}

function buildPlannerPrompt(toolsDescription: string): string {
  return `Você é um planejador de tarefas de escritório. Dado um objetivo, quebre-o em sub-tarefas com dependências explícitas.

REGRAS:
- Cada tarefa deve ser executável chamando uma das ferramentas disponíveis
- Tarefas independentes PODEM rodar em paralelo (dependências vazias)
- Máximo de ${config.PLANNER_MAX_TASKS} tarefas
- Responda APENAS com o JSON do plano

Ferramentas disponíveis:
${toolsDescription}

Formato do JSON:
{"objective":"objetivo original","tasks":[
  {"id":"1","description":"descrição clara do que fazer","dependsOn":[]},
  {"id":"2","description":"outra tarefa","dependsOn":[]},
  {"id":"3","description":"depende de 1 e 2","dependsOn":["1","2"]}
]}`;
}

export async function createPlan(llm: LLMProvider, objective: string): Promise<Plan> {
  const tools = getToolDefinitions();
  const toolsDescription = tools
    .map((t) => `- ${t.function.name}: ${t.function.description} (parâmetros: ${JSON.stringify(t.function.parameters?.properties ?? {})})`)
    .join("\n");

  const messages: Message[] = [
    { role: "system", content: buildPlannerPrompt(toolsDescription) },
    { role: "user", content: objective },
  ];

  logger.info(`[PLANNER] Creating plan for: "${objective.slice(0, 100)}..."`);

  const response = await llm.chat(messages);

  if (!response.content) {
    logger.warn("[PLANNER] LLM returned empty plan, using reactive fallback");
    return fallbackPlan(objective);
  }

  const plan = parsePlan(response.content, objective);
  logger.info(`[PLANNER] Plan created: ${plan.tasks.length} tasks`);

  return plan;
}

function parsePlan(llmResponse: string, objective: string): Plan {
  const jsonMatch = llmResponse.match(/\{[\s\S]*"tasks"[\s\S]*\}/);
  if (!jsonMatch) {
    logger.warn("[PLANNER] No JSON found in LLM response, using fallback");
    return fallbackPlan(objective);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      logger.warn("[PLANNER] Invalid plan structure, using fallback");
      return fallbackPlan(objective);
    }

    const tasks = parsed.tasks.slice(0, config.PLANNER_MAX_TASKS).map((t: any, i: number) => ({
      id: `task_${i + 1}`,
      description: t.description || `Step ${i + 1}`,
      dependsOn: Array.isArray(t.dependsOn)
        ? t.dependsOn.map((d: string) => {
            const idx = parseInt(d, 10);
            return isNaN(idx) ? d : `task_${idx}`;
          })
        : [],
      status: "pending" as const,
    }));

    if (tasks.length === 0) return fallbackPlan(objective);

    return { objective, tasks };
  } catch (err) {
    logger.warn(`[PLANNER] JSON parse failed: ${err}`);
    return fallbackPlan(objective);
  }
}

function fallbackPlan(objective: string): Plan {
  return {
    objective,
    tasks: [
      { id: "task_1", description: objective, dependsOn: [], status: "pending" },
    ],
  };
}

export async function executeTask(
  llm: LLMProvider,
  taskDescription: string,
  objective: string,
  previousResults: string,
  userId?: string,
  chatId?: number,
  skipApproval?: boolean,
): Promise<string> {
  const { getToolDefinitions, executeToolCall } = await import("../tools/registry.js");
  const tools = getToolDefinitions();

  const systemMsg = `Você é um assistente executando uma tarefa como parte de um plano maior.

Objetivo geral: ${objective}

Tarefa atual: ${taskDescription}

Resultados de tarefas anteriores que podem ajudar:
${previousResults || "Nenhum ainda."}

Use as ferramentas disponíveis para completar sua tarefa. Responda com o resultado obtido.`;

  const messages: Message[] = [
    { role: "system", content: systemMsg },
    { role: "user", content: taskDescription },
  ];

  for (let i = 0; i < 3; i++) {
    const response = await llm.chat(messages, tools);

    if (response.tool_calls.length > 0) {
      messages.push({ role: "assistant", content: null, tool_calls: response.tool_calls });

      for (const tc of response.tool_calls) {
        const result = await executeToolCall(tc as any, userId, chatId, skipApproval);
        messages.push({
          role: "tool" as const,
          content: result,
          tool_call_id: tc.id,
          name: tc.function.name,
        });
      }
    } else if (response.content && response.content.trim().length > 0) {
      return response.content.trim();
    } else {
      messages.push({
        role: "user",
        content: "Please provide a complete result for this task.",
      });
    }
  }

  return "[Task completed with no final output]";
}

export async function executePlan(
  llm: LLMProvider,
  plan: Plan,
  userId?: string,
  chatId?: number,
  skipApproval?: boolean,
): Promise<string> {
  const graph = new TaskGraph();
  graph.load(plan);

  logger.info(`[PLANNER] Executing plan with ${plan.tasks.length} tasks`);

  while (!graph.isComplete()) {
    const readyTasks = graph.getReadyTasks();
    if (readyTasks.length === 0 && !graph.hasFailed()) {
      logger.warn("[PLANNER] Stuck: no ready tasks but not complete (possible cycle)");
      break;
    }

    const results = await Promise.all(
      readyTasks.map(async (task) => {
        graph.markRunning(task.id);
        logger.info(`[PLANNER] Running task ${task.id}: ${task.description.slice(0, 80)}`);

        try {
          const previousResults = graph.getAllResults();
          const result = await executeTask(
            llm, task.description, plan.objective,
            previousResults, userId, chatId, skipApproval
          );
          graph.markCompleted(task.id, result);
          logger.info(`[PLANNER] Task ${task.id} completed`);
          return { id: task.id, ok: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          graph.markFailed(task.id, msg);
          logger.error(`[PLANNER] Task ${task.id} failed: ${msg}`);
          return { id: task.id, ok: false, error: msg };
        }
      })
    );

    if (results.some((r) => !r.ok)) {
      const failedTasks = results.filter((r) => !r.ok);
      if (failedTasks.length === readyTasks.length) {
        logger.warn("[PLANNER] All parallel tasks failed, aborting plan");
        break;
      }
    }
  }

  const summary = graph.getSummary();
  const allResults = graph.getAllResults();
  logger.info(`[PLANNER] ${summary}`);

  return `[PLAN_RESULT]\n${summary}\n\nResults:\n${allResults}`;
}