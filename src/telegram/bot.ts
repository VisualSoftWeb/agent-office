import { Telegraf, Context } from "telegraf";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { processUserMessage } from "../agent/loop.js";

export type BotContext = Context;

let bot: Telegraf<BotContext> | null = null;
let pollingAbort = new AbortController();

const TELEGRAM_API = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

export function getBot(): Telegraf<BotContext> {
  if (!bot) {
    bot = new Telegraf<BotContext>(config.TELEGRAM_BOT_TOKEN);

    bot.catch((err, ctx) => {
      logger.error("Telegram bot error:", err, "ctx:", ctx.updateType);
    });
  }
  return bot;
}

async function getMe(): Promise<{ id: number; username: string; first_name: string }> {
  const res = await fetch(`${TELEGRAM_API}/getMe`, { signal: AbortSignal.timeout(10000) });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`getMe failed: ${data.description}`);
  return data.result;
}

async function getUpdates(offset: number): Promise<any[]> {
  const res = await fetch(`${TELEGRAM_API}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offset, timeout: 30, allowed_updates: ["message"] }),
    signal: AbortSignal.timeout(60000),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`getUpdates failed: ${data.description}`);
  return data.result;
}

async function sendReply(chatId: number, text: string): Promise<void> {
  const body: Record<string, any> = { chat_id: chatId, text };
  for (const pm of ["Markdown", "HTML", null]) {
    body.parse_mode = pm ?? undefined;
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: any = await res.json();
    if (data.ok) return;
    if (pm !== null) continue;
    throw new Error(`sendMessage failed: ${data.description}`);
  }
}

export function launchBot(): void {
  getBot();

  getMe().then((me) => {
    logger.info(`Authenticated as @${me.username}`);
    startPolling();
  }).catch((err) => {
    logger.error("Bot auth failed:", err);
  });
}

async function startPolling(): Promise<void> {
  let offset = 0;
  pollingAbort = new AbortController();

  logger.info("Polling started (manual mode)");

  while (!pollingAbort.signal.aborted) {
    try {
      logger.debug(`Polling getUpdates offset=${offset}...`);
      const updates = await getUpdates(offset);
      logger.debug(`getUpdates returned ${updates.length} updates`);

      for (const update of updates) {
        if (!update.message || !update.message.text) {
          offset = Math.max(offset, update.update_id + 1);
          continue;
        }

        const userId = update.message.from?.id?.toString() ?? "unknown";
        const text = update.message.text;
        const chatId = update.message.chat.id;

        logger.info(`Update: userId=${userId}, chatId=${chatId}, text="${text.slice(0, 80)}"`);

        // Reply "processing" immediately
        await sendReply(chatId, "⏳ Processando...").catch(() => logger.warn("sendReply processing failed"));

        try {
          const result = await processUserMessage(userId, text, chatId);
          logger.info(`processUserMessage returned: "${result?.slice(0, 100)}..."`);
          await sendReply(chatId, result).catch((e) => {
            logger.error("Failed to send response:", e);
          });
          logger.info("sendReply completed successfully");
          offset = Math.max(offset, update.update_id + 1);
        } catch (handlerErr) {
          logger.error("Handler error:", handlerErr);
          await sendReply(chatId, "Desculpe, ocorreu um erro inesperado. Já registrei para análise.").catch(() => {});
          offset = Math.max(offset, update.update_id + 1);
        }
      }
    } catch (err: any) {
      if (!pollingAbort.signal.aborted) {
        logger.error("Polling error (retrying in 5s):", String(err?.message ?? err));
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }
}

export function stopBot(): void {
  pollingAbort.abort();
  bot?.stop();
}
