import { logger } from "../utils/logger.js";

export type TaskStatus = "pending" | "running" | "completed" | "failed";

export interface PlanTask {
  id: string;
  description: string;
  dependsOn: string[];
  status: TaskStatus;
  result?: string;
  subAgent?: string;
}

export interface Plan {
  objective: string;
  tasks: PlanTask[];
}

export class TaskGraph {
  private tasks = new Map<string, PlanTask>();

  load(plan: Plan): void {
    this.tasks.clear();
    for (const t of plan.tasks) {
      this.tasks.set(t.id, { ...t, status: "pending" });
    }
  }

  getReadyTasks(): PlanTask[] {
    const ready: PlanTask[] = [];
    for (const task of this.tasks.values()) {
      if (task.status !== "pending") continue;
      const depsMet = task.dependsOn.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep?.status === "completed";
      });
      if (depsMet) ready.push(task);
    }
    return ready;
  }

  markRunning(id: string): void {
    const task = this.tasks.get(id);
    if (task) task.status = "running";
  }

  markCompleted(id: string, result: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "completed";
      task.result = result;
    }
  }

  markFailed(id: string, error: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = "failed";
      task.result = `[ERROR] ${error}`;
    }
  }

  isComplete(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "pending" || task.status === "running") return false;
    }
    return true;
  }

  hasFailed(): boolean {
    for (const task of this.tasks.values()) {
      if (task.status === "failed") return true;
    }
    return false;
  }

  getLevels(): PlanTask[][] {
    const levels: PlanTask[][] = [];
    const visited = new Set<string>();

    while (visited.size < this.tasks.size) {
      const level: PlanTask[] = [];
      for (const task of this.tasks.values()) {
        if (visited.has(task.id)) continue;
        const depsMet = task.dependsOn.every((depId) => visited.has(depId));
        if (depsMet) level.push(task);
      }
      if (level.length === 0) break;
      for (const t of level) visited.add(t.id);
      levels.push(level);
    }

    return levels;
  }

  getTask(id: string): PlanTask | undefined {
    return this.tasks.get(id);
  }

  getAllResults(): string {
    const completed: string[] = [];
    for (const task of this.tasks.values()) {
      if (task.status === "completed" && task.result) {
        completed.push(`[${task.id}] ${task.description}\n${task.result}`);
      }
    }
    return completed.join("\n\n");
  }

  getSummary(): string {
    const total = this.tasks.size;
    const completed = Array.from(this.tasks.values()).filter((t) => t.status === "completed").length;
    const failed = Array.from(this.tasks.values()).filter((t) => t.status === "failed").length;
    return `Tasks: ${completed}/${total} completed, ${failed} failed`;
  }
}