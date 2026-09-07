const STOP = new Set(["the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are"]);

export function expandQuery(input: string): string[] {
  const query = input.trim().replace(/\s+/g, " ");
  if (!query) return [];

  const words = query.split(" ").filter((word) => word.length > 1);
  const quoted = `"${query.replaceAll('"', "")}"`;
  const meaningful = words.filter((word) => !STOP.has(word.toLowerCase()));
  const variants = [
    query,
    quoted,
    meaningful.length > 1 ? meaningful.join(" ") : undefined,
    meaningful.length > 2 ? `${meaningful.join(" ")} report` : undefined,
    meaningful.length > 2 ? `${meaningful.join(" ")} official` : undefined
  ].filter((value): value is string => Boolean(value));

  return [...new Set(variants)].slice(0, 5);
}
