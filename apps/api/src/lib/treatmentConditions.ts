import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { OTHER_MEDICAL_CONDITION_CATEGORY } from "../db/lookups.js";

export async function loadTreatmentConditions(treatmentIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (treatmentIds.length === 0) return map;
  const rows = await query<{ treatmentId: number; name: string }>(
    `SELECT tmc.treatment_id AS treatmentId, mc.name
     FROM treatment_medical_conditions tmc
     JOIN medical_conditions mc ON mc.id = tmc.medical_condition_id
     WHERE tmc.treatment_id IN (${treatmentIds.map(() => "?").join(",")})
     ORDER BY tmc.treatment_id, tmc.sort_order, mc.name`,
    treatmentIds
  ).catch(() => []);
  for (const row of rows) {
    const list = map.get(row.treatmentId) ?? [];
    list.push(row.name);
    map.set(row.treatmentId, list);
  }
  return map;
}

export async function ensureOtherCategoryId(): Promise<number> {
  const existing = await queryOne<{ id: number; isDeleted: number }>(
    "SELECT id, is_deleted AS isDeleted FROM medical_condition_categories WHERE name = ?",
    [OTHER_MEDICAL_CONDITION_CATEGORY]
  );
  if (existing) {
    if (Number(existing.isDeleted)) {
      await execute("UPDATE medical_condition_categories SET is_deleted = 0 WHERE id = ?", [existing.id]);
      await staticCache.reload();
    }
    return existing.id;
  }
  const maxSort = await queryOne<{ n: number }>(
    "SELECT COALESCE(MAX(sort_order), 0) AS n FROM medical_condition_categories"
  );
  const result = await execute(
    "INSERT INTO medical_condition_categories (name, sort_order, is_deleted) VALUES (?, ?, 0)",
    [OTHER_MEDICAL_CONDITION_CATEGORY, Number(maxSort?.n ?? 0) + 1]
  );
  await staticCache.reload();
  return result.insertId;
}

async function findConditionByName(name: string): Promise<{ id: number; isDeleted: number } | null> {
  return queryOne<{ id: number; isDeleted: number }>(
    "SELECT id, is_deleted AS isDeleted FROM medical_conditions WHERE LOWER(name) = ?",
    [name.toLowerCase()]
  );
}

export async function resolveMedicalConditionIds(
  names: string[],
  allowDeletedIds: number[] = []
): Promise<{ ids: number[]; error: string | null }> {
  const allowedDeleted = new Set(allowDeletedIds);
  const ids: number[] = [];
  const seen = new Set<number>();
  let created = false;

  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!name) continue;

    let row = await findConditionByName(name);
    if (row) {
      if (Number(row.isDeleted) && !allowedDeleted.has(row.id)) {
        return { ids: [], error: `"${name}" is no longer available.` };
      }
      if (!seen.has(row.id)) {
        seen.add(row.id);
        ids.push(row.id);
      }
      continue;
    }

    const otherId = await ensureOtherCategoryId();
    try {
      const result = await execute(
        "INSERT INTO medical_conditions (category_id, name, is_deleted) VALUES (?, ?, 0)",
        [otherId, name]
      );
      created = true;
      seen.add(result.insertId);
      ids.push(result.insertId);
    } catch (err) {
      if ((err as { code?: string }).code !== "ER_DUP_ENTRY") throw err;
      row = await findConditionByName(name);
      if (!row) return { ids: [], error: `Could not save “${name}”.` };
      if (Number(row.isDeleted) && !allowedDeleted.has(row.id)) {
        return { ids: [], error: `"${name}" is no longer available.` };
      }
      if (!seen.has(row.id)) {
        seen.add(row.id);
        ids.push(row.id);
      }
    }
  }

  if (created) await staticCache.reload();
  return { ids, error: null };
}

export async function replaceTreatmentConditions(treatmentId: number, names: string[]): Promise<string | null> {
  const existing = await query<{ id: number }>(
    "SELECT medical_condition_id AS id FROM treatment_medical_conditions WHERE treatment_id = ?",
    [treatmentId]
  ).catch(() => []);
  const { ids, error } = await resolveMedicalConditionIds(
    names,
    existing.map((row) => row.id)
  );
  if (error) return error;
  await execute("DELETE FROM treatment_medical_conditions WHERE treatment_id = ?", [treatmentId]);
  for (let i = 0; i < ids.length; i++) {
    await execute(
      "INSERT INTO treatment_medical_conditions (treatment_id, medical_condition_id, sort_order) VALUES (?, ?, ?)",
      [treatmentId, ids[i], i]
    );
  }
  return null;
}
