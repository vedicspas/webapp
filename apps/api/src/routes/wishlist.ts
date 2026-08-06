import type { FastifyInstance } from "fastify";
import { execute, query } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";
import {
  SPA_SUMMARY_SELECT,
  amenityIdsBySpa,
  toSpaSummary,
  type SpaSummaryRow,
} from "../lib/spaQueries.js";

export async function wishlistRoutes(app: FastifyInstance): Promise<void> {
  app.get("/wishlist", { preHandler: requireAuth }, async (request) => {
    const rows = await query<SpaSummaryRow>(
      `${SPA_SUMMARY_SELECT}
       JOIN wishlist_items w ON w.spa_id = s.id
       WHERE w.user_id = ? AND s.is_published = 1
       ORDER BY w.created_at DESC`,
      [request.user!.id]
    );
    const amenities = await amenityIdsBySpa(rows.map((r) => r.id));
    return rows.map((r) => toSpaSummary(r, amenities.get(r.id) ?? []));
  });

  app.get("/wishlist/ids", { preHandler: requireAuth }, async (request) => {
    const rows = await query<{ spa_id: number }>(
      "SELECT spa_id FROM wishlist_items WHERE user_id = ?",
      [request.user!.id]
    );
    return rows.map((r) => r.spa_id);
  });

  app.put("/wishlist/:spaId", { preHandler: requireAuth }, async (request) => {
    const spaId = Number((request.params as { spaId: string }).spaId);
    await execute("INSERT IGNORE INTO wishlist_items (user_id, spa_id) VALUES (?,?)", [
      request.user!.id,
      spaId,
    ]);
    return { ok: true };
  });

  app.delete("/wishlist/:spaId", { preHandler: requireAuth }, async (request) => {
    const spaId = Number((request.params as { spaId: string }).spaId);
    await execute("DELETE FROM wishlist_items WHERE user_id = ? AND spa_id = ?", [
      request.user!.id,
      spaId,
    ]);
    return { ok: true };
  });
}
