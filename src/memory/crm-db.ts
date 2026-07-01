import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { generateId, nowISO } from "../utils/helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/agent.db");

let crmDb: Database.Database | null = null;

export function getCRMDB(): Database.Database {
  if (!crmDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    crmDb = new Database(DB_PATH);
    crmDb.pragma("journal_mode = WAL");
    initCRMSchema(crmDb);
  }
  return crmDb;
}

function initCRMSchema(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT,
      telefone TEXT,
      cnpj TEXT,
      cpf TEXT,
      endereco TEXT,
      cidade TEXT,
      estado TEXT,
      cep TEXT,
      observacoes TEXT,
      tags TEXT DEFAULT '[]',
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clientes_nome ON clientes(nome);
    CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
    CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);

    CREATE TABLE IF NOT EXISTS contratos (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT,
      valor REAL DEFAULT 0,
      data_inicio TEXT,
      data_fim TEXT,
      status TEXT DEFAULT 'rascunho',
      arquivo_path TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id)
    );

    CREATE TABLE IF NOT EXISTS faturas (
      id TEXT PRIMARY KEY,
      cliente_id TEXT NOT NULL,
      contrato_id TEXT,
      numero TEXT NOT NULL,
      descricao TEXT,
      valor REAL NOT NULL,
      data_emissao TEXT NOT NULL,
      data_vencimento TEXT,
      data_pagamento TEXT,
      status TEXT DEFAULT 'pendente',
      arquivo_path TEXT,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (contrato_id) REFERENCES contratos(id)
    );
    CREATE INDEX IF NOT EXISTS idx_faturas_cliente ON faturas(cliente_id);
    CREATE INDEX IF NOT EXISTS idx_faturas_status ON faturas(status);

    CREATE TABLE IF NOT EXISTS eventos (
      id TEXT PRIMARY KEY,
      titulo TEXT NOT NULL,
      descricao TEXT,
      data_inicio TEXT NOT NULL,
      data_fim TEXT,
      participantes TEXT DEFAULT '[]',
      local TEXT,
      lembrete_min INTEGER DEFAULT 30,
      criado_em TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );
  `);
}

export interface ClienteRecord {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  cnpj: string | null;
  cpf: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  observacoes: string | null;
  tags: string;
  criado_em: string;
  atualizado_em: string;
}

export interface ContratoRecord {
  id: string;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  valor: number;
  data_inicio: string | null;
  data_fim: string | null;
  status: string;
  arquivo_path: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface FaturaRecord {
  id: string;
  cliente_id: string;
  contrato_id: string | null;
  numero: string;
  descricao: string | null;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  arquivo_path: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface EventoRecord {
  id: string;
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  participantes: string;
  local: string | null;
  lembrete_min: number;
  criado_em: string;
  atualizado_em: string;
}
