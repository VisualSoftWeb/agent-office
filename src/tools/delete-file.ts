import { unlink, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { registerTool } from "./registry.js";

const SYSTEM_PATHS = new Set([
  os.homedir() + "\\AppData",
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\ProgramData",
  "C:\\System32",
  "C:\\$Recycle.Bin",
  "C:\\Boot",
  "C:\\Recovery",
  "C:\\System Volume Information",
]);

function isSystemPath(filePath: string): boolean {
  const resolved = path.resolve(filePath).toLowerCase();
  for (const sp of SYSTEM_PATHS) {
    if (resolved.startsWith(sp.toLowerCase())) {
      return true;
    }
  }
  return false;
}

registerTool("delete_file", {
  type: "function",
  function: {
    name: "delete_file",
    description: "Delete a file or empty folder from the user's computer. First call without confirm=true to preview what will be deleted. The LLM will ask the user to confirm before calling again with confirm=true. Protected system directories (Windows, Program Files, AppData, etc.) cannot be deleted. Cannot delete non-empty folders (prevents accidents).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the file or empty folder to delete" },
        confirm: { type: "boolean", description: "Must be true to actually delete. If false or omitted, returns a preview." },
        recursive: { type: "boolean", description: "Delete folder and all contents. Use with extreme caution — requires explicit user confirmation." },
      },
      required: ["path"],
    },
  },
}, async (args) => {
  const filePath = String(args.path ?? "").trim();
  if (!filePath || filePath === "undefined") {
    return `<tool-error>File path is missing or invalid.</tool-error>`;
  }

  const resolvedPath = path.resolve(filePath);
  const doConfirm = args.confirm === true;
  const doRecursive = args.recursive === true;

  if (isSystemPath(resolvedPath)) {
    return `<tool-error>Cannot delete files in protected system directory: ${resolvedPath}</tool-error>`;
  }

  try {
    const s = await stat(resolvedPath);
    const isDirectory = s.isDirectory();

    if (isDirectory) {
      if (doRecursive && !doConfirm) {
        return `WARNING: This will recursively delete the folder and ALL its contents:\n${resolvedPath}\n\nCall again with confirm=true and recursive=true to proceed.`;
      }
      if (doRecursive && doConfirm) {
        await rm(resolvedPath, { recursive: true, force: true });
        return `Successfully deleted directory and all contents: ${resolvedPath}`;
      }
      await rm(resolvedPath, { recursive: false, force: true });
      return `Successfully deleted empty directory: ${resolvedPath}`;
    }

    if (!doConfirm) {
      return `Will delete file:\n${resolvedPath} (${s.size} bytes, ${s.mtime.toISOString().slice(0, 10)})\n\nCall again with confirm=true to execute the deletion.`;
    }

    await unlink(resolvedPath);
    return `Successfully deleted file: ${resolvedPath}`;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return `<tool-error>File or directory not found: ${resolvedPath}</tool-error>`;
    }
    if (err.code === "EPERM" || err.code === "EACCES") {
      return `<tool-error>Permission denied. Cannot delete: ${resolvedPath}</tool-error>`;
    }
    if (err.code === "ENOTEMPTY") {
      return `<tool-error>Directory is not empty. Use recursive=true to delete non-empty folders (requires explicit user confirmation).</tool-error>`;
    }
    const msg = err instanceof Error ? err.message : String(err);
    return `<tool-error>Failed to delete: ${msg}</tool-error>`;
  }
});
