import { describe, expect, it } from "vitest";
import { expandQuery } from "../src/search/query-expander.js";

describe("expandQuery", () => {
  it("returns deterministic variants", () => {
    const result = expandQuery("  volcanic ash Jakarta  ");
    expect(result[0]).toBe("volcanic ash Jakarta");
    expect(result).toContain('"volcanic ash Jakarta"');
    expect(new Set(result).size).toBe(result.length);
  });

  it("rejects empty input", () => {
    expect(expandQuery("   ")).toEqual([]);
  });
});
