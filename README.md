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

### Markdown report

`POST /api/report`

```json
{
  "query": "volcanic ash Jakarta",
  "limit": 10
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

## Deploy the API

GitHub Pages hosts the static frontend only. The repository includes a `render.yaml` Blueprint for deploying the Node/Fastify API as a separate web service.

The deployment expects a server-side `BRAVE_SEARCH_API_KEY`; the key must never be placed in `docs/`, browser JavaScript, or a public repository file.

After deployment, the frontend can use the API by opening the Pages URL with an `api` query parameter, for example:

```text
https://camoosk.github.io/deepsearch-public/?api=https://YOUR-API-HOST
```

The browser UI falls back to its safe demo mode if the API is unavailable.

## Web UI

The static frontend lives in `docs/` and is designed for GitHub Pages and mobile browsers. It currently supports browser-demo discovery and live API mode through the `api` query parameter.

## Roadmap

- [x] Provider abstraction
- [x] Multi-query expansion
- [x] URL canonicalization and deduplication
- [x] Evidence scoring
- [x] Robots-aware public page inspection
- [x] HTTP API
- [x] Basic automated tests
- [x] Markdown report generation
- [x] Static Web UI / GitHub Pages demo
- [x] Render backend deployment blueprint
- [ ] Multi-provider federation
- [ ] Persistent research runs
- [ ] Source credibility profiles
- [ ] Claim/evidence graph
- [ ] Cross-source entity correlation with conservative matching
- [ ] Optional LLM-assisted synthesis with explicit citations

## License

MIT
