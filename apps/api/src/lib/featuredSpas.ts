import type { RowDataPacket } from "mysql2";
import { pool } from "../db/pool.js";

export const ADMIN_NOTES_MAX = 1000;

export interface FeaturedRow {
  spaId: number;
  displayOrder: number;
}

export interface FeaturedHistoryEvent {
  action: "featured" | "removed";
  at: string;
  displayOrder: number | null;
}

export interface FeaturedPlacementSummary {
  featuredAt: string;
  removedAt: string | null;
  position: number | null;
}

export interface FeaturedPlacement {
  displayOrder: number;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function httpError(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

export function requireAdminRole(role: string | undefined | null): void {
  if (role !== "admin") httpError(403, "Admin access required");
}

export function parseDisplayOrder(raw: unknown): number {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n > 0) return n;
  }
  httpError(400, "Position must be a positive whole number");
}

export function clampDisplayOrder(requested: number, otherCount: number): number {
  return Math.min(requested, otherCount + 1);
}

export function parseAdminNotes(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string") httpError(400, "Notes must be text");
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > ADMIN_NOTES_MAX) {
    httpError(400, `Notes must be ${ADMIN_NOTES_MAX} characters or fewer`);
  }
  return trimmed;
}

export function planFeaturedOrders(
  rows: FeaturedRow[],
  spaId: number,
  requestedPosition: number
): FeaturedRow[] {
  const others = rows
    .filter((row) => row.spaId !== spaId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.spaId - b.spaId);
  const position = clampDisplayOrder(requestedPosition, others.length);
  const next = [...others];
  next.splice(position - 1, 0, { spaId, displayOrder: position });
  return next.map((row, index) => ({ spaId: row.spaId, displayOrder: index + 1 }));
}

export function planRemoveOrders(rows: FeaturedRow[], spaId: number): FeaturedRow[] {
  return rows
    .filter((row) => row.spaId !== spaId)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.spaId - b.spaId)
    .map((row, index) => ({ spaId: row.spaId, displayOrder: index + 1 }));
}

export function publicFeaturedSequence(
  featured: FeaturedRow[],
  spas: Array<{ id: number; isPublished: boolean }>
): number[] {
  const published = new Set(spas.filter((spa) => spa.isPublished).map((spa) => spa.id));
  return [...featured]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.spaId - b.spaId)
    .filter((row) => published.has(row.spaId))
    .map((row) => row.spaId);
}

export function omitAdminNotes<T extends { adminNotes?: unknown }>(
  value: T
): Omit<T, "adminNotes"> {
  const { adminNotes: _notes, ...rest } = value;
  return rest;
}

export function placementSummary(events: FeaturedHistoryEvent[]): FeaturedPlacementSummary[] {
  const placements: FeaturedPlacementSummary[] = [];
  for (const event of events) {
    if (event.action === "featured") {
      placements.push({
        featuredAt: event.at,
        removedAt: null,
        position: event.displayOrder,
      });
      continue;
    }
    const open = [...placements].reverse().find((item) => item.removedAt == null);
    if (open) open.removedAt = event.at;
  }
  return placements;
}

function asIso(value: Date | string): string {
  return new Date(value).toISOString();
}

async function lockRows(conn: Awaited<ReturnType<typeof pool.getConnection>>): Promise<FeaturedRow[]> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT spa_id AS spaId, display_order AS displayOrder
     FROM featured_spas
     ORDER BY display_order ASC, spa_id ASC
     FOR UPDATE`
  );
  return rows.map((row) => ({
    spaId: Number(row.spaId),
    displayOrder: Number(row.displayOrder),
  }));
}

async function writeOrders(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  rows: FeaturedRow[],
  userId: number
): Promise<void> {
  for (const row of rows) {
    await conn.execute(
      "UPDATE featured_spas SET display_order = ?, updated_by_user_id = ? WHERE spa_id = ?",
      [row.displayOrder, userId, row.spaId]
    );
  }
}

export async function loadFeaturedAdmin(spaId: number): Promise<{
  spaId: number;
  name: string;
  isPublished: boolean;
  placement: FeaturedPlacement | null;
  listLength: number;
  history: FeaturedHistoryEvent[];
  summary: FeaturedPlacementSummary[];
}> {
  const conn = await pool.getConnection();
  try {
    const [spas] = await conn.query<RowDataPacket[]>(
      "SELECT id, name, is_published AS isPublished FROM spas WHERE id = ?",
      [spaId]
    );
    const spa = spas[0];
    if (!spa) httpError(404, "Clinic not found");

    const [placementRows] = await conn.query<RowDataPacket[]>(
      `SELECT display_order AS displayOrder, admin_notes AS adminNotes, created_at AS createdAt, updated_at AS updatedAt
       FROM featured_spas WHERE spa_id = ?`,
      [spaId]
    );
    const [countRows] = await conn.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM featured_spas");
    const [eventRows] = await conn.query<RowDataPacket[]>(
      `SELECT action, display_order AS displayOrder, created_at AS createdAt
       FROM featured_spa_events
       WHERE spa_id = ?
       ORDER BY created_at ASC, id ASC`,
      [spaId]
    );

    const placement = placementRows[0]
      ? {
          displayOrder: Number(placementRows[0].displayOrder),
          adminNotes: (placementRows[0].adminNotes as string | null) ?? null,
          createdAt: asIso(placementRows[0].createdAt as Date | string),
          updatedAt: asIso(placementRows[0].updatedAt as Date | string),
        }
      : null;
    const history = eventRows.map((row) => ({
      action: row.action as "featured" | "removed",
      at: asIso(row.createdAt as Date | string),
      displayOrder: row.displayOrder == null ? null : Number(row.displayOrder),
    }));

    return {
      spaId: Number(spa.id),
      name: String(spa.name),
      isPublished: Boolean(spa.isPublished),
      placement,
      listLength: Number(countRows[0]?.n ?? 0),
      history,
      summary: placementSummary(history),
    };
  } finally {
    conn.release();
  }
}

export async function upsertFeaturedSpa(
  spaId: number,
  requestedPosition: number,
  adminNotes: string | null,
  userId: number
): Promise<{ displayOrder: number; created: boolean }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [spas] = await conn.query<RowDataPacket[]>(
      "SELECT id, is_published AS isPublished FROM spas WHERE id = ? FOR UPDATE",
      [spaId]
    );
    const spa = spas[0];
    if (!spa) httpError(404, "Clinic not found");

    const current = await lockRows(conn);
    const existing = current.find((row) => row.spaId === spaId);
    if (!existing && !spa.isPublished) {
      httpError(409, "Only published clinics may be featured");
    }

    const next = planFeaturedOrders(current, spaId, requestedPosition);
    const assigned = next.find((row) => row.spaId === spaId)!.displayOrder;

    if (!existing) {
      try {
        await conn.execute(
          `INSERT INTO featured_spas
             (spa_id, display_order, admin_notes, created_by_user_id, updated_by_user_id)
           VALUES (?,?,?,?,?)`,
          [spaId, assigned, adminNotes, userId, userId]
        );
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "ER_DUP_ENTRY") httpError(409, "This clinic is already featured");
        throw err;
      }
      await conn.execute(
        `INSERT INTO featured_spa_events (spa_id, action, display_order, created_by_user_id)
         VALUES (?,?,?,?)`,
        [spaId, "featured", assigned, userId]
      );
    } else {
      await conn.execute(
        `UPDATE featured_spas
         SET admin_notes = ?, updated_by_user_id = ?
         WHERE spa_id = ?`,
        [adminNotes, userId, spaId]
      );
    }

    await writeOrders(conn, next, userId);
    await conn.commit();
    return { displayOrder: assigned, created: !existing };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function removeFeaturedSpa(spaId: number, userId: number): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const current = await lockRows(conn);
    const existing = current.find((row) => row.spaId === spaId);
    if (!existing) httpError(404, "This clinic is not featured");

    const next = planRemoveOrders(current, spaId);
    await conn.execute("DELETE FROM featured_spas WHERE spa_id = ?", [spaId]);
    await conn.execute(
      `INSERT INTO featured_spa_events (spa_id, action, display_order, created_by_user_id)
       VALUES (?,?,?,?)`,
      [spaId, "removed", existing.displayOrder, userId]
    );
    await writeOrders(conn, next, userId);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export function publicPayloadHasNotes(payload: unknown): boolean {
  const text = JSON.stringify(payload);
  return text.includes("adminNotes") || text.includes("admin_notes");
}
