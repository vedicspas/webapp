import { queryOne } from "../db/pool.js";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "clinic";
  let slug = base;
  let n = 2;
  while (await queryOne("SELECT id FROM spas WHERE slug = ?", [slug])) {
    slug = `${base}-${n}`.slice(0, 160);
    n += 1;
  }
  return slug;
}
