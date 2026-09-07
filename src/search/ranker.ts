import type { SearchResult } from "../types.js";

function domainOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

export function scoreResult(result: SearchResult, query: string): number {
  const q = query.toLowerCase();
  const haystack = `${result.title} ${result.snippet}`.toLowerCase();
  let score = 0;
  if (result.title.toLowerCase().includes(q)) score += 0.45;
  if (haystack.includes(q)) score += 0.25;
  if (domainOf(result.url).endsWith(".gov")) score += 0.12;
  if (domainOf(result.url).endsWith(".edu")) score += 0.08;
  if (domainOf(result.url).endsWith(".org")) score += 0.04;
  return Math.min(1, score + Math.min(result.snippet.length / 1000, 0.1));
}
