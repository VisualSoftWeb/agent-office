import { describe, it, expect } from "vitest";
import { TaskGraph, type Plan } from "../src/agent/task-graph.js";

describe("TaskGraph", () => {
  it("should load tasks from a plan", () => {
    const plan: Plan = {
      objective: "Test objective",
      tasks: [
        { id: "task_1", description: "Step 1", dependsOn: [], status: "pending" },
        { id: "task_2", description: "Step 2", dependsOn: ["task_1"], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    expect(graph.getReadyTasks()).toHaveLength(1);
    expect(graph.getReadyTasks()[0].id).toBe("task_1");
  });

  it("should return ready tasks with met dependencies", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
        { id: "2", description: "B", dependsOn: ["1"], status: "pending" },
        { id: "3", description: "C", dependsOn: [], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    const ready = graph.getReadyTasks();
    expect(ready).toHaveLength(2);
    expect(ready.map((t) => t.id).sort()).toEqual(["1", "3"]);
  });

  it("should mark tasks completed and update readiness", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
        { id: "2", description: "B", dependsOn: ["1"], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    graph.markRunning("1");
    graph.markCompleted("1", "Done");
    const ready = graph.getReadyTasks();
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("2");
  });

  it("should detect completion", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    expect(graph.isComplete()).toBe(false);
    graph.markRunning("1");
    graph.markCompleted("1", "Done");
    expect(graph.isComplete()).toBe(true);
  });

  it("should detect failures", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    expect(graph.hasFailed()).toBe(false);
    graph.markRunning("1");
    graph.markFailed("1", "Error");
    expect(graph.hasFailed()).toBe(true);
  });

  it("should group tasks by levels", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
        { id: "2", description: "B", dependsOn: [], status: "pending" },
        { id: "3", description: "C", dependsOn: ["1", "2"], status: "pending" },
        { id: "4", description: "D", dependsOn: ["3"], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    const levels = graph.getLevels();
    expect(levels).toHaveLength(3);
    expect(levels[0].map((t) => t.id).sort()).toEqual(["1", "2"]);
    expect(levels[1].map((t) => t.id)).toEqual(["3"]);
    expect(levels[2].map((t) => t.id)).toEqual(["4"]);
  });

  it("should get summary string", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending" },
        { id: "2", description: "B", dependsOn: [], status: "pending" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    graph.markRunning("1");
    graph.markCompleted("1", "Done");
    graph.markRunning("2");
    graph.markFailed("2", "Fail");
    expect(graph.getSummary()).toContain("1/2 completed");
    expect(graph.getSummary()).toContain("1 failed");
  });

  it("should support subAgent field", () => {
    const plan: Plan = {
      objective: "Test",
      tasks: [
        { id: "1", description: "A", dependsOn: [], status: "pending", subAgent: "explore" },
      ],
    };
    const graph = new TaskGraph();
    graph.load(plan);
    const task = graph.getTask("1");
    expect(task?.subAgent).toBe("explore");
  });
});
