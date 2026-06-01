import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, "../../skills");

export interface Skill {
  name: string;
  description: string;
  content: string;
}

export async function loadSkills(): Promise<Skill[]> {
  try {
    const files = await readdir(SKILLS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    const skills: Skill[] = [];
    for (const file of mdFiles) {
      const content = await readFile(path.join(SKILLS_DIR, file), "utf-8");
      const nameMatch = content.match(/^# skill:\s*(.+)$/m);
      const descMatch = content.match(/^## Description\s*\n(.+)$/m);
      skills.push({
        name: nameMatch?.[1] ?? file.replace(".md", ""),
        description: descMatch?.[1] ?? "",
        content,
      });
    }
    return skills;
  } catch {
    return [];
  }
}
