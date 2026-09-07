# DeepSearch Public

Privacy-aware deep web search engine for discovering, correlating, and verifying publicly available information across multiple sources.

> **Status:** v0.1 foundation

## What it does

DeepSearch Public is a modular public-web research engine. It expands a user's query into several deterministic variants, searches through a provider abstraction, canonicalizes and deduplicates results, ranks evidence, and can inspect public HTML pages while respecting `robots.txt`.

The project is intentionally provider-agnostic: the default provider is a local mock so the project runs without API credentials. A Brave Search provider is included for real public-web search.

## Safety boundary

This project is designed for information that is publicly accessible and legitimately retrievable. It does **not** attempt to bypass authentication, access private accounts, exploit vulnerabilities, obtain leaked credentials, or defeat access controls. Search and inspection results should be treated as evidence to verify, not as automatically true facts.

## Architecture

```text
Query
  │
  ▼
Query Expansion
  │
  ├── original query
  ├── exact phrase
  ├── normalized terms
  └── research variants
  │
  ▼
Search Provider
  │
  ▼
Canonicalization + Deduplication
  │
  ▼
Evidence Ranking
  │
  ▼
SearchRun + Evidence Trail

Optional page inspection
  │
  ▼
robots.txt → HTML fetch → text extraction
```

## API

### Health

`GET /health`

### Search

`POST /api/search`

```json
{
  "query": "volcanic ash Jakarta",
  "limit": 10
}
```

### Inspect a public page

`POST /api/inspect`

```json
{
  "url": "https://example.com/"
}
```

The inspector only accepts HTTP(S), checks `robots.txt`, enforces response-size and timeout limits, and extracts readable HTML text.

## Run locally

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

For real web search, configure:

```env
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=your_key_here
```

Then build and run:

```bash
npm run build
npm start
```

Tests:

```bash
npm test
```

## Roadmap

- [x] Provider abstraction
- [x] Multi-query expansion
- [x] URL canonicalization and deduplication
- [x] Evidence scoring
- [x] Robots-aware public page inspection
- [x] HTTP API
- [x] Basic automated tests
- [ ] Multi-provider federation
- [ ] Persistent research runs
- [ ] Source credibility profiles
- [ ] Claim/evidence graph
- [ ] Cross-source entity correlation with conservative matching
- [ ] Report generation
- [ ] Optional LLM-assisted synthesis with explicit citations
- [ ] Web UI

## License

MIT
