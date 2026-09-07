import { describe, expect, it } from "vitest";
import { canonicalUrl, deduplicate } from "../src/search/dedup.js";

describe("URL deduplication", () => {
  it("removes tracking parameters and fragments", () => {
    expect(canonicalUrl("https://Example.com/a/?utm_source=x#section")).toBe("https://example.com/a");
  });

  it("deduplicates equivalent results", () => {
    const result = deduplicate([
      { url: "https://example.com/a?utm_source=x", title: "A", snippet: "one", provider: "mock" },
      { url: "https://example.com/a", title: "A2", snippet: "two", provider: "mock" }
    ]);
    expect(result).toHaveLength(1);
  });
});
