import { createHash } from "node:crypto";
import type { SearchResult } from "../types.js";

export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

export function deduplicate(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const output: SearchResult[] = [];
  for (const result of results) {
    const canonical = canonicalUrl(result.url);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    output.push({ ...result, url: canonical });
  }
  return output;
}

export function evidenceId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}
