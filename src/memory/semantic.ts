import { logger } from "../utils/logger.js";

interface VectorRecord {
  id: string;
  userId: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

const LOCAL_STORE: VectorRecord[] = [];

export async function embed(text: string): Promise<number[]> {
  if (process.env.VECTOR_STORE === "pinecone") {
    return embedWithOpenAI(text);
  }
  return dummyEmbed(text);
}

async function embedWithOpenAI(text: string): Promise<number[]> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  return res.data[0].embedding;
}

function dummyEmbed(text: string): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const vec = new Array(128).fill(0);
  for (let i = 0; i < words.length; i++) {
    const hash = simpleHash(words[i]);
    vec[i % 128] += hash;
  }
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash / 2147483647;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function indexText(userId: string, text: string): Promise<void> {
  const embedding = await embed(text);
  LOCAL_STORE.push({
    id: crypto.randomUUID(),
    userId,
    text,
    embedding,
    createdAt: new Date().toISOString(),
  });
  logger.debug(`Indexed text (${text.length} chars) for user ${userId}`);
}

export async function searchSimilar(userId: string, query: string, topK = 5): Promise<string[]> {
  const queryEmbed = await embed(query);
  const results = LOCAL_STORE
    .filter((r) => r.userId === userId)
    .map((r) => ({ text: r.text, score: cosineSimilarity(queryEmbed, r.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return results.map((r) => r.text);
}
