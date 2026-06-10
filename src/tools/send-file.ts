import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { config } from "../config.js";
import { registerTool } from "./registry.js";

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
        filePath: { type: "string", description: "Absolute path to the file on disk to send." },
      },
      required: ["filePath"],
    },
  },
}, async (args, userId) => {
  const rawPath = String(args.filePath ?? "").trim();
  if (!rawPath || rawPath === "undefined") {
    return `<tool-error>Caminho do arquivo não informado. Use o caminho completo (ex: C:\\Users\\SeuNome\\Desktop\\arquivo.png).</tool-error>`;
  }

  const filePath = resolveFilePath(rawPath);
  const chatId = userId ? (chatByUserId.get(userId) ?? null) : null;
  if (!chatId) {
    return `<tool-error>Nenhum chat ativo. Use o comando pelo Telegram primeiro.</tool-error>`;
  }

  if (!existsSync(filePath)) {
    return `<tool-error>Arquivo não encontrado: ${filePath}\n\nSugestão: use search_files para localizar o arquivo e depois use send_file com o caminho completo retornado.</tool-error>`;
  }

  try {
    const s = statSync(filePath);
    if (!s.isFile()) return `<tool-error>Não é um arquivo: ${filePath}</tool-error>`;

    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const maxSize = 50 * 1024 * 1024;

    if (s.size > maxSize) {
      return `<tool-error>Arquivo muito grande (${formatSize(s.size)}). Máximo permitido: 50 MB.</tool-error>`;
    }

    const buf = readFileSync(filePath);
    const blob = new Blob([new Uint8Array(buf)], { type: "application/octet-stream" });
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append(IMAGE_EXTS.has(ext) ? "photo" : "document", blob, fileName);

    const endpoint = IMAGE_EXTS.has(ext) ? "sendPhoto" : "sendDocument";
    const res = await fetch(`${TELEGRAM_API}/${endpoint}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "sem resposta");
      return `<tool-error>Telegram rejeitou "${fileName}" (HTTP ${res.status}): ${errText}</tool-error>`;
    }

    const data: any = await res.json();
    if (!data.ok) {
      return `<tool-error>Telegram retornou erro: ${data.description}</tool-error>`;
    }

    return `<tool-result>Arquivo enviado: ${fileName} (${formatSize(s.size)})</tool-result>`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<tool-error>Falha ao enviar "${path.basename(filePath)}": ${msg}</tool-error>`;
  }
});
