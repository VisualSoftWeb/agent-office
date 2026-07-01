import { getCRMDB, type FaturaRecord, type ClienteRecord } from "../../memory/crm-db.js";
import { generateId, nowISO } from "../../utils/helpers.js";
import { registerTool } from "../registry.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// ── criar_fatura ──
registerTool("criar_fatura", {
  type: "function",
  function: {
    name: "criar_fatura",
    description: "Criar uma fatura (nota de cobrança) para um cliente. Gera PDF com dados do cliente e valores.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "ID do cliente" },
        numero: { type: "string", description: "Número da fatura (ex: FAT-001)" },
        descricao: { type: "string", description: "Descrição do serviço/produto" },
        valor: { type: "number", description: "Valor em reais" },
        data_vencimento: { type: "string", description: "Data de vencimento (YYYY-MM-DD)" },
        salvar_pdf: { type: "string", description: "Caminho para salvar o PDF da fatura (opcional)" },
      },
      required: ["cliente_id", "numero", "valor"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const clienteId = String(args.cliente_id ?? "");
  const numero = String(args.numero ?? "");
  const valor = Number(args.valor ?? 0);

  if (!clienteId) return "ID do cliente é obrigatório.";
  if (!numero) return "Número da fatura é obrigatório.";
  if (valor <= 0) return "Valor deve ser maior que zero.";

  const cliente = d.prepare(`SELECT * FROM clientes WHERE id = ?`).get(clienteId) as ClienteRecord | undefined;
  if (!cliente) return "Cliente não encontrado.";

  const id = generateId();
  const now = nowISO();

  d.prepare(`
    INSERT INTO faturas (id, cliente_id, numero, descricao, valor, data_emissao, data_vencimento, status, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?, ?)
  `).run(id, clienteId, numero, args.descricao ? String(args.descricao) : null, valor, now, args.data_vencimento ? String(args.data_vencimento) : null, now, now);

  let pdfPath: string | null = null;
  if (args.salvar_pdf) {
    pdfPath = String(args.salvar_pdf);
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      let y = height - 60;

      page.drawText("FATURA", { x: 50, y, size: 28, font: fontBold, color: rgb(0.1, 0.2, 0.5) });
      y -= 15;
      page.drawText(`Nº ${numero}`, { x: 50, y, size: 14, font });
      y -= 30;

      page.drawText(`Cliente: ${cliente.nome}`, { x: 50, y, size: 12, font: fontBold });
      y -= 18;
      if (cliente.email) { page.drawText(`Email: ${cliente.email}`, { x: 50, y, size: 11, font }); y -= 15; }
      if (cliente.cnpj) { page.drawText(`CNPJ: ${cliente.cnpj}`, { x: 50, y, size: 11, font }); y -= 15; }
      else if (cliente.cpf) { page.drawText(`CPF: ${cliente.cpf}`, { x: 50, y, size: 11, font }); y -= 15; }
      y -= 15;

      page.drawText(`Data de emissão: ${now.split("T")[0]}`, { x: 50, y, size: 11, font });
      y -= 15;
      if (args.data_vencimento) {
        page.drawText(`Vencimento: ${String(args.data_vencimento)}`, { x: 50, y, size: 11, font });
        y -= 15;
      }
      y -= 20;

      if (args.descricao) {
        page.drawText("Descrição:", { x: 50, y, size: 11, font: fontBold });
        y -= 15;
        page.drawText(String(args.descricao), { x: 50, y, size: 11, font });
        y -= 25;
      }

      page.drawText(`VALOR TOTAL: R$ ${valor.toFixed(2)}`, { x: 50, y, size: 18, font: fontBold, color: rgb(0.1, 0.4, 0.1) });

      const pdfBytes = await pdfDoc.save();
      const dir = path.dirname(pdfPath);
      await mkdir(dir, { recursive: true });
      await writeFile(pdfPath, Buffer.from(pdfBytes));

      d.prepare(`UPDATE faturas SET arquivo_path = ? WHERE id = ?`).run(pdfPath, id);
    } catch (err) {
      pdfPath = `Erro ao gerar PDF: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const result = [`Fatura criada: ${numero}`, `Cliente: ${cliente.nome}`, `Valor: R$ ${valor.toFixed(2)}`, `ID: ${id}`];
  if (pdfPath && !pdfPath.startsWith("Erro")) result.push(`PDF: ${pdfPath}`);
  return result.join("\n");
});

// ── listar_faturas ──
registerTool("listar_faturas", {
  type: "function",
  function: {
    name: "listar_faturas",
    description: "Listar faturas emitidas, com filtro opcional por status ou cliente.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "Filtrar por ID do cliente" },
        status: { type: "string", description: "Filtrar por status: pendente, paga, atrasada" },
        limite: { type: "number", description: "Número máximo de resultados (padrão: 20)" },
      },
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const conditions: string[] = [];
  const params: string[] = [];

  if (args.cliente_id) { conditions.push("f.cliente_id = ?"); params.push(String(args.cliente_id)); }
  if (args.status) { conditions.push("f.status = ?"); params.push(String(args.status)); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Number(args.limite ?? 20);

  const rows = d.prepare(`
    SELECT f.*, c.nome as cliente_nome
    FROM faturas f
    LEFT JOIN clientes c ON f.cliente_id = c.id
    ${where}
    ORDER BY f.data_emissao DESC
    LIMIT ?
  `).all(...params, limit) as (FaturaRecord & { cliente_nome: string })[];

  if (rows.length === 0) return "Nenhuma fatura encontrada.";

  return rows.map(f => {
    const status = f.status === "paga" ? "✅ PAGA" : f.status === "atrasada" ? "❌ ATRASADA" : "⏳ PENDENTE";
    return `${f.numero} | ${f.cliente_nome} | R$ ${f.valor.toFixed(2)} | ${f.data_emissao.split("T")[0]} | ${status}`;
  }).join("\n");
});

// ── registrar_pagamento ──
registerTool("registrar_pagamento", {
  type: "function",
  function: {
    name: "registrar_pagamento",
    description: "Marcar uma fatura como paga.",
    parameters: {
      type: "object",
      properties: {
        fatura_id: { type: "string", description: "ID da fatura" },
        data_pagamento: { type: "string", description: "Data do pagamento (YYYY-MM-DD, padrão: hoje)" },
      },
      required: ["fatura_id"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const id = String(args.fatura_id ?? "");
  if (!id) return "ID da fatura é obrigatório.";

  const fatura = d.prepare(`SELECT * FROM faturas WHERE id = ?`).get(id) as FaturaRecord | undefined;
  if (!fatura) return "Fatura não encontrada.";

  const dataPagamento = String(args.data_pagamento ?? nowISO().split("T")[0]);
  d.prepare(`UPDATE faturas SET status = 'paga', data_pagamento = ?, atualizado_em = ? WHERE id = ?`).run(dataPagamento, nowISO(), id);

  return `Fatura ${fatura.numero} registrada como PAGA em ${dataPagamento}.`;
});
