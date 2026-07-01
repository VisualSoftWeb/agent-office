import { getCRMDB, type EventoRecord } from "../../memory/crm-db.js";
import { generateId, nowISO } from "../../utils/helpers.js";
import { registerTool } from "../registry.js";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function formatICSDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// ── criar_evento ──
registerTool("criar_evento", {
  type: "function",
  function: {
    name: "criar_evento",
    description: "Criar um evento no calendário. Salva no banco local E opcionalmente gera arquivo .ics (compatível com Google Calendar, Outlook, Apple Calendar).",
    parameters: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título do evento" },
        descricao: { type: "string", description: "Descrição" },
        data_inicio: { type: "string", description: "Data/hora início (YYYY-MM-DD HH:MM)" },
        data_fim: { type: "string", description: "Data/hora fim (opcional)" },
        participantes: { type: "array", items: { type: "string" }, description: "Emails dos participantes" },
        local: { type: "string", description: "Local do evento" },
        salvar_ics: { type: "string", description: "Caminho para salvar o arquivo .ics (opcional)" },
      },
      required: ["titulo", "data_inicio"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const titulo = String(args.titulo ?? "").trim();
  const dataInicio = String(args.data_inicio ?? "").trim();

  if (!titulo) return "Título é obrigatório.";
  if (!dataInicio) return "Data de início é obrigatória.";

  const id = generateId();
  const now = nowISO();
  const participantes = JSON.stringify(args.participantes ?? []);

  d.prepare(`
    INSERT INTO eventos (id, titulo, descricao, data_inicio, data_fim, participantes, local, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, titulo,
    args.descricao ? String(args.descricao) : null,
    dataInicio,
    args.data_fim ? String(args.data_fim) : null,
    participantes,
    args.local ? String(args.local) : null,
    now, now,
  );

  let icsPath: string | null = null;
  if (args.salvar_ics) {
    icsPath = String(args.salvar_ics);
    const dataFim = args.data_fim ? String(args.data_fim) : new Date(new Date(dataInicio).getTime() + 3600000).toISOString().replace("T", " ").slice(0, 16);

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Agent Office//PT",
      "BEGIN:VEVENT",
      `DTSTART:${formatICSDate(dataInicio)}`,
      `DTEND:${formatICSDate(dataFim)}`,
      `SUMMARY:${titulo}`,
      args.descricao ? `DESCRIPTION:${String(args.descricao).replace(/\n/g, "\\n")}` : "",
      args.local ? `LOCATION:${String(args.local)}` : "",
      `UID:${id}@agent-office`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean).join("\r\n");

    try {
      const dir = path.dirname(icsPath);
      await mkdir(dir, { recursive: true });
      await writeFile(icsPath, lines);
    } catch {
      icsPath = "Erro ao salvar .ics";
    }
  }

  const result = [`Evento criado: ${titulo}`, `Início: ${dataInicio}`, `ID: ${id}`];
  if (icsPath && !icsPath.startsWith("Erro")) result.push(`ICS: ${icsPath}`);
  return result.join("\n");
});

// ── listar_eventos ──
registerTool("listar_eventos", {
  type: "function",
  function: {
    name: "listar_eventos",
    description: "Listar eventos agendados (a partir de hoje ou em um período).",
    parameters: {
      type: "object",
      properties: {
        data_inicio: { type: "string", description: "Data início do filtro (YYYY-MM-DD, padrão: hoje)" },
        data_fim: { type: "string", description: "Data fim do filtro (YYYY-MM-DD)" },
        limite: { type: "number", description: "Máximo de eventos (padrão: 20)" },
      },
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const dataInicio = String(args.data_inicio ?? new Date().toISOString().split("T")[0]);
  const limite = Number(args.limite ?? 20);

  let query = `SELECT * FROM eventos WHERE data_inicio >= ?`;
  const params: string[] = [dataInicio];

  if (args.data_fim) {
    query += ` AND data_inicio <= ?`;
    params.push(String(args.data_fim));
  }

  query += ` ORDER BY data_inicio LIMIT ?`;
  params.push(String(limite));

  const rows = d.prepare(query).all(...params) as EventoRecord[];

  if (rows.length === 0) return "Nenhum evento encontrado.";

  return rows.map(e => {
    const parts = [`📅 **${e.titulo}**`, `Início: ${e.data_inicio}`];
    if (e.data_fim) parts.push(`Fim: ${e.data_fim}`);
    if (e.local) parts.push(`Local: ${e.local}`);
    if (e.descricao) parts.push(`Descrição: ${e.descricao}`);
    parts.push(`ID: ${e.id}`);
    return parts.join("\n");
  }).join("\n\n");
});
