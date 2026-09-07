import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { config } from "./config.js";
import type { PageDocument } from "./types.js";

const robotsCache = new Map<string, ReturnType<typeof robotsParser>>();

function originOf(url: string): string {
  return new URL(url).origin;
}

async function allowedByRobots(url: string): Promise<boolean> {
  const parsed = new URL(url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  let robots = robotsCache.get(robotsUrl);
  if (!robots) {
    try {
      const response = await fetch(robotsUrl, {
        headers: { "User-Agent": config.USER_AGENT },
        signal: AbortSignal.timeout(config.FETCH_TIMEOUT_MS)
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
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  if (!(await allowedByRobots(url))) return null;

  const response = await fetch(url, {
    redirect: "follow",
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
