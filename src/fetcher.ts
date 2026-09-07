import { lookup } from "node:dns/promises";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { config } from "./config.js";
import type { PageDocument } from "./types.js";

type RobotsPolicy = {
  isAllowed: (url: string, userAgent: string) => boolean | undefined;
};

const require = createRequire(import.meta.url);
const robotsParser = require("robots-parser") as (url: string, robotsText: string) => RobotsPolicy;
const robotsCache = new Map<string, RobotsPolicy>();

function ipv4Private(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) return true;
  const a = octets[0];
  const b = octets[1];
  if (a === undefined || b === undefined) return true;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function ipv6Private(address: string): boolean {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.") ||
    normalized.startsWith("::ffff:127.");
}

async function isPublicHost(hostname: string): Promise<boolean> {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) return false;
  const literalType = isIP(lower);
  if (literalType === 4) return !ipv4Private(lower);
  if (literalType === 6) return !ipv6Private(lower);
  try {
    const addresses = await lookup(lower, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) =>
      isIP(address) === 4 ? !ipv4Private(address) : !ipv6Private(address)
    );
  } catch {
    return false;
  }
}

async function allowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  let robots = robotsCache.get(robotsUrl);
  if (!robots) {
    try {
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": config.USER_AGENT },
        signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS),
        redirect: "error"
      });
      const text = response.ok ? await response.text() : "";
      robots = robotsParser(robotsUrl, text);
      robotsCache.set(robotsUrl, robots);
    } catch {
      return false;
    }
  }
  return robots.isAllowed(url, config.USER_AGENT) ?? false;
}

export async function fetchPublicPage(url: string): Promise<PageDocument | null> {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (!["http:", "https:"].includes(parsed.protocol)) return null;
  if (!(await isPublicHost(parsed.hostname))) return null;
  if (!(await allowedByRobots(url))) return null;

  const response = await fetch(url, {
    redirect: "error",
    headers: {
      "User-Agent": config.USER_AGENT,
      Accept: "text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8"
    },
    signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS)
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;

  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > config.MAX_PAGE_BYTES) return null;
  const html = await response.text();
  if (Buffer.byteLength(html, "utf8") > config.MAX_PAGE_BYTES) return null;

  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header").remove();
  const title = $("title").first().text().trim();
  const description = $("meta[name='description']").attr("content")?.trim() ?? "";
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 50000);

  return {
    url,
    finalUrl: response.url,
    title,
    description,
    text,
    fetchedAt: new Date().toISOString(),
    status: response.status
  };
}
