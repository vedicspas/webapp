import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { requireAuth } from "../plugins/auth.js";
import { assertCanModerate } from "../lib/reviewValidation.js";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.user!.role !== "admin") {
    reply.code(403).send({ error: "Admin access required" });
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

  // ---- Platform overview ----

  app.get("/admin/stats", async () => {
    const [row] = await query<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*) FROM users) AS users,
        (SELECT COUNT(*) FROM vendors WHERE status = 'pending') AS vendorsPending,
        (SELECT COUNT(*) FROM vendors WHERE status = 'approved') AS vendorsApproved,
        (SELECT COUNT(*) FROM vendors WHERE status = 'suspended') AS vendorsSuspended,
        (SELECT COUNT(*) FROM spas WHERE is_published = 1) AS spasPublished,
        (SELECT COUNT(*) FROM spas) AS spasTotal,
        (SELECT COUNT(*) FROM bookings) AS bookings,
        (SELECT COALESCE(SUM(total_minor), 0) FROM bookings
          WHERE status_id NOT IN (
            SELECT id FROM booking_statuses WHERE code IN ('cancelled','no_show')
          )) AS grossBookingMinor,
        (SELECT COALESCE(SUM(platform_fee_minor), 0) FROM bookings WHERE paid_minor > 0) AS platformFeesMinor,
        (SELECT COUNT(*) FROM reviews) AS reviews
    `);
    return row;
  });

  // ---- Vendor approvals ----

  app.get("/admin/vendors", async () => {
    return query(
      `SELECT v.id, v.business_name AS businessName, v.status,
         v.stripe_onboarded AS stripeOnboarded, v.created_at AS createdAt,
         u.name AS ownerName, u.email AS ownerEmail,
         (SELECT COUNT(*) FROM spas s WHERE s.vendor_id = v.id) AS spaCount,
         (SELECT COUNT(*) FROM spas s WHERE s.vendor_id = v.id AND s.is_published = 1) AS publishedCount
       FROM vendors v JOIN users u ON u.id = v.user_id
       ORDER BY FIELD(v.status, 'pending', 'approved', 'suspended'), v.created_at DESC`
    );
  });

  app.patch("/admin/vendors/:id/status", async (request, reply) => {
    const vendorId = Number((request.params as { id: string }).id);
    const body = z
      .object({ status: z.enum(["pending", "approved", "suspended"]) })
      .parse(request.body);

    const vendor = await queryOne("SELECT id FROM vendors WHERE id = ?", [vendorId]);
    if (!vendor) return reply.code(404).send({ error: "Vendor not found" });

    await execute("UPDATE vendors SET status = ? WHERE id = ?", [body.status, vendorId]);
    if (body.status !== "approved") {
      // Take a non-approved vendor's listings off the marketplace immediately.
      await execute("UPDATE spas SET is_published = 0 WHERE vendor_id = ?", [vendorId]);
    }
    return { ok: true };
  });

  // ---- Listing moderation ----

  app.get("/admin/spas", async () => {
    const rows = await query<{
      id: number;
      slug: string;
      name: string;
      city_id: number;
      is_published: number;
      vendor_id: number;
      business_name: string;
      vendor_status: string;
    }>(
      `SELECT s.id, s.slug, s.name, s.city_id, s.is_published,
         v.id AS vendor_id, v.business_name, v.status AS vendor_status
       FROM spas s JOIN vendors v ON v.id = s.vendor_id
       ORDER BY s.created_at DESC`
    );
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      cityName: staticCache.city(r.city_id)?.name ?? "",
      isPublished: Boolean(r.is_published),
      vendorId: r.vendor_id,
      vendorName: r.business_name,
      vendorStatus: r.vendor_status,
    }));
  });

  app.patch("/admin/spas/:id", async (request, reply) => {
    const spaId = Number((request.params as { id: string }).id);
    const body = z.object({ isPublished: z.boolean() }).parse(request.body);

    if (body.isPublished) {
      const spa = await queryOne<{ status: string }>(
        "SELECT v.status FROM spas s JOIN vendors v ON v.id = s.vendor_id WHERE s.id = ?",
        [spaId]
      );
      if (!spa) return reply.code(404).send({ error: "Spa not found" });
      if (spa.status !== "approved") {
        return reply.code(409).send({ error: "Vendor is not approved" });
      }
    }
    const result = await execute("UPDATE spas SET is_published = ? WHERE id = ?", [
      body.isPublished ? 1 : 0,
      spaId,
    ]);
    if (result.affectedRows === 0) return reply.code(404).send({ error: "Spa not found" });
    return { ok: true };
  });

  // ---- Review moderation ----

  app.get("/admin/reviews", async () => {
    return query(
      `SELECT rv.id, rv.rating, rv.title, rv.body, rv.status, rv.created_at AS createdAt,
         rv.moderated_at AS moderatedAt, rv.moderation_reason AS moderationReason,
         u.name AS authorName, u.email AS authorEmail, s.name AS spaName, s.slug AS spaSlug
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       JOIN spas s ON s.id = rv.spa_id
       ORDER BY rv.created_at DESC LIMIT 100`
    );
  });

  app.patch("/admin/reviews/:id", async (request, reply) => {
    try {
      assertCanModerate(request.user);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 403;
      return reply.code(status).send({ error: err instanceof Error ? err.message : "Forbidden" });
    }
    const reviewId = Number((request.params as { id: string }).id);
    const body = z
      .object({
        status: z.enum(["published", "hidden"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(request.body);

    const current = await queryOne<{ status: "published" | "hidden" }>(
      "SELECT status FROM reviews WHERE id = ?",
      [reviewId]
    );
    if (!current) return reply.code(404).send({ error: "Review not found" });

    await execute(
      `UPDATE reviews SET status = ?, moderated_at = UTC_TIMESTAMP(), moderated_by = ?, moderation_reason = ?
       WHERE id = ?`,
      [body.status, request.user!.id, body.reason ?? null, reviewId]
    );
    await execute(
      `INSERT INTO review_moderation_events (review_id, admin_user_id, from_status, to_status, reason)
       VALUES (?,?,?,?,?)`,
      [reviewId, request.user!.id, current.status, body.status, body.reason ?? null]
    );
    return { ok: true };
  });

  app.delete("/admin/reviews/:id", async (request, reply) => {
    const reviewId = Number((request.params as { id: string }).id);
    const result = await execute("DELETE FROM reviews WHERE id = ?", [reviewId]);
    if (result.affectedRows === 0) return reply.code(404).send({ error: "Review not found" });
    return { ok: true };
  });

  // ---- Recent bookings ----

  app.get("/admin/bookings", async () => {
    return query(
      `SELECT b.id, b.code, b.starts_at AS startsAt, b.party_size AS partySize,
         b.total_minor AS totalMinor, b.paid_minor AS paidMinor,
         b.platform_fee_minor AS platformFeeMinor,
         bs.code AS statusCode, pm.code AS paymentModeCode,
         s.name AS spaName, t.name AS treatmentName, u.name AS guestName
       FROM bookings b
       JOIN booking_statuses bs ON bs.id = b.status_id
       JOIN payment_modes pm ON pm.id = b.payment_mode_id
       JOIN spas s ON s.id = b.spa_id
       JOIN treatments t ON t.id = b.treatment_id
       JOIN users u ON u.id = b.user_id
       ORDER BY b.created_at DESC LIMIT 100`
    );
  });
}
