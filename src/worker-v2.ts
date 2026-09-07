import { deduplicate, evidenceId } from "./search/dedup.js";
import { expandQuery } from "./search/query-expander.js";
import { scoreResult } from "./search/ranker.js";
import type { Evidence, SearchResult, SearchRun } from "./types.js";
import { buildReport } from "./report.js";

interface Env {
  BRAVE_SEARCH_API_KEY?: string;
  SEARCH_PROVIDER?: string;
  SEARXNG_URL?: string;
  SEARXNG_FALLBACK_URLS?: string;
  ALLOWED_ORIGIN?: string;
  MAX_RESULTS?: string;
  MAX_PAGE_BYTES?: string;
  FETCH_TIMEOUT_MS?: string;
  USER_AGENT?: string;
}

const DEFAULT_SEARX = "https://searx.tiekoetter.com";
const DEFAULT_FALLBACKS = [
  "https://searxng.website",
  "https://search.pereira.is",
  "https://searxng.site"
];
const MAX_QUERY = 500;

function cors(origin?: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin ?? "https://camoosk.github.io",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function json(data: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors(origin) }
  });
}

function allowedOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get("origin");
  const allowed = env.ALLOWED_ORIGIN ?? "https://camoosk.github.io";
  if (!origin) return allowed;
  if (origin === allowed || origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") return origin;
  return undefined;
}

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1500, Math.min(ms || 8000, 15000)));
}

function baseUrl(raw: string): string {
  const u = new URL(raw || DEFAULT_SEARX);
  if (u.protocol !== "https:") throw new Error("Search provider must use HTTPS");
  if (u.username || u.password) throw new Error("Search provider URL cannot contain credentials");
  u.search = "";
  u.hash = "";
  u.pathname = u.pathname.replace(/\/$/, "");
  return u.toString().replace(/\/$/, "");
}

function instances(env: Env): string[] {
  const configured = (env.SEARXNG_FALLBACK_URLS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const all = [env.SEARXNG_URL ?? DEFAULT_SEARX, ...configured, ...DEFAULT_FALLBACKS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of all) {
    try {
      const normalized = baseUrl(item);
      if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
    } catch { /* ignore invalid fallback */ }
  }
  return out;
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}

function text(value: string): string {
  return decode(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseHtml(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  // Public instances normally expose HTML even when JSON is disabled. Match result containers
  // without assuming a particular theme's exact tag name.
  const blocks = html.match(/<(?:article|div)\b[^>]*class=["'][^"']*\bresult\b[^"']*["'][^>]*>[\s\S]*?<\/(?:article|div)>/gi) ?? [];
  for (const block of blocks) {
    if (results.length >= limit) break;
    const link = block.match(/<h3[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i)
      ?? block.match(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const url = decode(link[1] ?? "").trim();
    const title = text(link[2] ?? "");
    if (!/^https?:\/\//i.test(url) || !title) continue;
    const snippetMatch = block.match(/<(?:p|div)\b[^>]*class=["'][^"']*(?:content|description|snippet|result-content)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i);
    results.push({ url, title, snippet: text(snippetMatch?.[1] ?? ""), provider: "searxng" });
  }
  return results;
}

async function searx(query: string, instance: string, limit: number, timeoutMs: number): Promise<SearchResult[]> {
  const normalized = baseUrl(instance);
  // HTML is intentionally first: the SearXNG documentation notes that many public instances
  // disable JSON while keeping HTML enabled.
  const htmlUrl = new URL(`${normalized}/search`);
  htmlUrl.searchParams.set("q", query);
  htmlUrl.searchParams.set("categories", "general");
  htmlUrl.searchParams.set("language", "en");
  htmlUrl.searchParams.set("safesearch", "1");
  htmlUrl.searchParams.set("pageno", "1");
  const htmlResponse = await fetch(htmlUrl, {
    headers: { Accept: "text/html,application/xhtml+xml", "user-agent": "DeepSearchPublic/0.5" },
    signal: timeout(timeoutMs)
  });
  if (htmlResponse.ok) {
    const parsed = parseHtml((await htmlResponse.text()).slice(0, 500000), Math.min(limit, 10));
    if (parsed.length) return parsed;
  }

  const jsonUrl = new URL(`${normalized}/search`);
  jsonUrl.searchParams.set("q", query);
  jsonUrl.searchParams.set("format", "json");
  jsonUrl.searchParams.set("categories", "general");
  jsonUrl.searchParams.set("language", "en");
  jsonUrl.searchParams.set("safesearch", "1");
  jsonUrl.searchParams.set("pageno", "1");
  const jsonResponse = await fetch(jsonUrl, {
    headers: { Accept: "application/json", "user-agent": "DeepSearchPublic/0.5" },
    signal: timeout(timeoutMs)
  });
  if (!jsonResponse.ok) throw new Error(`HTTP ${htmlResponse.status}/${jsonResponse.status}`);
  const body = await jsonResponse.json() as { results?: Array<{ url?: string; title?: string; content?: string; publishedDate?: string }> };
  return (body.results ?? []).slice(0, Math.min(limit, 10)).flatMap((item) => {
    if (!item.url || !item.title) return [];
    const result: SearchResult = { url: item.url, title: item.title, snippet: item.content ?? "", provider: "searxng" };
    if (item.publishedDate) result.publishedAt = item.publishedDate;
    return [result];
  });
}

async function searchWithFallback(query: string, env: Env, limit: number): Promise<{ results: SearchResult[]; instance?: string; errors: string[] }> {
  const errors: string[] = [];
  for (const instance of instances(env)) {
    try {
      const results = await searx(query, instance, limit, Number(env.FETCH_TIMEOUT_MS ?? 8000));
      if (results.length) return { results, instance, errors };
      errors.push(`${new URL(instance).hostname}: no results`);
    } catch (error) {
      errors.push(`${new URL(instance).hostname}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  return { results: [], errors };
}

async function brave(query: string, env: Env, limit: number): Promise<SearchResult[]> {
  if (!env.BRAVE_SEARCH_API_KEY) return [];
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query); u.searchParams.set("count", String(Math.min(limit, 10)));
  const response = await fetch(u, { headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY }, signal: timeout(Number(env.FETCH_TIMEOUT_MS ?? 8000)) });
  if (!response.ok) throw new Error(`Brave HTTP ${response.status}`);
  const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string }> } };
  return (body.web?.results ?? []).flatMap((r) => r.url && r.title ? [{ url: r.url, title: r.title, snippet: r.description ?? "", provider: "brave" as const }] : []);
}

function domain(url: string): string { try { return new URL(url).hostname; } catch { return "unknown"; } }

function blocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./); if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (h === "::1" || h === "::" || h.startsWith("fc") || h.startsWith("fd") || /^fe8[0-9a-f]:/i.test(h)) return true;
  return false;
}

async function inspect(urlRaw: string, env: Env): Promise<{ fetched: boolean; title?: string; description?: string }> {
  const url = new URL(urlRaw);
  if (!["http:", "https:"].includes(url.protocol) || blocked(url.hostname) || url.username || url.password) return { fetched: false };
  const response = await fetch(url, { redirect: "error", headers: { Accept: "text/html,application/xhtml+xml;q=0.9", "user-agent": env.USER_AGENT ?? "DeepSearchPublic/0.5" }, signal: timeout(Number(env.FETCH_TIMEOUT_MS ?? 8000)) });
  if (!response.ok) return { fetched: false };
  const type = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) return { fetched: false };
  const html = (await response.text()).slice(0, Math.max(10000, Math.min(Number(env.MAX_PAGE_BYTES ?? 150000), 500000)));
  const title = text((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")).slice(0, 500);
  const description = decode((html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? "")).slice(0, 1200);
  return { fetched: true, title, description };
}

async function deepSearch(query: string, env: Env, limit: number): Promise<SearchRun> {
  const startedAt = new Date().toISOString();
  const expandedQueries = expandQuery(query);
  let raw: SearchResult[] = [];
  const errors: string[] = [];
  let providerInstance: string | undefined;
  const providerName = env.SEARCH_PROVIDER ?? "searxng";

  for (const q of expandedQueries.slice(0, 5)) {
    if (providerName === "brave") {
      raw.push(...await brave(q, env, limit));
    } else {
      const found = await searchWithFallback(q, env, limit);
      raw.push(...found.results);
      if (!providerInstance && found.instance) providerInstance = found.instance;
      errors.push(...found.errors.map((e) => `${q}: ${e}`));
      if (!found.results && providerName === "auto" && env.BRAVE_SEARCH_API_KEY) raw.push(...await brave(q, env, limit));
    }
  }

  const unique = deduplicate(raw).map((r): Evidence => ({
    id: evidenceId(r.url), url: r.url, title: r.title, snippet: r.snippet, sourceDomain: domain(r.url),
    provider: r.provider, score: scoreResult(r, query), fetched: false
  })).sort((a, b) => b.score - a.score).slice(0, limit);

  await Promise.allSettled(unique.slice(0, 3).map(async (item) => {
    const page = await inspect(item.url, env);
    if (page.fetched) { item.fetched = true; if (page.title) item.title = page.title; if (page.description) item.snippet = page.description; }
  }));

  return { id: crypto.randomUUID(), query, expandedQueries, results: unique, startedAt, finishedAt: new Date().toISOString(), provider: providerName, providerInstance, providerErrors: errors.slice(-30) };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });
    if (!origin) return json({ error: "Origin not allowed" }, 403);

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "deepsearch-public-api", runtime: "cloudflare-workers", provider: env.SEARCH_PROVIDER ?? "searxng", instances: instances(env).map((x) => new URL(x).hostname) }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/api/search") {
      const body = await request.json().catch(() => ({})) as { query?: unknown; limit?: unknown };
      const query = typeof body.query === "string" ? body.query.trim() : "";
      if (!query || query.length > MAX_QUERY) return json({ error: "Query must be 1-500 characters" }, 400, origin);
      try {
        const run = await deepSearch(query, env, Math.max(1, Math.min(Number(body.limit) || Number(env.MAX_RESULTS) || 10, 10)));
        return json(run, 200, origin);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : "Search failed" }, 502, origin);
      }
    }

    if (request.method === "POST" && url.pathname === "/api/report") {
      const body = await request.json().catch(() => ({})) as { run?: SearchRun };
      if (!body.run) return json({ error: "run is required" }, 400, origin);
      return new Response(buildReport(body.run), { status: 200, headers: { "content-type": "text/markdown; charset=utf-8", ...cors(origin) } });
    }

    if (request.method === "POST" && url.pathname === "/api/inspect") {
      const body = await request.json().catch(() => ({})) as { url?: unknown };
      if (typeof body.url !== "string") return json({ error: "url is required" }, 400, origin);
      try { return json(await inspect(body.url, env), 200, origin); } catch { return json({ fetched: false }, 200, origin); }
    }

    return json({ error: "Not found" }, 404, origin);
  }
};
