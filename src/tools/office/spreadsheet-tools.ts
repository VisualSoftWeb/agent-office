import ExcelJS from "exceljs";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "../registry.js";

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── criar_planilha ──
registerTool("criar_planilha", {
  type: "function",
  function: {
    name: "criar_planilha",
    description: "Criar planilha Excel (.xlsx) com dados. Suporta cabeçalhos formatados e múltiplas linhas.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo .xlsx a criar" },
        aba: { type: "string", description: "Nome da aba (padrão: Planilha1)" },
        cabecalhos: { type: "array", items: { type: "string" }, description: "Lista de cabeçalhos das colunas" },
        linhas: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Dados das linhas (array de arrays)" },
        titulo: { type: "string", description: "Título acima da tabela (opcional)" },
      },
      required: ["caminho", "cabecalhos", "linhas"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  const sheetName = String(args.aba ?? "Planilha1").trim();
  const headers = (args.cabecalhos as string[]) ?? [];
  const rows = (args.linhas as string[][]) ?? [];
  const title = String(args.titulo ?? "").trim();

  if (!filePath) return "Caminho é obrigatório.";
  if (!filePath.endsWith(".xlsx")) return "O arquivo deve ter extensão .xlsx";
  if (headers.length === 0) return "Pelo menos um cabeçalho é obrigatório.";

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Agent Office";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetName);

    if (title) {
      sheet.mergeCells(1, 1, 1, headers.length);
      const titleCell = sheet.getCell("A1");
      titleCell.value = title;
      titleCell.font = { bold: true, size: 14, color: { argb: "FF1A3A5C" } };
      titleCell.alignment = { horizontal: "center" };
      sheet.getRow(1).height = 30;
    }

    const headerRow = title ? sheet.getRow(2) : sheet.getRow(1);
    headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3A5C" } };
      cell.alignment = { horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
      };
    });

    const startRow = title ? 3 : 2;
    rows.forEach((row, ri) => {
      const excelRow = sheet.getRow(startRow + ri);
      row.forEach((val, ci) => {
        const cell = excelRow.getCell(ci + 1);
        cell.value = val;
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
        if (ri % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F7FB" } };
        }
      });
    });

    headers.forEach((_, i) => {
      sheet.getColumn(i + 1).width = Math.max(15, Math.max(...rows.map(r => String(r[i] ?? "").length)) + 4);
    });

    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    const buffer = await workbook.xlsx.writeBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    return `Planilha criada: ${filePath}\nAba: ${sheetName}\nCabeçalhos: ${headers.length}\nLinhas de dados: ${rows.length}\nData: ${formatDate(new Date())}`;
  } catch (err) {
    return `Erro ao criar planilha: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── ler_planilha ──
registerTool("ler_planilha", {
  type: "function",
  function: {
    name: "ler_planilha",
    description: "Ler dados de uma planilha Excel (.xlsx ou .csv). Retorna cabeçalhos e linhas.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo" },
        aba: { type: "string", description: "Nome da aba (padrão: primeira aba)" },
        maxLinhas: { type: "number", description: "Número máximo de linhas a retornar (padrão: 50)" },
      },
      required: ["caminho"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  const sheetName = String(args.aba ?? "").trim();
  const maxRows = Number(args.maxLinhas ?? 50);

  if (!filePath) return "Caminho é obrigatório.";

  try {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".csv") {
      const csvContent = await readFile(filePath, "utf-8");
      const lines = csvContent.split("\n").filter(l => l.trim());
      const sliced = lines.slice(0, maxRows + 1);
      return `CSV: ${filePath}\nLinhas: ${lines.length}\n\n${sliced.join("\n")}`;
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!ws) return `Aba "${sheetName}" não encontrada.`;

    const rows: string[][] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > maxRows + 1) return;
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(String(cell.value ?? ""));
      });
      rows.push(values);
    });

    if (rows.length === 0) return "Planilha vazia.";

    const headers = rows[0] ?? [];
    const dataRows = rows.slice(1, maxRows + 1);

    const output = [
      `Planilha: ${filePath}`,
      `Aba: ${ws.name}`,
      `Colunas: ${headers.length}`,
      `Linhas: ${dataRows.length}`,
      "",
      `Cabeçalhos: ${headers.join(" | ")}`,
      "",
      ...dataRows.map((r, i) => `${i + 1}. ${r.join(" | ")}`),
    ].join("\n");

    return output.length > 8000 ? output.slice(0, 8000) + "\n... (truncado)" : output;
  } catch (err) {
    return `Erro ao ler planilha: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── editar_planilha ──
registerTool("editar_planilha", {
  type: "function",
  function: {
    name: "editar_planilha",
    description: "Editar células de uma planilha existente ou adicionar novas linhas.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho da planilha .xlsx" },
        aba: { type: "string", description: "Nome da aba (padrão: primeira aba)" },
        celulas: {
          type: "array",
          description: "Células a editar [{linha, coluna, valor}]",
          items: {
            type: "object",
            properties: {
              linha: { type: "number" },
              coluna: { type: "number" },
              valor: { type: "string" },
            },
          },
        },
        novasLinhas: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "Novas linhas a adicionar no final",
        },
      },
      required: ["caminho"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  const sheetName = String(args.aba ?? "").trim();
  const cells = (args.celulas as { linha: number; coluna: number; valor: string }[]) ?? [];
  const newRows = (args.novasLinhas as string[][]) ?? [];

  if (!filePath) return "Caminho é obrigatório.";

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const ws = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
    if (!ws) return `Aba "${sheetName}" não encontrada.`;

    let edited = 0;
    for (const cell of cells) {
      const c = ws.getRow(cell.linha).getCell(cell.coluna);
      c.value = cell.valor;
      edited++;
    }

    let added = 0;
    for (const row of newRows) {
      ws.addRow(row);
      added++;
    }

    await workbook.xlsx.writeFile(filePath);

    return `Planilha editada: ${filePath}\nCélulas editadas: ${edited}\nLinhas adicionadas: ${added}`;
  } catch (err) {
    return `Erro ao editar planilha: ${err instanceof Error ? err.message : String(err)}`;
  }
});
