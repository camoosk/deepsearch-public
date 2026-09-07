import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { fetchPublicPage } from "./fetcher.js";
import { toMarkdown } from "./report.js";
import { deepSearch } from "./search/engine.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(rateLimit, {
  max: config.RATE_LIMIT_MAX,
  timeWindow: config.RATE_LIMIT_WINDOW,
  errorResponseBuilder: (_request, context) => ({
    error: "Rate limit exceeded",
    retryAfterSeconds: Math.ceil(context.ttl / 1000)
  })
});

const searchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(50).optional()
});
const inspectSchema = z.object({ url: z.string().url().max(2048) });

app.get("/health", async () => ({
  status: "ok",
  service: "deepsearch-public",
  version: "0.2.0",
  provider: config.SEARCH_PROVIDER
}));

app.post("/api/search", async (request, reply) => {
  const parsed = searchSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
  try {
    return await deepSearch(parsed.data.query, parsed.data.limit);
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Search provider error" });
  }
});

app.post("/api/report", async (request, reply) => {
  const parsed = searchSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.issues });
  try {
    const run = await deepSearch(parsed.data.query, parsed.data.limit);
    return reply.type("text/markdown; charset=utf-8").send(toMarkdown(run));
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: error instanceof Error ? error.message : "Report generation failed" });
  }
});

app.post("/api/inspect", async (request, reply) => {
  const parsed = inspectSchema.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: "Invalid URL" });
  try {
    const document = await fetchPublicPage(parsed.data.url);
    if (!document) return reply.code(422).send({ error: "Page could not be fetched under public-web and robots policy" });
    return document;
  } catch (error) {
    request.log.error(error);
    return reply.code(502).send({ error: "Unable to fetch page" });
  }
});

app.setErrorHandler((error: { statusCode?: number; message?: string }, _request, reply) => {
  if (error.statusCode === 429) return reply.code(429).send({ error: "Rate limit exceeded" });
  reply.code(500).send({ error: error.message ?? "Internal server error" });
});

await app.listen({ port: config.PORT, host: config.HOST });
