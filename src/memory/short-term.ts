import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { generateId, nowISO } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";
import type { MessageRecord, FactRecord, CostRecord } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../../data");
const DB_PATH = path.join(DB_DIR, "agent.db");

let db: Database.Database | null = null;

function getDB(): Database.Database {
  if (!db) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

function initSchema(): void {
  const d = getDB();
  d.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      tokens INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS facts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      fact TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS costs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_facts_user ON facts(user_id);
    CREATE INDEX IF NOT EXISTS idx_costs_user ON costs(user_id, created_at);
  `);

  const cols = d.prepare("PRAGMA table_info(messages)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "tool_call_id")) {
    d.exec("ALTER TABLE messages ADD COLUMN tool_call_id TEXT");
  }
  if (!cols.some((c) => c.name === "name")) {
    d.exec("ALTER TABLE messages ADD COLUMN name TEXT");
  }
}

const MAX_SHORT_TERM = 50;

export function addMessage(record: Omit<MessageRecord, "id" | "created_at">): void {
  const d = getDB();
  const stmt = d.prepare(`
    INSERT INTO messages (id, user_id, role, content, tool_calls, tokens, created_at, tool_call_id, name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(generateId(), record.user_id, record.role, record.content, record.tool_calls, record.tokens, nowISO(), record.tool_call_id ?? null, record.name ?? null);
  pruneMessages(record.user_id);
}

function pruneMessages(userId: string): void {
  const d = getDB();
  d.prepare(`
    DELETE FROM messages WHERE id IN (
      SELECT id FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT -1 OFFSET ?
    )
  `).run(userId, MAX_SHORT_TERM);
}

export function getRecentMessages(userId: string, limit = MAX_SHORT_TERM): MessageRecord[] {
  const d = getDB();
  return d.prepare(
    `SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(userId, limit) as MessageRecord[];
}

export function upsertFact(userId: string, fact: string, category = "general"): void {
  const d = getDB();
  const existing = d.prepare(
    `SELECT id FROM facts WHERE user_id = ? AND fact = ?`
  ).get(userId, fact) as FactRecord | undefined;

  if (existing) {
    d.prepare(`UPDATE facts SET updated_at = ? WHERE id = ?`).run(nowISO(), existing.id);
  } else {
    d.prepare(
      `INSERT INTO facts (id, user_id, fact, category, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(generateId(), userId, fact, category, nowISO(), nowISO());
  }
}

export function getFacts(userId: string): FactRecord[] {
  const d = getDB();
  return d.prepare(`SELECT * FROM facts WHERE user_id = ? ORDER BY updated_at DESC`).all(userId) as FactRecord[];
}

export function addCost(record: Omit<CostRecord, "id" | "created_at">): void {
  const d = getDB();
  d.prepare(`
    INSERT INTO costs (id, user_id, conversation_id, provider, prompt_tokens, completion_tokens, cost_usd, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(generateId(), record.user_id, record.conversation_id, record.provider, record.prompt_tokens, record.completion_tokens, record.cost_usd, nowISO());
}

export function getDailyCost(): number {
  const d = getDB();
  const row = d.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total FROM costs
    WHERE created_at >= date('now')
  `).get() as { total: number };
  return row.total;
}
