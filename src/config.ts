import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  SEARCH_PROVIDER: z.enum(["mock", "brave"]).default("mock"),
  BRAVE_SEARCH_API_KEY: z.string().default(""),
  MAX_RESULTS: z.coerce.number().int().min(1).max(50).default(10),
  FETCH_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  MAX_PAGE_BYTES: z.coerce.number().int().min(10000).max(10000000).default(2000000),
  USER_AGENT: z.string().default("DeepSearchPublic/0.1")
});

export const config = schema.parse(process.env);
