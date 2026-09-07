# DeepSearch Public

Privacy-aware deep web search engine for discovering, correlating, and verifying publicly available information across multiple sources.

> **Status:** v0.3 foundation + Cloudflare Workers + keyless SearXNG search

## What it does

DeepSearch Public is a modular public-web research engine. It expands a user's query into deterministic variants, searches through a provider abstraction, canonicalizes and deduplicates results, ranks evidence, and can inspect public HTML pages while respecting `robots.txt`.

The project has two runtimes:

- **Node/Fastify** for local development and traditional server hosting.
- **Cloudflare Workers** for the lightweight production API and GitHub-connected deployment.

The production Worker now defaults to **SearXNG**, so it can perform public-web search without a Brave API key. A public SearXNG instance is configurable and can be replaced with a self-hosted instance later. Brave remains available as an optional provider/fallback.

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
                    SearXNG / Brave Provider
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

## Search providers

### SearXNG — default, no API key

SearXNG is a free/open-source metasearch engine. The Worker is configured with a public SearXNG instance so the project can run without a paid search API credential. Public instances are operated independently and can have different limits, enabled formats, engines, or availability; for production consistency, a self-hosted SearXNG instance is the preferred long-term option.

Configuration:

```env
SEARCH_PROVIDER=searxng
SEARXNG_URL=https://searx.tiekoetter.com
```

SearXNG's HTTP API uses `/search` with `format=json`. Some public instances disable JSON output, so the configured instance must support it.

### Brave — optional

```env
SEARCH_PROVIDER=brave
BRAVE_SEARCH_API_KEY=your_key_here
```

### Auto fallback

```env
SEARCH_PROVIDER=auto
SEARXNG_URL=https://searx.tiekoetter.com
BRAVE_SEARCH_API_KEY=your_key_here
```

In `auto` mode, DeepSearch tries SearXNG first and uses Brave only when SearXNG returns no results.

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

The default local configuration uses SearXNG, so no search API key is required. For real web search, configure `SEARXNG_URL` if you want a different instance.

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

The current production configuration uses:

```text
SEARCH_PROVIDER=searxng
SEARXNG_URL=https://searx.tiekoetter.com
```

No secret is required for the default SearXNG mode. If Brave is enabled, keep `BRAVE_SEARCH_API_KEY` as a **Cloudflare Worker Secret**. Never put a Brave key in `wrangler.jsonc`, browser JavaScript, or a public repository file.

Recommended deployment path:

1. Create a Cloudflare account and open **Workers & Pages**.
2. Choose **Create application → Import an existing Git repository**.
3. Select `camoosk/deepsearch-public`.
4. Use the repository's `wrangler.jsonc` configuration.
5. Deploy and verify `GET /health`.
6. Connect the GitHub repository through **Settings → Builds** so future pushes deploy automatically.

Cloudflare's Workers Free plan currently includes 100,000 Worker requests per day. The production Worker keeps external calls bounded and avoids storing request-scoped state globally.

## GitHub Pages frontend

The static frontend lives in `docs/` and is designed for GitHub Pages and mobile browsers. It now points to the production Worker by default:

```text
https://camoosk.github.io/deepsearch-public/
```

A custom API can still be supplied with:

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
- [x] Keyless SearXNG search provider
- [ ] Multi-provider federation improvements
- [ ] Persistent research runs
- [ ] Source credibility profiles
- [ ] Claim/evidence graph
- [ ] Cross-source entity correlation with conservative matching
- [ ] Optional LLM-assisted synthesis with explicit citations

## License

MIT
