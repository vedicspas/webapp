import type { NamedLookup, OnRequestFlag } from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";

export interface SpaStay {
  languages: NamedLookup[];
  dietaryOptions: NamedLookup[];
  airportPickup: OnRequestFlag | null;
  accommodationTypes: NamedLookup[];
  accommodationOther: string | null;
  accessibility: string | null;
  familyAccommodation: OnRequestFlag | null;
}

function asFlag(value: unknown): OnRequestFlag | null {
  return value === "on_request" || value === "not_available" ? value : null;
}

async function upsertNames(table: "languages" | "dietary_options", names: string[]): Promise<number[]> {
  const ids: number[] = [];
  let created = false;
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;
    const existing = await queryOne<{ id: number }>(`SELECT id FROM ${table} WHERE name = ?`, [name]);
    if (existing) {
      ids.push(existing.id);
      continue;
    }
    const result = await execute(`INSERT INTO ${table} (name) VALUES (?)`, [name]);
    ids.push(result.insertId);
    created = true;
  }
  if (created) await staticCache.reload();
  return ids;
}

async function replaceJunction(
  spaId: number,
  table: "spa_languages" | "spa_dietary_options" | "spa_accommodation_types",
  column: "language_id" | "dietary_option_id" | "accommodation_type_id",
  ids: number[]
): Promise<void> {
  await execute(`DELETE FROM ${table} WHERE spa_id = ?`, [spaId]);
  for (const id of ids) {
    await execute(`INSERT INTO ${table} (spa_id, ${column}) VALUES (?, ?)`, [spaId, id]);
  }
}

export async function loadSpaStay(spaId: number): Promise<SpaStay> {
  const [languages, dietaryOptions, accommodationTypes, row] = await Promise.all([
    query<NamedLookup>(
      `SELECT l.id, l.name FROM spa_languages sl
       JOIN languages l ON l.id = sl.language_id
       WHERE sl.spa_id = ? ORDER BY l.name`,
      [spaId]
    ),
    query<NamedLookup>(
      `SELECT d.id, d.name FROM spa_dietary_options sd
       JOIN dietary_options d ON d.id = sd.dietary_option_id
       WHERE sd.spa_id = ? ORDER BY d.name`,
      [spaId]
    ),
    query<NamedLookup>(
      `SELECT t.id, t.name FROM spa_accommodation_types sat
       JOIN accommodation_types t ON t.id = sat.accommodation_type_id
       WHERE sat.spa_id = ? ORDER BY t.name`,
      [spaId]
    ),
    queryOne<{
      airport_pickup: string | null;
      accommodation_other: string | null;
      accessibility: string | null;
      family_accommodation: string | null;
    }>(
      `SELECT airport_pickup, accommodation_other, accessibility, family_accommodation
       FROM spas WHERE id = ?`,
      [spaId]
    ),
  ]);

  return {
    languages,
    dietaryOptions,
    airportPickup: asFlag(row?.airport_pickup),
    accommodationTypes,
    accommodationOther: row?.accommodation_other?.trim() || null,
    accessibility: row?.accessibility || null,
    familyAccommodation: asFlag(row?.family_accommodation),
  };
}

export async function saveSpaStay(
  spaId: number,
  input: {
    languages?: string[];
    dietaryOptions?: string[];
    airportPickup?: OnRequestFlag | null;
    accommodationTypeIds?: number[];
    accommodationOther?: string | null;
    accessibility?: string | null;
    familyAccommodation?: OnRequestFlag | null;
  }
): Promise<void> {
  const languageIds = await upsertNames("languages", input.languages ?? []);
  const dietIds = await upsertNames("dietary_options", input.dietaryOptions ?? []);
  const masterIds = new Set(staticCache.accommodationTypes.map((t) => t.id));
  const accommodationIds = [...new Set(input.accommodationTypeIds ?? [])].filter((id) => masterIds.has(id));
  await replaceJunction(spaId, "spa_languages", "language_id", languageIds);
  await replaceJunction(spaId, "spa_dietary_options", "dietary_option_id", dietIds);
  await replaceJunction(spaId, "spa_accommodation_types", "accommodation_type_id", accommodationIds);

  const other = input.accommodationOther?.trim().replace(/\s+/g, " ").slice(0, 200) || null;

  await execute(
    `UPDATE spas SET airport_pickup = ?, accommodation_other = ?, accessibility = ?, family_accommodation = ?
     WHERE id = ?`,
    [
      input.airportPickup ?? null,
      other,
      input.accessibility?.trim() || null,
      input.familyAccommodation ?? null,
      spaId,
    ]
  );
}
