import type { SearchQuery, SearchResult, SearchProviderName } from "../types.js";

export interface SearchProvider {
  readonly name: SearchProviderName;
  search(request: SearchQuery): Promise<SearchResult[]>;
}

export class MockProvider implements SearchProvider {
  readonly name = "mock" as const;

  async search(request: SearchQuery): Promise<SearchResult[]> {
    const q = encodeURIComponent(request.query);
    return [{
      url: `https://example.com/search?q=${q}`,
      title: `Mock result for ${request.query}`,
      snippet: "Demo result. Configure a real search provider to search the public web.",
      provider: this.name
    }].slice(0, request.limit ?? 10);
  }
}

export class SearXNGProvider implements SearchProvider {
  readonly name = "searxng" as const;
  constructor(private readonly baseUrl: string) {}

  async search(request: SearchQuery): Promise<SearchResult[]> {
    const base = new URL(this.baseUrl);
    if (base.protocol !== "https:") throw new Error("SEARXNG_URL must use HTTPS");
    base.pathname = base.pathname.replace(/\/$/, "");
    base.search = "";
    base.hash = "";

    const url = new URL(`${base.toString().replace(/\/$/, "")}/search`);
    url.searchParams.set("q", request.query);
    url.searchParams.set("format", "json");
    url.searchParams.set("categories", "general");
    url.searchParams.set("language", "en");
    url.searchParams.set("safesearch", "1");
    url.searchParams.set("pageno", "1");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "user-agent": "DeepSearchPublic/0.3" },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`SearXNG search failed with HTTP ${response.status}`);

    const body = (await response.json()) as {
      results?: Array<{ url?: string; title?: string; content?: string; publishedDate?: string }>;
    };
    return (body.results ?? []).slice(0, Math.min(request.limit ?? 10, 20)).flatMap((item) => {
      if (!item.url || !item.title) return [];
      const result: SearchResult = {
        url: item.url,
        title: item.title,
        snippet: item.content ?? "",
        provider: this.name
      };
      if (item.publishedDate) result.publishedAt = item.publishedDate;
      return [result];
    });
  }
}

export class BraveProvider implements SearchProvider {
  readonly name = "brave" as const;
  constructor(private readonly apiKey: string) {}

  async search(request: SearchQuery): Promise<SearchResult[]> {
    if (!this.apiKey) throw new Error("BRAVE_SEARCH_API_KEY is required for the Brave provider");
    const limit = Math.min(request.limit ?? 10, 20);
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", request.query);
    url.searchParams.set("count", String(limit));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey
      },
      signal: AbortSignal.timeout(10000)
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
        provider: this.name
      };
      if (item.age) result.publishedAt = item.age;
      return [result];
    });
  }
}
