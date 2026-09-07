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
