import { createWorker } from "tesseract.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "./registry.js";
import { resolvePath } from "../utils/paths.js";

const IMAGE_EXTS = new Set([".png", ".jpeg", ".jpg", ".gif", ".bmp", ".webp"]);
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
let workerReady = false;

async function getWorker() {
  if (!worker) {
    worker = await createWorker("por");
    workerReady = true;
  }
  return worker;
}

registerTool("ler_imagem", {
  type: "function",
  function: {
    name: "ler_imagem",
    description: "Extrair texto de uma imagem (PNG, JPG, JPEG, GIF, BMP, WebP) usando OCR. Ideal para capturas de tela, fotos de documentos, prints de mensagens, etc.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho da imagem. Aceita atalhos como ~desktop, ~docs, ~downloads. Ex: ~desktop/captura.png" },
      },
      required: ["caminho"],
    },
  },
}, async (args) => {
  const filePath = resolvePath(String(args.caminho ?? "").trim());
  if (!filePath) return "Caminho da imagem é obrigatório.";

  const ext = path.extname(filePath).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    return `Formato não suportado: ${ext}. Use PNG, JPG, JPEG, GIF, BMP ou WebP.`;
  }

  try {
    const s = await stat(filePath);
    if (s.size > MAX_IMAGE_SIZE) {
      return `Imagem muito grande (${formatSize(s.size)}). Máximo: 20 MB.`;
    }

    const w = await getWorker();
    const { data } = await w.recognize(filePath);
    const text = data.text.trim();

    if (!text) {
      return `Nenhum texto encontrado na imagem: ${filePath}\nTamanho: ${formatSize(s.size)}\nDimensões: ${data.blocks?.length ? `${data.blocks.length} blocos` : "desconhecidas"}`;
    }

    return `Texto extraído de: ${filePath}\n\n${text}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Erro ao ler imagem: ${msg}`;
  }
});
