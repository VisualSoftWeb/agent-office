import { Telegraf } from "telegraf";
import { logger } from "../utils/logger.js";
import type { BotContext } from "./bot.js";
import { processUserMessage } from "../agent/loop.js";
import { checkUserMessage } from "../safeguards/prompt-defense.js";
import { checkCostLimit } from "../safeguards/costs.js";
import { transcribe } from "../voice/speech-to-text.js";
import { synthesize } from "../voice/text-to-speech.js";
import { createApprovalRequest, getPendingApproval } from "../safeguards/approvals.js";
import { Markup } from "telegraf";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function registerMessageHandler(bot: Telegraf<BotContext>): void {
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id.toString() ?? "unknown";
    const text = ctx.message.text;
    logger.debug(`Text handler called: userId=${userId}, text="${text.slice(0, 50)}"`);

    if (!checkCostLimit()) {
      await ctx.reply("Daily cost limit reached. Cannot process more requests today.");
      return;
    }

    const check = checkUserMessage(text);
    if (!check.safe) {
      await ctx.reply(check.reason!);
      return;
    }

    await ctx.reply("⏳ Processing...");

    try {
      const result = await processUserMessage(userId, text);
      await ctx.reply(result, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error("Agent error:", err);
      await ctx.reply("Desculpe, ocorreu um erro inesperado. Já registrei para análise.");
    }
  });

  bot.on("voice", async (ctx) => {
    const userId = ctx.from?.id.toString() ?? "unknown";

    try {
      const file = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
      const response = await fetch(file.href);
      const buffer = Buffer.from(await response.arrayBuffer());
      const audioPath = path.resolve(__dirname, `../../data/voice-${userId}.ogg`);
      await writeFile(audioPath, buffer);

      const transcribed = await transcribe(audioPath);
      if (!transcribed) {
        await ctx.reply("Could not transcribe audio.");
        return;
      }

      await ctx.reply(`🎤 Transcrevi: "${transcribed}"`);
      const result = await processUserMessage(userId, transcribed);

      const audioFile = await synthesize(result);
      if (audioFile) {
        await ctx.replyWithAudio({ source: audioFile });
        await unlink(audioFile).catch(() => {});
      } else {
        await ctx.reply(result);
      }
    } catch (err) {
      logger.error("Voice processing error:", err);
      await ctx.reply("Desculpe, ocorreu um erro ao processar seu áudio. Já registrei para análise.");
    }
  });

  bot.action(/approve:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const userId = ctx.from?.id.toString() ?? "unknown";
    const request = getPendingApproval(userId);
    if (request && request.id === id) {
      request.resolved = true;
      request.approved = true;
      await ctx.editMessageText("✅ Action approved.");
    }
  });

  bot.action(/reject:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const userId = ctx.from?.id.toString() ?? "unknown";
    const request = getPendingApproval(userId);
    if (request && request.id === id) {
      request.resolved = true;
      request.approved = false;
      await ctx.editMessageText("❌ Action rejected.");
    }
  });
}
