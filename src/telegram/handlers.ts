import { Telegraf } from "telegraf";
import { logger } from "../utils/logger.js";
import type { BotContext } from "./bot.js";
import { processUserMessage } from "../agent/loop.js";
import { checkUserMessage } from "../safeguards/prompt-defense.js";
import { checkCostLimit } from "../safeguards/costs.js";
import { transcribe } from "../voice/speech-to-text.js";
import { synthesize } from "../voice/text-to-speech.js";
import { getApprovalById, resolveApproval, consumeApproval } from "../safeguards/approvals.js";
import { Markup } from "telegraf";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseApprovalResponse(text: string): { approvalId: string; toolName: string } | null {
  const match = text.match(/<approval-required id="([^"]+)" tool="([^"]+)">/);
  if (match) {
    return { approvalId: match[1], toolName: match[2] };
  }
  return null;
}

async function waitForApprovalResolution(approvalId: string, timeoutMs: number = 120000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const request = getApprovalById(approvalId);
    if (request?.resolved) {
      return request.approved;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

export function registerMessageHandler(bot: Telegraf<BotContext>): void {
  bot.on("text", async (ctx) => {
    const userId = ctx.from?.id.toString() ?? "unknown";
    const chatId = ctx.chat?.id;
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
      const result = await processUserMessage(userId, text, chatId);

      const approvalInfo = parseApprovalResponse(result);
      if (approvalInfo && chatId) {
        const approvalMsg = `⚠️ **Aprovação Necessária**\n\n` +
          `O agente quer executar: **${approvalInfo.toolName}**\n` +
          `ID: \`${approvalInfo.approvalId}\`\n\n` +
          `Clique em **Aprovar** ou **Rejeitar**:`;

        await ctx.reply(approvalMsg, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            Markup.button.callback("✅ Aprovar", `approve:${approvalInfo.approvalId}`),
            Markup.button.callback("❌ Rejeitar", `reject:${approvalInfo.approvalId}`),
          ]),
        });

        const approved = await waitForApprovalResolution(approvalInfo.approvalId);

        if (approved) {
          await ctx.reply("✅ Aprovado! Re-processando...");
          const retryResult = await processUserMessage(userId, text, chatId, undefined, true);
          await ctx.reply(retryResult, { parse_mode: "Markdown" });
        } else {
          await ctx.reply("❌ Ação rejeitada ou expirada.");
        }
      } else {
        await ctx.reply(result, { parse_mode: "Markdown" });
      }
    } catch (err) {
      logger.error("Agent error:", err);
      await ctx.reply("Desculpe, ocorreu um erro inesperado. Já registrei para análise.");
    }
  });

  bot.on("voice", async (ctx) => {
    const userId = ctx.from?.id.toString() ?? "unknown";
    const chatId = ctx.chat?.id;

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
      const result = await processUserMessage(userId, transcribed, chatId);

      const approvalInfo = parseApprovalResponse(result);
      if (approvalInfo && chatId) {
        const approvalMsg = `⚠️ **Aprovação Necessária**\n\n` +
          `O agente quer executar: **${approvalInfo.toolName}**\n` +
          `ID: \`${approvalInfo.approvalId}\`\n\n` +
          `Clique em **Aprovar** ou **Rejeitar**:`;

        await ctx.reply(approvalMsg, {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            Markup.button.callback("✅ Aprovar", `approve:${approvalInfo.approvalId}`),
            Markup.button.callback("❌ Rejeitar", `reject:${approvalInfo.approvalId}`),
          ]),
        });

        const approved = await waitForApprovalResolution(approvalInfo.approvalId);

        if (approved) {
          await ctx.reply("✅ Aprovado! Re-processando...");
          const retryResult = await processUserMessage(userId, transcribed, chatId, undefined, true);
          const audioFile = await synthesize(retryResult);
          if (audioFile) {
            await ctx.replyWithAudio({ source: audioFile });
            await unlink(audioFile).catch(() => {});
          } else {
            await ctx.reply(retryResult);
          }
        } else {
          await ctx.reply("❌ Ação rejeitada ou expirada.");
        }
      } else {
        const audioFile = await synthesize(result);
        if (audioFile) {
          await ctx.replyWithAudio({ source: audioFile });
          await unlink(audioFile).catch(() => {});
        } else {
          await ctx.reply(result);
        }
      }
    } catch (err) {
      logger.error("Voice processing error:", err);
      await ctx.reply("Desculpe, ocorreu um erro ao processar seu áudio. Já registrei para análise.");
    }
  });

  bot.on("photo", async (ctx) => {
    const userId = ctx.from?.id.toString() ?? "unknown";
    const chatId = ctx.chat?.id;
    const caption = ctx.message.caption || "";

    try {
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.telegram.getFileLink(largest.file_id);
      const response = await fetch(file.href);
      const buffer = Buffer.from(await response.arrayBuffer());

      const ext = path.extname(file.href) || ".jpg";
      const imagePath = path.resolve(__dirname, `../../data/photo-${userId}${ext}`);
      await writeFile(imagePath, buffer);

      await ctx.reply(`📸 Imagem recebida (${(buffer.length / 1024).toFixed(1)} KB). Processando OCR...`);

      const prompt = caption
        ? `Imagem salva em: ${imagePath}\n\nLegenda do usuário: ${caption}\n\nUse ler_imagem para extrair texto desta imagem e me mostre o resultado.`
        : `Imagem salva em: ${imagePath}\n\nUse ler_imagem para extrair o texto desta imagem e me mostre o resultado.`;

      const result = await processUserMessage(userId, prompt, chatId);
      await ctx.reply(result);
      await unlink(imagePath).catch(() => {});
    } catch (err) {
      logger.error("Photo processing error:", err);
      await ctx.reply("Desculpe, ocorreu um erro ao processar sua imagem. Já registrei para análise.");
    }
  });

  bot.action(/approve:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const userId = ctx.from?.id.toString() ?? "unknown";
    const request = getApprovalById(id);
    if (request && request.userId === userId && !request.resolved) {
      resolveApproval(id, true);
      await ctx.editMessageText("✅ Ação aprovada pelo usuário.");
    } else {
      await ctx.answerCbQuery("Aprovação não encontrada ou já processada.");
    }
  });

  bot.action(/reject:(.+)/, async (ctx) => {
    const id = ctx.match[1];
    const userId = ctx.from?.id.toString() ?? "unknown";
    const request = getApprovalById(id);
    if (request && request.userId === userId && !request.resolved) {
      resolveApproval(id, false);
      await ctx.editMessageText("❌ Ação rejeitada pelo usuário.");
    } else {
      await ctx.answerCbQuery("Aprovação não encontrada ou já processada.");
    }
  });
}
