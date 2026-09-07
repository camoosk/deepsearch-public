import { deduplicate, evidenceId } from "./search/dedup.js";
import { expandQuery } from "./search/query-expander.js";
import { scoreResult } from "./search/ranker.js";
import type { Evidence, SearchResult, SearchRun } from "./types.js";
import { buildReport } from "./report.js";

interface Env {
  BRAVE_SEARCH_API_KEY: string;
  ALLOWED_ORIGIN?: string;
  MAX_RESULTS?: string;
  MAX_PAGE_BYTES?: string;
  FETCH_TIMEOUT_MS?: string;
  USER_AGENT?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_QUERY_LENGTH = 500;
const MAX_INSPECT = 3;

function json(data: unknown, status = 200, origin?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin)
    }
  });
}

function corsHeaders(origin?: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin ?? "https://camoosk.github.io",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin"
  };
}

function requestOrigin(request: Request, env: Env): string | undefined {
  const origin = request.headers.get("origin");
  const allowed = env.ALLOWED_ORIGIN ?? "https://camoosk.github.io";
  if (!origin) return allowed;
  if (origin === allowed || origin === "http://localhost:3000" || origin === "http://127.0.0.1:3000") return origin;
  return undefined;
}

function clampLimit(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.floor(n), 10));
}

function timeoutSignal(ms: number): AbortSignal {
  return AbortSignal.timeout(Math.max(1000, Math.min(ms, 15000)));
}

async function braveSearch(query: string, apiKey: string, limit: number, timeoutMs: number): Promise<SearchResult[]> {
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not configured");
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(limit, 10)));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey
    },
    signal: timeoutSignal(timeoutMs)
  });
  if (!response.ok) throw new Error(`Brave search failed with HTTP ${response.status}`);

  const body = (await response.json()) as {
    web?: { results?: Array<{ url?: string; title?: string; description?: string; age?: string }> };
  };

  return (body.web?.results ?? []).flatMap((item) => {
    if (!item.url || !item.title) return [];
    const result: SearchResult = {
      url: item.url,
      title: item.title,
      snippet: item.description ?? "",
      provider: "brave"
    };
    if (item.age) result.publishedAt = item.age;
    return [result];
  });
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal" || host === "metadata.google.com") return true;
  if (/^127\./.test(host) || host === "0.0.0.0" || host === "::1") return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^100\.(6[4-9]|[7-9]\d)\./.test(host)) return true;
  if (host === "::" || host.startsWith("fc") || host.startsWith("fd") || /^fe8[0-9a-f]:/i.test(host)) return true;
  return false;
}

function validatePublicUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only HTTP(S) URLs are allowed");
  if (isBlockedHostname(url.hostname)) throw new Error("Private or local hosts are not allowed");
  if (url.username || url.password) throw new Error("Credential-bearing URLs are not allowed");
  return url;
}

function robotsAllows(text: string, target: URL): boolean {
  const lines = text.split(/\r?\n/);
  let applies = false;
  let hasRules = false;
  const path = target.pathname || "/";
  for (const raw of lines) {
    const line = raw.split("#", 1)[0]?.trim() ?? "";
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("deepsearchpublic");
      hasRules = false;
      continue;
    }
    if (applies && field === "disallow") {
      hasRules = true;
      if (value && path.startsWith(value)) return false;
    }
    if (applies && field === "allow" && value && path.startsWith(value)) hasRules = true;
  }
  return true;
}

async function fetchRobots(target: URL, env: Env): Promise<boolean> {
  const robotsUrl = new URL("/robots.txt", target.origin);
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": env.USER_AGENT ?? "DeepSearchPublic/0.2" },
      signal: timeoutSignal(Math.min(Number(env.FETCH_TIMEOUT_MS ?? 8000), 5000))
    });
    if (!response.ok) return true;
    const text = await response.text();
    return robotsAllows(text.slice(0, 200000), target);
  } catch {
    return true;
  }
}

function decodeHtml(html: string): { title: string; description: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descriptionMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const title = decodeEntities((titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 300);
  const description = decodeEntities((descriptionMatch?.[1] ?? "").replace(/\s+/g, " ").trim()).slice(0, 1000);
  const body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body.replace(/\s+/g, " ").trim()).slice(0, 50000);
  return { title, description, text };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}

async function inspectPublicPage(rawUrl: string, env: Env): Promise<{ fetched: boolean; title?: string; description?: string; text?: string; finalUrl?: string }> {
  const target = validatePublicUrl(rawUrl);
  if (!(await fetchRobots(target, env))) return { fetched: false };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Math.min(Number(env.FETCH_TIMEOUT_MS ?? 8000), 15000)));
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": env.USER_AGENT ?? "DeepSearchPublic/0.2"
      },
      signal: controller.signal
    });
    if (!response.ok) return { fetched: false };
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!type.includes("text/html") && !type.includes("application/xhtml+xml")) return { fetched: false };

    const maxBytes = Math.max(10000, Math.min(Number(env.MAX_PAGE_BYTES ?? 500000), 1000000));
    const reader = response.body?.getReader();
    if (!reader) return { fetched: false };
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = maxBytes - total;
      const chunk = value.byteLength <= remaining ? value : value.slice(0, remaining);
      chunks.push(chunk);
      total += chunk.byteLength;
      if (chunk.byteLength < value.byteLength) break;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = decodeHtml(new TextDecoder().decode(bytes));
    return { ...parsed, finalUrl: response.url || target.toString(), fetched: true };
  } finally {
    clearTimeout(timeout);
  }
}

async function deepSearchWorker(query: string, limit: number, env: Env): Promise<SearchRun> {
  const startedAt = new Date().toISOString();
  const expandedQueries = expandQuery(query).slice(0, 4);
  const batches = await Promise.allSettled(
    expandedQueries.map((variant) => braveSearch(variant, env.BRAVE_SEARCH_API_KEY, Math.min(limit, 5), Number(env.FETCH_TIMEOUT_MS ?? 8000)))
  );
  const raw: SearchResult[] = [];
  for (const batch of batches) if (batch.status === "fulfilled") raw.push(...batch.value);
  const unique = deduplicate(raw);
  const ranked = unique
    .map((result) => ({ result, score: scoreResult(result, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const inspected = await Promise.allSettled(ranked.slice(0, MAX_INSPECT).map((item) => inspectPublicPage(item.result.url, env)));
  const evidence: Evidence[] = ranked.map((item, index) => {
    const page = inspected[index];
    const pageData = page?.status === "fulfilled" ? page.value : undefined;
    return {
      id: evidenceId(item.result.url),
      url: pageData?.finalUrl ?? item.result.url,
      title: pageData?.title || item.result.title,
      snippet: pageData?.description || item.result.snippet,
      sourceDomain: new URL(item.result.url).hostname.toLowerCase(),
      provider: item.result.provider,
      score: item.score,
      fetched: pageData?.fetched ?? false
    };
  });

  return {
    id: crypto.randomUUID(),
    query,
    expandedQueries,
    results: evidence,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = requestOrigin(request, env);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!origin && request.headers.get("origin")) return json({ error: "Origin not allowed" }, 403);

    const url = new URL(request.url);
    const corsOrigin = origin ?? env.ALLOWED_ORIGIN;

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "deepsearch-public-api", runtime: "cloudflare-workers" }, 200, corsOrigin);
      }
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, corsOrigin);

      if (url.pathname === "/api/search" || url.pathname === "/api/report") {
        const body = await request.json().catch(() => null) as { query?: unknown; limit?: unknown } | null;
        const query = typeof body?.query === "string" ? body.query.trim().replace(/\s+/g, " ") : "";
        if (!query) return json({ error: "query is required" }, 400, corsOrigin);
        if (query.length > MAX_QUERY_LENGTH) return json({ error: `query is limited to ${MAX_QUERY_LENGTH} characters` }, 422, corsOrigin);
        const limit = clampLimit(body?.limit, clampLimit(env.MAX_RESULTS, DEFAULT_LIMIT));
        const run = await deepSearchWorker(query, limit, env);
        if (url.pathname === "/api/report") {
          return new Response(buildReport(run), {
            status: 200,
            headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store", ...corsHeaders(corsOrigin) }
          });
        }
        return json(run, 200, corsOrigin);
      }

      if (url.pathname === "/api/inspect") {
        const body = await request.json().catch(() => null) as { url?: unknown } | null;
        if (typeof body?.url !== "string" || !body.url.trim()) return json({ error: "url is required" }, 400, corsOrigin);
        const page = await inspectPublicPage(body.url.trim(), env);
        return json(page, 200, corsOrigin);
      }

      return json({ error: "Not found" }, 404, corsOrigin);
    } catch (error) {
      const message = errorMessage(error);
      const status = /required|not allowed|only http|private|credential/i.test(message) ? 422 : 502;
      return json({ error: message }, status, corsOrigin);
    }
  }
};
