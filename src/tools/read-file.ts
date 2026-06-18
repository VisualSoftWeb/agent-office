import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "./registry.js";

const MAX_TEXT_SIZE = 100 * 1024;
const MAX_OUTPUT_CHARS = 4000;
const BINARY_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpeg", ".jpg", ".gif", ".bmp", ".webp", ".ico",
  ".zip", ".rar", ".7z", ".tar", ".gz", ".exe", ".dll", ".bin",
  ".mp3", ".mp4", ".avi", ".mov", ".wav", ".ogg", ".flac",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".ttf", ".otf", ".woff", ".woff2",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpeg", ".jpg", ".gif", ".bmp", ".webp"]);

function isBinaryExtension(ext: string): boolean {
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext.toLowerCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

registerTool("read_file", {
  type: "function",
  function: {
    name: "read_file",
    description: "Read any text file from the user's computer. Authorized file access. Handles HTML, XML, TXT, JS, TS, JSON, MD, CSS, LOG, etc. For binary files (PDF, PNG, JPEG) returns metadata. Max size: 100 KB.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file on disk" },
      },
      required: ["path"],
    },
  },
}, async (args) => {
  const filePath = String(args.path ?? "").trim();
  if (!filePath || filePath === "undefined" || filePath.includes("\\undefined")) {
    return `File path is missing or invalid. Please provide a valid absolute path.`;
  }

  try {
    const s = await stat(filePath);
    const ext = path.extname(filePath);

    if (isImageExtension(ext)) {
      return `Image file: ${filePath}\nSize: ${formatSize(s.size)}\nDimensions: ${s.size} bytes\nLast modified: ${formatDate(s.mtime)}`;
    }

    if (isBinaryExtension(ext)) {
      return `Binary file: ${filePath}\nSize: ${formatSize(s.size)}\nLast modified: ${formatDate(s.mtime)}`;
    }

    if (s.size > MAX_TEXT_SIZE) {
      return `File too large to read as text (${formatSize(s.size)}). Max allowed: 100 KB.`;
    }

    const content = await readFile(filePath, "utf-8");

    if (content.length > MAX_OUTPUT_CHARS) {
      return content.slice(0, MAX_OUTPUT_CHARS) + `\n\n... (truncated: ${content.length} chars -> ${MAX_OUTPUT_CHARS} chars)`;
    }

    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Failed to read file: ${msg}`;
  }
});

