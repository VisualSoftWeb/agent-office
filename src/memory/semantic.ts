import { db } from './schema.js'

interface EmbeddingRow {
  id: number
  user_id: string
  content: string
}

// Simple local TF-IDF-like semantic search (no external deps)
function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9à-ü\s]/g, '').split(/\s+/).filter(Boolean)
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, normA = 0, normB = 0
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0)
    normA += v * v
  }
  for (const v of b.values()) normB += v * v
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function tfidf(text: string): Map<string, number> {
  const tokens = tokenize(text)
  const tf = new Map<string, number>()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  const len = tokens.length
  for (const [k, v] of tf) tf.set(k, v / len)
  return tf
}

export function searchSimilar(userId: string, query: string, limit = 5): string[] {
  const all = db.prepare(
    'SELECT id, user_id, content FROM embeddings WHERE user_id = ? ORDER BY id DESC LIMIT 200'
  ).all(userId) as EmbeddingRow[]

  if (all.length === 0) return []

  const queryVec = tfidf(query)
  const scored = all
    .map(row => ({ row, score: cosineSimilarity(queryVec, tfidf(row.content)) }))
    .filter(x => x.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(s => s.row.content)
}

export function storeEmbedding(userId: string, content: string): void {
  db.prepare('INSERT INTO embeddings (user_id, content) VALUES (?, ?)').run(userId, content)
}
