import { writeFile, readFile, stat, copyFile, rename, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "../registry.js";
import { resolvePath, getPathShortcutsHelp } from "../../utils/paths.js";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── criar_arquivo ──
registerTool("criar_arquivo", {
  type: "function",
  function: {
    name: "criar_arquivo",
    description: "Criar um arquivo de texto, código ou documento no disco. Cria automaticamente as pastas intermediárias.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo a criar. Aceita atalhos como ~desktop, ~docs, ~downloads. Ex: ~desktop/nota.txt" },
        conteudo: { type: "string", description: "Conteúdo do arquivo" },
        encoding: { type: "string", description: "Encoding (padrão: utf-8)" },
      },
      required: ["caminho", "conteudo"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = resolvePath(String(args.caminho ?? "").trim());
  const content = String(args.conteudo ?? "");
  const encoding = (String(args.encoding ?? "utf-8") as BufferEncoding);

  if (!filePath) return "Caminho do arquivo é obrigatório.";

  try {
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, content, encoding);
    const s = await stat(filePath);
    return `Arquivo criado: ${filePath}\nTamanho: ${formatSize(s.size)}`;
  } catch (err) {
    return `Erro ao criar arquivo: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── listar_pasta ──
registerTool("listar_pasta", {
  type: "function",
  function: {
    name: "listar_pasta",
    description: "Listar conteúdo de uma pasta (arquivos e subpastas). Retorna nome, tipo, tamanho e data de modificação.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho da pasta. Aceita atalhos como ~desktop, ~docs, ~downloads." },
        padrao: { type: "string", description: "Filtro glob (ex: *.pdf, *.xlsx)" },
      },
      required: ["caminho"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const dirPath = resolvePath(String(args.caminho ?? "").trim());
  const pattern = String(args.padrao ?? "").trim();

  if (!dirPath) return "Caminho da pasta é obrigatório.";

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (pattern) {
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
          "i"
        );
        if (!regex.test(entry.name)) continue;
      }

      try {
        const s = await stat(fullPath);
        const tipo = entry.isDirectory() ? "📁 Pasta" : `📄 ${path.extname(entry.name).toUpperCase() || "arquivo"}`;
        const tamanho = entry.isDirectory() ? "" : formatSize(s.size);
        results.push(`${tipo} | ${entry.name} | ${tamanho} | ${formatDate(s.mtime)}`);
      } catch {
        results.push(`${entry.isDirectory() ? "📁" : "📄"} | ${entry.name}`);
      }
    }

    if (results.length === 0) return `Pasta vazia ou nenhum resultado para o padrão "${pattern}".`;

    return `Pasta: ${dirPath}\n${results.length} itens:\n\n${results.join("\n")}`;
  } catch (err) {
    return `Erro ao listar pasta: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── criar_pasta ──
registerTool("criar_pasta", {
  type: "function",
  function: {
    name: "criar_pasta",
    description: "Criar uma nova pasta. Cria automaticamente todas as pastas intermediárias.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho da pasta a criar. Aceita atalhos como ~desktop/minha-pasta, ~docs/contratos." },
      },
      required: ["caminho"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const dirPath = resolvePath(String(args.caminho ?? "").trim());
  if (!dirPath) return "Caminho da pasta é obrigatório.";

  try {
    await mkdir(dirPath, { recursive: true });
    return `Pasta criada: ${dirPath}`;
  } catch (err) {
    return `Erro ao criar pasta: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── copiar_arquivo ──
registerTool("copiar_arquivo", {
  type: "function",
  function: {
    name: "copiar_arquivo",
    description: "Copiar um arquivo para outro destino.",
    parameters: {
      type: "object",
      properties: {
        origem: { type: "string", description: "Caminho do arquivo de origem. Aceita atalhos como ~desktop, ~docs." },
        destino: { type: "string", description: "Caminho do destino. Aceita atalhos como ~desktop, ~docs." },
      },
      required: ["origem", "destino"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const src = resolvePath(String(args.origem ?? "").trim());
  const dest = resolvePath(String(args.destino ?? "").trim());
  if (!src || !dest) return "Origem e destino são obrigatórios.";

  try {
    const dir = path.dirname(dest);
    await mkdir(dir, { recursive: true });
    await copyFile(src, dest);
    const s = await stat(dest);
    return `Arquivo copiado: ${src} → ${dest}\nTamanho: ${formatSize(s.size)}`;
  } catch (err) {
    return `Erro ao copiar: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── renomear_arquivo ──
registerTool("renomear_arquivo", {
  type: "function",
  function: {
    name: "renomear_arquivo",
    description: "Renomear ou mover um arquivo/pasta.",
    parameters: {
      type: "object",
      properties: {
        origem: { type: "string", description: "Caminho atual do arquivo/pasta. Aceita atalhos como ~desktop, ~docs." },
        destino: { type: "string", description: "Novo caminho ou novo nome. Aceita atalhos como ~desktop, ~docs." },
      },
      required: ["origem", "destino"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const src = resolvePath(String(args.origem ?? "").trim());
  const dest = resolvePath(String(args.destino ?? "").trim());
  if (!src || !dest) return "Origem e destino são obrigatórios.";

  try {
    const dir = path.dirname(dest);
    await mkdir(dir, { recursive: true });
    await rename(src, dest);
    return `Renomeado: ${src} → ${dest}`;
  } catch (err) {
    return `Erro ao renomear: ${err instanceof Error ? err.message : String(err)}`;
  }
});
