export type SearchProviderName = "mock" | "brave" | "searxng";

export interface SearchQuery {
  query: string;
  limit?: number;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  provider: SearchProviderName;
  publishedAt?: string;
}

export interface PageDocument {
  url: string;
  finalUrl: string;
  title: string;
  description: string;
  text: string;
  fetchedAt: string;
  status: number;
}

export interface Evidence {
  id: string;
  url: string;
  title: string;
  snippet: string;
  sourceDomain: string;
  provider: SearchProviderName;
  score: number;
  fetched?: boolean;
}

export interface SearchRun {
  id: string;
  query: string;
  expandedQueries: string[];
  results: Evidence[];
  startedAt: string;
  finishedAt: string;
}
