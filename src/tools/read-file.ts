import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "./registry.js";

const MAX_TEXT_SIZE = 100 * 1024;
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
  const filePath = String(args.path);

  try {
    const s = await stat(filePath);
    const ext = path.extname(filePath);

    if (isImageExtension(ext)) {
      return `<tool-result name="read_file">\nImage file: ${filePath}\nSize: ${formatSize(s.size)}\nDimensions: ${s.size} bytes\nLast modified: ${s.mtime.toISOString()}\n</tool-result>`;
    }

    if (isBinaryExtension(ext)) {
      return `<tool-result name="read_file">\nBinary file: ${filePath}\nSize: ${formatSize(s.size)}\nLast modified: ${s.mtime.toISOString()}\n</tool-result>`;
    }

    if (s.size > MAX_TEXT_SIZE) {
      return `<tool-error>File too large to read as text (${formatSize(s.size)}). Max allowed: 100 KB.</tool-error>`;
    }

    const content = await readFile(filePath, "utf-8");

    if (content.length > 5000) {
      return content.slice(0, 5000) + `\n\n... (truncated, full file is ${content.length} characters)`;
    }

    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<tool-error>Failed to read file: ${msg}</tool-error>`;
  }
});

