import type { SearchRun } from "./types.js";

export function toMarkdown(run: SearchRun): string {
  const lines = [
    `# DeepSearch Report`,
    "",
    `**Query:** ${run.query}`,
    `**Run:** ${run.id}`,
    `**Started:** ${run.startedAt}`,
    `**Finished:** ${run.finishedAt}`,
    "",
    "## Expanded queries",
    "",
    ...run.expandedQueries.map((query) => `- ${query}`),
    "",
    "## Evidence",
    "",
    ...run.results.flatMap((item, index) => [
      `### ${index + 1}. ${item.title}`,
      `- **Score:** ${item.score.toFixed(3)}`,
      `- **Domain:** ${item.sourceDomain}`,
      `- **Fetched:** ${item.fetched ? "yes" : "no"}`,
      `- **URL:** ${item.url}`,
      `- **Snippet:** ${item.snippet || "(none)"}`,
      ""
    ]),
    "## Verification note",
    "",
    "Search ranking is not proof of truth. Verify important claims against the underlying source and, when possible, independent sources."
  ];
  return lines.join("\n");
}
