import { Telegraf, Context } from "telegraf";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { processUserMessage } from "../agent/loop.js";

export type BotContext = Context;

let bot: Telegraf<BotContext> | null = null;
let pollingAbort = new AbortController();

const TELEGRAM_API = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;

const THROTTLE_MS = 500;

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

async function sendReply(chatId: number, text: string): Promise<{ ok: boolean; result?: any }> {
  logger.debug(`[sendReply] Full text to send (${text.length} chars): "${text.slice(0, 300)}..."`);

  const body: Record<string, any> = { chat_id: chatId, text };
  for (const pm of ["Markdown", null]) {
    body.parse_mode = pm ?? undefined;
    if (!pm) delete body.parse_mode;
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: any = await res.json();
    if (data.ok) {
      logger.debug(`[sendReply] Sent successfully with parse_mode=${pm || "none"}`);
      return data;
    }
    logger.warn(`[sendReply] Failed with parse_mode=${pm || "none"}: ${data.description}`);
    if (pm !== null) continue;
    throw new Error(`sendMessage failed: ${data.description}`);
  }
  return { ok: false };
}

async function editMessageText(chatId: number, messageId: number, text: string): Promise<boolean> {
  const body: Record<string, any> = { chat_id: chatId, message_id: messageId, text };
  for (const pm of ["Markdown", null]) {
    body.parse_mode = pm ?? undefined;
    if (!pm) delete body.parse_mode;
    const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: any = await res.json();
    if (data.ok) return true;
    logger.debug(`[editMessageText] Failed with parse_mode=${pm || "none"}: ${data.description}`);
  }
  return false;
}

function createStreamingCallback(chatId: number, messageId: number): (text: string) => void {
  let lastSent = "";
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = async (text: string) => {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    if (text === lastSent) return;
    try {
      await editMessageText(chatId, messageId, text);
      lastSent = text;
    } catch (err) {
      logger.warn(`[stream] editMessageText failed:`, err);
    }
  };

  return (text: string) => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      const currentText = text;
      editMessageText(chatId, messageId, currentText)
        .then(() => { lastSent = currentText; })
        .catch(() => {});
      throttleTimer = null;
    }, THROTTLE_MS);
  };
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

        const processingMsg = await sendReply(chatId, "⏳ Processando...").catch(() => null);
        const messageId = processingMsg?.result?.message_id;

        try {
          let finalResult: string;
          if (messageId) {
            const onToken = createStreamingCallback(chatId, messageId);
            finalResult = await processUserMessage(userId, text, chatId, onToken);
            const sanitized = finalResult.length > 0 ? finalResult : "";
            if (sanitized) {
              await editMessageText(chatId, messageId, sanitized).catch(() =>
                sendReply(chatId, sanitized).catch(() => {})
              );
            }
          } else {
            finalResult = await processUserMessage(userId, text, chatId);
            await sendReply(chatId, finalResult).catch((e) => {
              logger.error("Failed to send response:", e);
            });
          }
          logger.info(`processUserMessage returned (${finalResult?.length} chars): "${finalResult?.slice(0, 200)}..."`);
          offset = Math.max(offset, update.update_id + 1);
        } catch (handlerErr) {
          logger.error("Handler error:", handlerErr);
          const errorMsg = "Desculpe, ocorreu um erro inesperado. Já registrei para análise.";
          if (messageId) {
            await editMessageText(chatId, messageId, errorMsg).catch(() => {});
          } else {
            await sendReply(chatId, errorMsg).catch(() => {});
          }
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
