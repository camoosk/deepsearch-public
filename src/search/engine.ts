import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { fetchPublicPage } from "../fetcher.js";
import { deduplicate, evidenceId } from "./dedup.js";
import { expandQuery } from "./query-expander.js";
import { scoreResult } from "./ranker.js";
import { BraveProvider, MockProvider, type SearchProvider } from "./providers.js";
import type { Evidence, SearchRun } from "../types.js";

function domainOf(url: string): string {
  try { return new URL(url).hostname; } catch { return "unknown"; }
}

function provider(): SearchProvider {
  return config.SEARCH_PROVIDER === "brave"
    ? new BraveProvider(config.BRAVE_SEARCH_API_KEY)
    : new MockProvider();
}

export async function deepSearch(query: string, limit = config.MAX_RESULTS): Promise<SearchRun> {
  const startedAt = new Date().toISOString();
  const expandedQueries = expandQuery(query);
  if (!expandedQueries.length) throw new Error("Query must not be empty");

  const searchProvider = provider();
  const raw = [];
  for (const expanded of expandedQueries) {
    const results = await searchProvider.search({ query: expanded, limit });
    raw.push(...results);
  }

  const unique = deduplicate(raw)
    .map((result): Evidence => ({
      id: evidenceId(result.url),
      url: result.url,
      title: result.title,
      snippet: result.snippet,
      sourceDomain: domainOf(result.url),
      provider: result.provider,
      score: scoreResult(result, query),
      fetched: false
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Inspect a small top slice. This makes the run multi-stage without crawling the web broadly.
  const inspectTargets = unique.slice(0, Math.min(5, unique.length));
  await Promise.allSettled(inspectTargets.map(async (evidence) => {
    const page = await fetchPublicPage(evidence.url);
    if (!page) return;
    evidence.fetched = true;
    if (page.title) evidence.title = page.title;
    if (page.description) evidence.snippet = page.description;
  }));

  return {
    id: randomUUID(),
    query,
    expandedQueries,
    results: unique,
    startedAt,
    finishedAt: new Date().toISOString()
  };
}
