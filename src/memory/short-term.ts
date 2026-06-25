import { db } from './schema.js'
import type { ChatMessage } from '../llm/interface.js'

const MAX_HISTORY = 50

export function getHistory(userId: string, limit = MAX_HISTORY): ChatMessage[] {
  const rows = db.prepare(`
    SELECT role, content, tool_call_id FROM short_term
    WHERE user_id = ?
    ORDER BY id DESC LIMIT ?
  `).all(userId, limit) as { role: string; content: string; tool_call_id: string | null }[]

  return rows.reverse().map(r => ({
    role: r.role as ChatMessage['role'],
    content: r.content,
    tool_call_id: r.tool_call_id ?? undefined,
  }))
}

export function addMessage(userId: string, msg: ChatMessage): void {
  db.prepare(`
    INSERT INTO short_term (user_id, role, content, tool_call_id)
    VALUES (?, ?, ?, ?)
  `).run(userId, msg.role, msg.content, msg.tool_call_id ?? null)
}

export function getFacts(userId: string): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM facts WHERE user_id = ?').all(userId) as { key: string; value: string }[]
  const facts: Record<string, string> = {}
  for (const r of rows) facts[r.key] = r.value
  return facts
}

export function setFact(userId: string, key: string, value: string): void {
  db.prepare(`
    INSERT INTO facts (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(userId, key, value)
}
