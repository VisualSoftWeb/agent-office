import { registerTool } from "./registry.js";

const MAX_RESULTS = 5;
const MAX_SNIPPET_CHARS = 300;
const CACHE_TTL_MS = 5 * 60 * 1000;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

let uaIndex = 0;
function nextUserAgent(): string {
  uaIndex = (uaIndex + 1) % USER_AGENTS.length;
  return USER_AGENTS[uaIndex];
}

interface SearchResult {
  title: string;
  snippet: string;
}

const cache = new Map<string, { results: SearchResult[]; expiresAt: number }>();

function getCached(query: string): SearchResult[] | null {
  const entry = cache.get(query);
  if (entry && Date.now() < entry.expiresAt) return entry.results;
  cache.delete(query);
  return null;
}

function setCache(query: string, results: SearchResult[]): void {
  if (cache.size > 100) {
    const oldest = cache.entries().next().value;
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(query, { results, expiresAt: Date.now() + CACHE_TTL_MS });
}

function extractResultsV1(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split('<div class="result results_links');
  for (let i = 1; i < blocks.length && results.length < MAX_RESULTS; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, MAX_SNIPPET_CHARS)
        : "";
      if (title) results.push({ title, snippet });
    }
  }
  return results;
}

function extractResultsV2(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split('<article class="result');
  for (let i = 1; i < blocks.length && results.length < MAX_RESULTS; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    const snippetMatch = block.match(/<p[^>]*class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    if (titleMatch) {
      const anchor = titleMatch[1].match(/<a[^>]*>([\s\S]*?)<\/a>/);
      const title = (anchor ? anchor[1] : titleMatch[1]).replace(/<[^>]+>/g, "").trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, MAX_SNIPPET_CHARS)
        : "";
      if (title) results.push({ title, snippet });
    }
  }
  return results;
}

function extractResultsV3(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const blocks = html.split('<div class="nrn__card');
  for (let i = 1; i < blocks.length && results.length < MAX_RESULTS; i++) {
    const block = blocks[i];
    const titleMatch = block.match(/<a[^>]*class="[^"]*eVNQE[^"]*"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/<div[^>]*class="[^"]*result-snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (titleMatch) {
      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, "").trim().slice(0, MAX_SNIPPET_CHARS)
        : "";
      if (title) results.push({ title, snippet });
    }
  }
  return results;
}

function extractResults(html: string): SearchResult[] {
  const v1 = extractResultsV1(html);
  if (v1.length > 0) return v1;
  const v2 = extractResultsV2(html);
  if (v2.length > 0) return v2;
  return extractResultsV3(html);
}

registerTool("web_search", {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information. Use this for news, sports results, weather, real-time data, and general knowledge questions. The results are in Portuguese by default.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query (e.g., 'resultado jogo Flamengo ontem')" },
      },
      required: ["query"],
    },
  },
}, async (args) => {
  const query = String(args.query);

  const cached = getCached(query);
  if (cached) {
    return cached.map((r, i) =>
      `[${i + 1}] ${r.title} — ${r.snippet}`
    ).join("\n");
  }

  let lastError = "";
  for (const attempt of [1, 2, 3]) {
    try {
      const res = await fetch(
        `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}&kl=br-br`,
        {
          headers: {
            "User-Agent": nextUserAgent(),
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(15000),
        },
      );

      if (res.status === 429 || res.status === 503) {
        lastError = `DuckDuckGo rate limited (${res.status}), retrying...`;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      if (!res.ok) {
        lastError = `Search failed with status ${res.status}`;
        continue;
      }

      const html = await res.text();
      const results = extractResults(html);

      if (results.length === 0) {
        return `<tool-warning>No results found for "${query}". Try a different query.</tool-warning>`;
      }

      setCache(query, results);
      return results.map((r, i) =>
        `[${i + 1}] ${r.title} — ${r.snippet}`
      ).join("\n");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  return `<tool-error>Search failed after 3 attempts: ${lastError}</tool-error>`;
});
