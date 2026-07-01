import { getCRMDB, type ClienteRecord } from "../../memory/crm-db.js";
import { generateId, nowISO } from "../../utils/helpers.js";
import { registerTool } from "../registry.js";

// ── criar_cliente ──
registerTool("criar_cliente", {
  type: "function",
  function: {
    name: "criar_cliente",
    description: "Cadastrar um novo cliente no CRM local.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Nome completo ou razão social" },
        email: { type: "string", description: "Email do cliente" },
        telefone: { type: "string", description: "Telefone" },
        cnpj: { type: "string", description: "CNPJ (pessoa jurídica)" },
        cpf: { type: "string", description: "CPF (pessoa física)" },
        endereco: { type: "string", description: "Endereço completo" },
        cidade: { type: "string", description: "Cidade" },
        estado: { type: "string", description: "Estado (UF)" },
        cep: { type: "string", description: "CEP" },
        observacoes: { type: "string", description: "Observações gerais" },
      },
      required: ["nome"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const id = generateId();
  const now = nowISO();

  const stmt = d.prepare(`
    INSERT INTO clientes (id, nome, email, telefone, cnpj, cpf, endereco, cidade, estado, cep, observacoes, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    String(args.nome ?? ""),
    args.email ? String(args.email) : null,
    args.telefone ? String(args.telefone) : null,
    args.cnpj ? String(args.cnpj) : null,
    args.cpf ? String(args.cpf) : null,
    args.endereco ? String(args.endereco) : null,
    args.cidade ? String(args.cidade) : null,
    args.estado ? String(args.estado) : null,
    args.cep ? String(args.cep) : null,
    args.observacoes ? String(args.observacoes) : null,
    now,
    now,
  );

  return `Cliente cadastrado: ${args.nome}\nID: ${id}`;
});

// ── buscar_cliente ──
registerTool("buscar_cliente", {
  type: "function",
  function: {
    name: "buscar_cliente",
    description: "Buscar clientes por nome, email, CNPJ ou CPF.",
    parameters: {
      type: "object",
      properties: {
        nome: { type: "string", description: "Buscar por nome (parcial)" },
        email: { type: "string", description: "Buscar por email" },
        cnpj: { type: "string", description: "Buscar por CNPJ" },
        cpf: { type: "string", description: "Buscar por CPF" },
      },
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const conditions: string[] = [];
  const params: string[] = [];

  if (args.nome) { conditions.push("nome LIKE ?"); params.push(`%${args.nome}%`); }
  if (args.email) { conditions.push("email = ?"); params.push(String(args.email)); }
  if (args.cnpj) { conditions.push("cnpj = ?"); params.push(String(args.cnpj)); }
  if (args.cpf) { conditions.push("cpf = ?"); params.push(String(args.cpf)); }

  if (conditions.length === 0) return "Informe pelo menos um critério de busca.";

  const rows = d.prepare(
    `SELECT * FROM clientes WHERE ${conditions.join(" OR ")} LIMIT 10`
  ).all(...params) as ClienteRecord[];

  if (rows.length === 0) return "Nenhum cliente encontrado.";

  return rows.map(c => {
    const parts = [`**${c.nome}**`];
    if (c.email) parts.push(`Email: ${c.email}`);
    if (c.telefone) parts.push(`Tel: ${c.telefone}`);
    if (c.cnpj) parts.push(`CNPJ: ${c.cnpj}`);
    if (c.cpf) parts.push(`CPF: ${c.cpf}`);
    if (c.cidade) parts.push(`${c.cidade}/${c.estado ?? ""}`);
    parts.push(`ID: ${c.id}`);
    return parts.join("\n");
  }).join("\n\n");
});

// ── listar_clientes ──
registerTool("listar_clientes", {
  type: "function",
  function: {
    name: "listar_clientes",
    description: "Listar todos os clientes cadastrados.",
    parameters: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Número máximo de resultados (padrão: 20)" },
      },
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const limit = Number(args.limite ?? 20);

  const rows = d.prepare(
    `SELECT * FROM clientes ORDER BY nome LIMIT ?`
  ).all(limit) as ClienteRecord[];

  if (rows.length === 0) return "Nenhum cliente cadastrado.";

  const lines = rows.map((c, i) => {
    return `${i + 1}. ${c.nome} | ${c.email ?? "sem email"} | ${c.cnpj ?? c.cpf ?? "sem doc"} | ${c.cidade ?? ""}`;
  });

  return `Clientes cadastrados: ${rows.length}\n\n${lines.join("\n")}`;
});

// ── atualizar_cliente ──
registerTool("atualizar_cliente", {
  type: "function",
  function: {
    name: "atualizar_cliente",
    description: "Atualizar dados de um cliente existente.",
    parameters: {
      type: "object",
      properties: {
        cliente_id: { type: "string", description: "ID do cliente" },
        nome: { type: "string" },
        email: { type: "string" },
        telefone: { type: "string" },
        cnpj: { type: "string" },
        cpf: { type: "string" },
        endereco: { type: "string" },
        cidade: { type: "string" },
        estado: { type: "string" },
        cep: { type: "string" },
        observacoes: { type: "string" },
      },
      required: ["cliente_id"],
    },
  },
}, async (args: Record<string, unknown>) => {
  const d = getCRMDB();
  const id = String(args.cliente_id ?? "");
  if (!id) return "ID do cliente é obrigatório.";

  const existing = d.prepare(`SELECT * FROM clientes WHERE id = ?`).get(id) as ClienteRecord | undefined;
  if (!existing) return "Cliente não encontrado.";

  const fields: string[] = [];
  const params: unknown[] = [];

  for (const key of ["nome", "email", "telefone", "cnpj", "cpf", "endereco", "cidade", "estado", "cep", "observacoes"]) {
    const val = args[key];
    if (val !== undefined && val !== null) {
      fields.push(`${key} = ?`);
      params.push(String(val));
    }
  }

  if (fields.length === 0) return "Nenhum campo para atualizar.";

  fields.push("atualizado_em = ?");
  params.push(nowISO());
  params.push(id);

  d.prepare(`UPDATE clientes SET ${fields.join(", ")} WHERE id = ?`).run(...params);

  return `Cliente ${id} atualizado.`;
});
