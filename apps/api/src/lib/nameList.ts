const MAX_NAME = 120;
const MAX_ITEMS = 80;

/** Split a comma-separated string or array into unique trimmed names. */
export function parseCommaNames(input: string | string[] | null | undefined, maxItems = MAX_ITEMS): string[] {
  const parts = Array.isArray(input) ? input.flatMap((value) => String(value).split(",")) : String(input ?? "").split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const name = part.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function encodeNameList(names: string[] | string | null | undefined): string | null {
  const list = parseCommaNames(names);
  return list.length ? JSON.stringify(list) : null;
}

export function decodeNameList(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parseCommaNames(parsed.map((item) => String(item)));
    } catch {
      // Fall through to comma parsing.
    }
  }
  return parseCommaNames(trimmed);
}
