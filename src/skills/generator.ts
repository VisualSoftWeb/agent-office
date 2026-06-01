import { writeFile, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLLMProvider } from "../llm/provider.js";
import { logger } from "../utils/logger.js";
import { generateId } from "../utils/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../../skills");

interface ToolCallSequence {
  task: string;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

const pendingSkills = new Map<string, ToolCallSequence>();

export function recordToolSequence(task: string, toolCalls: Array<{ name: string; args: Record<string, unknown> }>): void {
  const key = `${task}-${generateId()}`;
  pendingSkills.set(key, { task, toolCalls });

  if (pendingSkills.size >= 5) {
    generateSkill().catch((err) => logger.error("Skill generation failed:", err));
  }
}

async function generateSkill(): Promise<void> {
  const entries = Array.from(pendingSkills.values());
  pendingSkills.clear();

  if (entries.length === 0) return;

  const llm = getLLMProvider();
  const summary = entries.map((e) =>
    `Task: ${e.task}\nSteps:\n${e.toolCalls.map((tc) => `  - ${tc.name}(${JSON.stringify(tc.args)})`).join("\n")}`
  ).join("\n---\n");

  const response = await llm.chat([
    {
      role: "system",
      content: `You are a skill generator. Create a skill.md file that captures the patterns below so the agent can repeat them efficiently.
Return a skill.md file in this format:

# skill: <name>
## Description
<what this skill does>
## Trigger
<when to invoke this skill>
## Steps
<numbered step-by-step instructions>
## Tool Calls
<optional default tool call sequences>`,
    },
    {
      role: "user",
      content: `Analyze these repeated tool call sequences and produce a reusable skill:\n\n${summary}`,
    },
  ]);

  const content = response.content;
  if (!content) return;

  const name = `skill-${entries[0].task.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`;
  const filePath = path.join(SKILLS_DIR, `${name}.md`);
  await writeFile(filePath, content);
  logger.info(`Auto-generated skill: ${filePath}`);
}
