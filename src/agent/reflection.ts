import { getLLMProvider } from "../llm/provider.js";
import { getRecentMessages, getFacts, upsertFact } from "../memory/short-term.js";
import { logger } from "../utils/logger.js";

export async function nightlyReflection(userId: string): Promise<void> {
  logger.info(`Starting nightly reflection for user ${userId}`);

  const recentMessages = getRecentMessages(userId, 100);
  if (recentMessages.length < 5) {
    logger.info("Not enough messages for reflection");
    return;
  }

  const existingFacts = getFacts(userId).map((f) => `- ${f.fact}`).join("\n");
  const conversationLog = recentMessages
    .slice(0, 50)
    .map((m) => `[${m.role}]: ${m.content.slice(0, 300)}`)
    .join("\n");

  const llm = getLLMProvider();
  const response = await llm.chat([
    {
      role: "system",
      content: `You are a reflection agent. Analyze recent conversations and extract facts about the user.
Existing facts:
${existingFacts}

Return ONLY a JSON array of strings, each being a factual statement about the user. Example:
["User prefers concise answers", "User works with TypeScript", "User's timezone is America/Sao_Paulo"]`,
    },
    {
      role: "user",
      content: `Recent conversation:\n${conversationLog}\n\nExtract new or updated facts.`,
    },
  ]);

  try {
    const parsed = JSON.parse(response.content ?? "[]");
    const facts: string[] = Array.isArray(parsed) ? parsed : [];
    for (const fact of facts) {
      upsertFact(userId, fact, "reflection");
    }
    logger.info(`Reflection added ${facts.length} facts for user ${userId}`);
  } catch {
    logger.warn("Failed to parse reflection output");
  }
}
