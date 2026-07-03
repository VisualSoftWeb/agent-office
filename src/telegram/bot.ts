import { Telegraf, Context } from "telegraf";
import http from "node:http";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { processUserMessage } from "../agent/loop.js";
import { recordMetric } from "../utils/metrics.js";
import { getOffset, setOffset } from "../memory/short-term.js";

export type BotContext = Context;

let bot: Telegraf<BotContext> | null = null;
let pollingAbort = new AbortController();
let webhookServer: http.Server | null = null;

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
  if (bot) {
    logger.warn("Bot already launched, skipping duplicate launch");
    return;
  }
  getBot();

  getMe().then((me) => {
    logger.info(`Authenticated as @${me.username}`);

    if (config.WEBHOOK_ENABLED && config.WEBHOOK_URL) {
      startWebhook(me.username);
    } else {
      startPolling();
    }
  }).catch((err) => {
    logger.error("Bot auth failed:", err);
  });
}

async function setWebhook(url: string, secret?: string): Promise<void> {
  const body: Record<string, any> = { url, allowed_updates: ["message", "callback_query"] };
  if (secret) body.secret_token = secret;
  const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`setWebhook failed: ${data.description}`);
  logger.info(`Webhook set to ${url}`);
}

async function deleteWebhook(): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/deleteWebhook`, {
    signal: AbortSignal.timeout(10000),
  });
  const data: any = await res.json();
  if (!data.ok) throw new Error(`deleteWebhook failed: ${data.description}`);
  logger.info("Webhook deleted");
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: any): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

function startWebhook(botUsername: string): void {
  const port = config.WEBHOOK_PORT;
  const webhookPath = `/webhook/${config.TELEGRAM_BOT_TOKEN}`;

  webhookServer = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { ok: true, bot: botUsername });
        return;
      }

      if (req.method === "POST" && req.url === webhookPath) {
        const update = await parseBody(req);
        if (!update.message || !update.message.text) {
          res.writeHead(200);
          res.end();
          return;
        }

        const userId = update.message.from?.id?.toString() ?? "unknown";
        const text = update.message.text;
        const chatId = update.message.chat.id;

        const startTime = performance.now();
        logger.info(`[WEBHOOK] Update: userId=${userId}, chatId=${chatId}, text="${text.slice(0, 80)}"`);

        const processingMsg = await sendReply(chatId, "⏳ Processando...").catch(() => null);
        const messageId = processingMsg?.result?.message_id;

        let finalResult: string;
        if (messageId) {
          const onToken = createStreamingCallback(chatId, messageId);
          finalResult = await processUserMessage(userId, text, chatId, onToken);
          if (finalResult) {
            await editMessageText(chatId, messageId, finalResult).catch(() =>
              sendReply(chatId, finalResult).catch(() => {})
            );
          }
        } else {
          finalResult = await processUserMessage(userId, text, chatId);
          await sendReply(chatId, finalResult).catch(() => {});
        }

        const totalTime = Math.round(performance.now() - startTime);
        logger.info(`[TIMING] Webhook response: ${totalTime}ms for userId=${userId}`);
        recordMetric({ timestamp: Date.now(), durationMs: totalTime, type: "total", label: "response" });

        res.writeHead(200);
        res.end();
        return;
      }

      res.writeHead(404);
      res.end();
    } catch (err) {
      logger.error("[WEBHOOK] Handler error:", err);
      res.writeHead(200);
      res.end();
    }
  });

  webhookServer.listen(port, async () => {
    logger.info(`Webhook server listening on port ${port}`);
    try {
      const webhookUrl = `${config.WEBHOOK_URL!.replace(/\/+$/, "")}${webhookPath}`;
      await setWebhook(webhookUrl, config.WEBHOOK_SECRET);
      logger.info(`Bot running via webhook at ${webhookUrl}`);
    } catch (err) {
      logger.error("Failed to set webhook:", err);
    }
  });
}

async function startPolling(): Promise<void> {
  let offset = getOffset();
  pollingAbort = new AbortController();

  logger.info(`Polling started (manual mode) from offset=${offset}`);

  while (!pollingAbort.signal.aborted) {
    try {
      logger.debug(`Polling getUpdates offset=${offset}...`);
      const updates = await getUpdates(offset);
      logger.debug(`getUpdates returned ${updates.length} updates`);

      for (const update of updates) {
        if (!update.message || !update.message.text) {
          offset = Math.max(offset, update.update_id + 1);
          setOffset(offset);
          continue;
        }

        const userId = update.message.from?.id?.toString() ?? "unknown";
        const text = update.message.text;
        const chatId = update.message.chat.id;

        const startTime = performance.now();

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
          const totalTime = Math.round(performance.now() - startTime);
          logger.info(`[TIMING] Total response time: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}s) for userId=${userId}`);
          logger.info(`processUserMessage returned (${finalResult?.length} chars): "${finalResult?.slice(0, 200)}..."`);
          recordMetric({ timestamp: Date.now(), durationMs: totalTime, type: "total", label: "response" });
          offset = Math.max(offset, update.update_id + 1);
          setOffset(offset);
        } catch (handlerErr) {
          logger.error("Handler error:", handlerErr);
          const errorMsg = "Desculpe, ocorreu um erro inesperado. Já registrei para análise.";
          if (messageId) {
            await editMessageText(chatId, messageId, errorMsg).catch(() => {});
          } else {
            await sendReply(chatId, errorMsg).catch(() => {});
          }
          offset = Math.max(offset, update.update_id + 1);
          setOffset(offset);
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
  if (webhookServer) {
    webhookServer.close();
    webhookServer = null;
  }
  deleteWebhook().catch(() => {});
  bot?.stop();
  bot = null;
  pollingAbort = new AbortController();
}
