# DeepSearch Public

Privacy-aware deep web search engine for discovering, correlating, and verifying publicly available information across multiple sources.

> **Status:** v0.2 foundation + Cloudflare Workers runtime

## What it does

DeepSearch Public is a modular public-web research engine. It expands a user's query into deterministic variants, searches through a provider abstraction, canonicalizes and deduplicates results, ranks evidence, and can inspect public HTML pages while respecting `robots.txt`.

The project has two runtimes:

- **Node/Fastify** for local development and traditional server hosting.
- **Cloudflare Workers** for the lightweight production API and GitHub-connected deployment.

The default local provider is a mock so the project runs without API credentials. The production Worker uses Brave Search through a server-side secret.

## Safety boundary

This project is designed for information that is publicly accessible and legitimately retrievable. It does **not** attempt to bypass authentication, access private accounts, exploit vulnerabilities, obtain leaked credentials, or defeat access controls. Search and inspection results should be treated as evidence to verify, not as automatically true facts.

## Architecture

```text
                         DeepSearch Public
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
             Node/Fastify             Cloudflare Worker
              local runtime             production API
                    │                       │
                    └───────────┬───────────┘
                                ▼
                         Query Expansion
                                │
                                ▼
                         Brave Search API
                                │
                                ▼
                    Canonicalize + Deduplicate
                                │
                                ▼
                         Evidence Ranking
                                │
                                ▼
                         SearchRun / Report
                                │
                                ▼
                   Optional public page inspection
                         robots.txt → HTML
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

The public-page inspector only accepts HTTP(S), rejects obvious local/private hosts and credential-bearing URLs, checks `robots.txt`, enforces response-size and timeout limits, and extracts readable HTML text.

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

## Cloudflare Workers deployment

The repository includes `wrangler.jsonc` and `src/worker.ts` for a Cloudflare Workers deployment. The Worker is deliberately lightweight because the Workers Free plan has a 10 ms CPU limit and 50 external subrequests per invocation.

Set the Brave key as a **Cloudflare Worker Secret** named `BRAVE_SEARCH_API_KEY`. Never put the key in `wrangler.jsonc`, browser JavaScript, or a public repository file.

Recommended deployment path:

1. Create a Cloudflare account and open **Workers & Pages**.
2. Choose **Create application → Import an existing Git repository**.
3. Select `camoosk/deepsearch-public`.
4. Use the repository's `wrangler.jsonc` configuration and Worker name `deepsearch-public-api`.
5. Add the `BRAVE_SEARCH_API_KEY` secret in the Worker settings.
6. Deploy and verify `GET /health`.
7. Connect the GitHub repository through **Settings → Builds** so future pushes deploy automatically.

Cloudflare's Workers Free plan currently includes 100,000 Worker requests per day. The production Worker keeps external calls bounded and avoids storing request-scoped state globally.

## GitHub Pages frontend

The static frontend lives in `docs/` and is designed for GitHub Pages and mobile browsers. It supports browser-demo discovery and live API mode through the `api` query parameter:

```text
https://camoosk.github.io/deepsearch-public/?api=https://YOUR-WORKER.workers.dev
```

The browser UI falls back to safe demo mode if the API is unavailable.

## Alternative Node deployment

`render.yaml` is retained for traditional Node/Fastify hosting. It is not required for the Cloudflare Workers deployment.

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
- [x] Node/Fastify backend
- [x] Cloudflare Workers runtime
- [ ] Multi-provider federation
- [ ] Persistent research runs
- [ ] Source credibility profiles
- [ ] Claim/evidence graph
- [ ] Cross-source entity correlation with conservative matching
- [ ] Optional LLM-assisted synthesis with explicit citations

## License

MIT
