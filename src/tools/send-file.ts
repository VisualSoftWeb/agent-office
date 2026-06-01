import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { registerTool } from "./registry.js";

const TELEGRAM_API = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
let currentChatId: number | null = null;

export function setSendFileChatId(chatId: number): void {
  currentChatId = chatId;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

registerTool("send_file", {
  type: "function",
  function: {
    name: "send_file",
    description: "Send a file (image or document) directly to the Telegram chat. Use this when the user asks to open, show, send, view, or display a file. Supports images (PNG, JPEG, GIF, WebP) and documents (PDF, TXT, etc). Max 50 MB.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Absolute path to the file on disk to send." },
      },
      required: ["filePath"],
    },
  },
}, async (args) => {
  const filePath = String(args.filePath).trim();
  if (!filePath) return `<tool-error>File path is required</tool-error>`;

  const chatId = currentChatId;
  if (!chatId) return `<tool-error>No chat context. Cannot send file.</tool-error>`;

  try {
    const s = statSync(filePath);
    if (!s.isFile()) return `<tool-error>Not a file: ${filePath}</tool-error>`;

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const maxSize = 50 * 1024 * 1024;

    if (s.size > maxSize) {
      return `<tool-error>File too large to send (${formatSize(s.size)}). Max allowed: 50 MB.</tool-error>`;
    }

    const buf = readFileSync(filePath);
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(IMAGE_EXTS.has(ext) ? "photo" : "document", blob, fileName);

    const endpoint = IMAGE_EXTS.has(ext) ? "sendPhoto" : "sendDocument";
    const res = await fetch(`${TELEGRAM_API}/${endpoint}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const data: any = await res.json();

    if (!data.ok) {
      return `<tool-error>Telegram API error: ${data.description}</tool-error>`;
    }

    return `<tool-result>File sent successfully to chat: ${fileName} (${formatSize(s.size)})</tool-result>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<tool-error>Failed to send file: ${msg}</tool-error>`;
  }
});
