import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../config.js";
import { registerTool } from "./registry.js";
import { resolvePath } from "../utils/paths.js";

const TELEGRAM_API = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}`;
const chatByUserId = new Map<string, number>();

export function setSendFileChatId(userId: string, chatId: number): void {
  chatByUserId.set(userId, chatId);
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveFilePath(rawPath: string): string {
  if (!rawPath) return "";
  const trimmed = rawPath.trim();
  if (path.isAbsolute(trimmed)) return trimmed;

  const candidates = [
    path.join(os.homedir(), trimmed),
    path.join(os.homedir(), "Desktop", trimmed),
    path.join(os.homedir(), "Downloads", trimmed),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return trimmed;
}

registerTool("send_file", {
  type: "function",
  function: {
    name: "send_file",
    description: "Send a file (image or document) directly to the Telegram chat. Use this when the user asks to open, show, send, view, or display a file. Supports images (PNG, JPEG, GIF, WebP) and documents (PDF, TXT, etc). Max 50 MB.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file to send. Accepts shortcuts like ~desktop, ~docs, ~downloads. Ex: ~desktop/foto.png" },
        caption: { type: "string", description: "Text caption to accompany the file in the chat." },
        parse_mode: { type: "string", enum: ["Markdown", "HTML"], description: "Formatting mode for the caption (optional)." },
      },
      required: ["filePath"],
    },
  },
}, async (args, userId) => {
  const rawPath = String(args.filePath ?? "").trim();
  const caption = args.caption ? String(args.caption).trim() : undefined;
  const parseMode = args.parse_mode ? String(args.parse_mode).trim() : undefined;
  if (!rawPath || rawPath === "undefined") {
    return `Caminho do arquivo não informado. Use caminho completo ou atalho (ex: ~desktop/arquivo.png).`;
  }

  const filePath = resolvePath(rawPath);
  const chatId = userId ? (chatByUserId.get(userId) ?? null) : null;
  if (!chatId) {
    return `Nenhum chat ativo. Use o comando pelo Telegram primeiro.`;
  }

  if (!existsSync(filePath)) {
    return `Arquivo não encontrado: ${filePath}\n\nSugestão: use search_files para localizar o arquivo e depois use send_file com o caminho completo retornado.`;
  }

  try {
    const s = statSync(filePath);
    if (!s.isFile()) return `Não é um arquivo: ${filePath}`;

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const maxSize = 50 * 1024 * 1024;

    if (s.size > maxSize) {
      return `Arquivo muito grande (${formatSize(s.size)}). Máximo permitido: 50 MB.`;
    }

    const buf = readFileSync(filePath);
    const blob = new Blob([new Uint8Array(buf)], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    if (parseMode) form.append("parse_mode", parseMode);
    form.append(IMAGE_EXTS.has(ext) ? "photo" : "document", blob, fileName);

    const endpoint = IMAGE_EXTS.has(ext) ? "sendPhoto" : "sendDocument";
    const res = await fetch(`${TELEGRAM_API}/${endpoint}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "sem resposta");
      return `Telegram rejeitou "${fileName}" (HTTP ${res.status}): ${errText}`;
    }

    const data: any = await res.json();
    if (!data.ok) {
      return `Telegram retornou erro: ${data.description}`;
    }

    return `Arquivo enviado: ${fileName} (${formatSize(s.size)})${caption ? ` com legenda: "${caption}"` : ""}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Falha ao enviar "${path.basename(filePath)}": ${msg}`;
  }
});
