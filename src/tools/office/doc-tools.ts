import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, TableRow, TableCell, Table, WidthType } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { registerTool } from "../registry.js";

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface DocElement {
  tipo: "paragrafo" | "titulo" | "subtitulo" | "lista" | "tabela";
  conteudo?: string;
  itens?: string[];
  colunas?: string[];
  linhas?: string[][];
  negrito?: boolean;
}

function parseDocElements(content: string): DocElement[] {
  try {
    return JSON.parse(content) as DocElement[];
  } catch {
    return [{ tipo: "paragrafo", conteudo: content }];
  }
}

// ── criar_documento (Word .docx) ──
registerTool("criar_documento", {
  type: "function",
  function: {
    name: "criar_documento",
    description: "Criar documento Word (.docx) formatado. Suporta parágrafos, títulos, listas e tabelas. O conteúdo pode ser texto simples ou JSON com estrutura.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo .docx a criar" },
        conteudo: { type: "string", description: "Texto do documento ou JSON estruturado" },
        titulo: { type: "string", description: "Título do documento (opcional)" },
      },
      required: ["caminho", "conteudo"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  const content = String(args.conteudo ?? "");
  const title = String(args.titulo ?? "").trim();

  if (!filePath) return "Caminho é obrigatório.";
  if (!filePath.endsWith(".docx")) return "O arquivo deve ter extensão .docx";

  try {
    const elements = parseDocElements(content);
    const sections: (Paragraph | Table)[] = [];

    if (title) {
      sections.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        children: [new TextRun({ text: title, bold: true, size: 32 })],
      }));
    }

    for (const el of elements) {
      switch (el.tipo) {
        case "titulo":
          sections.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: el.conteudo ?? "", bold: true, size: 28 })],
          }));
          break;
        case "subtitulo":
          sections.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: el.conteudo ?? "", bold: true, size: 24 })],
          }));
          break;
        case "lista":
          if (el.itens) {
            for (const item of el.itens) {
              sections.push(new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: item })],
              }));
            }
          }
          break;
        case "tabela":
          if (el.colunas && el.linhas) {
            const tableRows: TableRow[] = [];
            tableRows.push(new TableRow({
              children: el.colunas.map(col => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true })] })],
                shading: { fill: "D9E2F3" },
              })),
            }));
            for (const linha of el.linhas) {
              tableRows.push(new TableRow({
                children: linha.map(cell => new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: cell })] })],
                })),
              }));
            }
            sections.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
            sections.push(new Paragraph({ text: "" }));
          }
          break;
        default:
          sections.push(new Paragraph({
            children: [new TextRun({ text: el.conteudo ?? "", bold: el.negrito })],
          }));
      }
    }

    const doc = new Document({
      sections: [{ properties: {}, children: sections }],
    });

    const buffer = await Packer.toBuffer(doc);
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, buffer);

    return `Documento Word criado: ${filePath}\nTamanho: ${(buffer.length / 1024).toFixed(1)} KB\nData: ${formatDate(new Date())}`;
  } catch (err) {
    return `Erro ao criar documento: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── criar_pdf ──
registerTool("criar_pdf", {
  type: "function",
  function: {
    name: "criar_pdf",
    description: "Criar documento PDF com texto formatado. Suporta títulos, parágrafos e listas.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo .pdf a criar" },
        conteudo: { type: "string", description: "Texto do PDF ou JSON estruturado" },
        titulo: { type: "string", description: "Título do documento (opcional)" },
      },
      required: ["caminho", "conteudo"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  const content = String(args.conteudo ?? "");
  const title = String(args.titulo ?? "").trim();

  if (!filePath) return "Caminho é obrigatório.";
  if (!filePath.endsWith(".pdf")) return "O arquivo deve ter extensão .pdf";

  try {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    let y = height - 50;

    function newPage(): void {
      page = pdfDoc.addPage();
      y = height - 50;
    }

    function writeLine(text: string, f: typeof font, fontSize: number, color?: [number, number, number]): void {
      const maxWidth = width - 100;
      const words = text.split(" ");
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = f.widthOfTextAtSize(testLine, fontSize);
        if (testWidth > maxWidth && currentLine) {
          if (y < 50) newPage();
          page.drawText(currentLine, {
            x: 50,
            y,
            size: fontSize,
            font: f,
            color: color ? rgb(color[0], color[1], color[2]) : rgb(0, 0, 0),
          });
          y -= fontSize + 8;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        if (y < 50) newPage();
        page.drawText(currentLine, {
          x: 50,
          y,
          size: fontSize,
          font: f,
          color: color ? rgb(color[0], color[1], color[2]) : rgb(0, 0, 0),
        });
        y -= fontSize + 8;
      }
    }

    if (title) {
      writeLine(title, fontBold, 24, [0.1, 0.2, 0.5]);
      y -= 10;
    }

    const elements = parseDocElements(content);
    for (const el of elements) {
      switch (el.tipo) {
        case "titulo":
          y -= 10;
          writeLine(el.conteudo ?? "", fontBold, 16, [0.1, 0.2, 0.5]);
          break;
        case "subtitulo":
          y -= 5;
          writeLine(el.conteudo ?? "", fontBold, 13, [0.2, 0.3, 0.6]);
          break;
        case "lista":
          if (el.itens) {
            for (const item of el.itens) {
              writeLine(`• ${item}`, font, 11);
            }
          }
          break;
        case "tabela":
          if (el.colunas && el.linhas) {
            const colWidth = (width - 100) / el.colunas.length;
            const headerY = y;
            el.colunas.forEach((col, i) => {
              page.drawText(col, { x: 50 + i * colWidth, y: headerY, size: 10, font: fontBold, color: rgb(0.1, 0.2, 0.5) });
            });
            y -= 15;
            for (const linha of el.linhas) {
              if (y < 50) newPage();
              linha.forEach((cell, i) => {
                page.drawText(cell, { x: 50 + i * colWidth, y, size: 10, font });
              });
              y -= 15;
            }
          }
          break;
        default:
          writeLine(el.conteudo ?? "", font, 11);
      }
    }

    const pdfBytes = await pdfDoc.save();
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, pdfBytes);

    return `PDF criado: ${filePath}\nTamanho: ${(pdfBytes.length / 1024).toFixed(1)} KB\nPáginas: ${pdfDoc.getPageCount()}\nData: ${formatDate(new Date())}`;
  } catch (err) {
    return `Erro ao criar PDF: ${err instanceof Error ? err.message : String(err)}`;
  }
});

// ── ler_pdf ──
registerTool("ler_pdf", {
  type: "function",
  function: {
    name: "ler_pdf",
    description: "Extrair texto de um arquivo PDF.",
    parameters: {
      type: "object",
      properties: {
        caminho: { type: "string", description: "Caminho do arquivo PDF" },
      },
      required: ["caminho"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const filePath = String(args.caminho ?? "").trim();
  if (!filePath) return "Caminho é obrigatório.";

  try {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(filePath);

    // Simple extraction: look for text streams in PDF
    const text = buffer.toString("utf-8");
    const textMatches = text.match(/\(([^)]+)\)/g);
    const extracted = textMatches
      ? textMatches.map((m: string) => m.slice(1, -1)).join(" ").slice(0, 8000)
      : "Não foi possível extrair texto diretamente. O PDF pode conter imagens ou fontes embutidas.";

    return `PDF: ${filePath}\nTamanho: ${(buffer.length / 1024).toFixed(1)} KB\n\n${extracted}`;
  } catch (err) {
    return `Erro ao ler PDF: ${err instanceof Error ? err.message : String(err)}`;
  }
});
