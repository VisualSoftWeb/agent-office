import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { registerTool } from "./registry.js";
import { resolvePath } from "../utils/paths.js";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg", ".venv", "__pycache__",
  "Windows", "Program Files", "Program Files (x86)", "AppData",
  "$Recycle.Bin", "System Volume Information", "Recovery",
]);

const MAX_RESULTS = 20;
const MAX_DEPTH = 8;
const TIMEOUT_MS = 15000;

function matchPattern(filename: string, pattern: string): boolean {
  if (pattern.startsWith("*") && pattern.endsWith("*")) {
    const mid = pattern.slice(1, -1).toLowerCase();
    return filename.toLowerCase().includes(mid);
  }
  if (pattern.startsWith("*")) {
    const ext = pattern.slice(1).toLowerCase();
    return filename.toLowerCase().endsWith(ext);
  }
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1).toLowerCase();
    return filename.toLowerCase().startsWith(prefix);
  }
  return filename.toLowerCase() === pattern.toLowerCase();
}

interface FileEntry {
  filePath: string;
  sizeBytes: number;
  modifiedAt: Date;
}

async function walkDir(dirPath: string, pattern: string, depth: number, results: FileEntry[], signal: AbortSignal): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS || signal.aborted) return;

  let entries;
  try {
    entries = await readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (signal.aborted || results.length >= MAX_RESULTS) return;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        await walkDir(fullPath, pattern, depth + 1, results, signal);
      }
    } else if (entry.isFile()) {
      if (matchPattern(entry.name, pattern)) {
        try {
          const s = await stat(fullPath);
          results.push({ filePath: fullPath, sizeBytes: s.size, modifiedAt: s.mtime });
        } catch {
          // skip files we can't stat
        }
      }
    }
  }
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

registerTool("search_files", {
  type: "function",
  function: {
    name: "search_files",
    description: "Search for files on the user's computer. To find by exact name use: pattern='filename.ext'. To find by partial name: pattern='*partial*'. To find by extension: pattern='*.pdf'. Examples: '*teste-agente*', '*.pdf', '*fatura*', 'nota*', '*.png', '*.html', '*.xml', '*.jpeg'. Returns up to 20 results with full path, size, and date.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "The search pattern. Examples: '*.pdf' (all PDFs), '**/*.png' (all images recursively), '*fatura*' (files containing 'fatura'), 'relatorio*' (files starting with 'relatorio')." },
        directory: { type: "string", description: "Optional base directory. Defaults to the user's home folder. Accepts shortcuts like ~desktop, ~docs, ~downloads. Examples: '~desktop', '~docs/contratos', 'C:\\Projetos'." },
      },
      required: ["pattern"],
    },
  },
}, async (args) => {
  const pattern = String(args.pattern || "").trim();
  if (!pattern) return `Search pattern is required. Example: '*.pdf'`;

  const rawDir = args.directory ? String(args.directory).trim() : "~";
  const baseDir = resolvePath(rawDir);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    const results: FileEntry[] = [];
    await walkDir(baseDir, pattern, 0, results, ac.signal);

    clearTimeout(timer);

    if (results.length === 0) {
      return `No files matching "${pattern}" found in ${baseDir}`;
    }

    results.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

    const lines = results.slice(0, MAX_RESULTS).map((r, i) =>
      `[${i + 1}] ${r.filePath} (${formatSize(r.sizeBytes)}, ${formatDate(r.modifiedAt)})`
    );

    if (results.length > MAX_RESULTS) {
      lines.push(`\n... and ${results.length - MAX_RESULTS} more files`);
    }

    return lines.join("\n");
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return `Search failed: ${msg}`;
  }
});
