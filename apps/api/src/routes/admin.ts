import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { requireAuth } from "../plugins/auth.js";
import { assertCanModerate } from "../lib/reviewValidation.js";

async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === "OPTIONS") return;
  await requireAuth(request, reply);
  if (reply.sent) return;
  if (request.user!.role !== "admin") {
    reply.code(403).send({ error: "Admin access required" });
  }
}

const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

function pagination(query: unknown) {
  const raw = z
    .object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
    })
    .parse(query);
  const page = Math.max(1, Number(raw.page ?? "1") || 1);
  const parsedSize = Number(raw.pageSize ?? "10") || 10;
  const pageSize = PAGE_SIZES.includes(parsedSize as (typeof PAGE_SIZES)[number])
    ? parsedSize
    : 10;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function csvIds(raw?: string): number[] {
  return (raw ?? "")
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

const clinicFilters = z.object({
  clinicName: z.string().max(160).optional(),
  clinicId: z.string().max(12).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryIds: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

function allCategories() {
  return staticCache.treatmentCategories.map((c) => ({ id: c.id, name: c.name }));
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAdmin);

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

  app.get("/admin/vendors", async (request) => {
    const q = z
      .object({
        name: z.string().max(160).optional(),
        email: z.string().max(160).optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.string().optional(),
        pageSize: z.string().optional(),
      })
      .parse(request.query);
    const { page, pageSize, offset } = pagination(q);
    const where = ["1=1"];
    const values: unknown[] = [];
    if (q.name?.trim()) {
      where.push("(v.business_name LIKE ? OR u.name LIKE ?)");
      values.push(`%${q.name.trim()}%`, `%${q.name.trim()}%`);
    }
    if (q.email?.trim()) {
      where.push("u.email LIKE ?");
      values.push(`%${q.email.trim()}%`);
    }
    if (q.from) {
      where.push("DATE(v.created_at) >= ?");
      values.push(q.from);
    }
    if (q.to) {
      where.push("DATE(v.created_at) <= ?");
      values.push(q.to);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM vendors v JOIN users u ON u.id = v.user_id WHERE ${whereSql}`,
      values
    );
    const items = await query(
      `SELECT v.id, v.business_name AS businessName, v.status,
         v.stripe_onboarded AS stripeOnboarded, v.created_at AS createdAt,
         u.name AS ownerName, u.email AS ownerEmail,
         (SELECT COUNT(*) FROM spas s WHERE s.vendor_id = v.id) AS spaCount,
         (SELECT COUNT(*) FROM spas s WHERE s.vendor_id = v.id AND s.is_published = 1) AS publishedCount
       FROM vendors v JOIN users u ON u.id = v.user_id
       WHERE ${whereSql}
       ORDER BY FIELD(v.status, 'pending', 'approved', 'suspended'), v.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );
    return { items, page, pageSize, total: Number(totalRow?.n ?? 0) };
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
      await execute("UPDATE spas SET is_published = 0 WHERE vendor_id = ?", [vendorId]);
    }
    return { ok: true };
  });

  app.get("/admin/spas", async (request) => {
    const q = clinicFilters.parse(request.query);
    const { page, pageSize, offset } = pagination(q);
    const categoryIds = csvIds(q.categoryIds);
    const where = ["1=1"];
    const values: unknown[] = [];
    if (q.clinicName?.trim()) {
      where.push("s.name LIKE ?");
      values.push(`%${q.clinicName.trim()}%`);
    }
    if (q.clinicId?.trim()) {
      where.push("s.clinic_code LIKE ?");
      values.push(`%${q.clinicId.trim().toUpperCase()}%`);
    }
    if (q.from) {
      where.push("DATE(s.created_at) >= ?");
      values.push(q.from);
    }
    if (q.to) {
      where.push("DATE(s.created_at) <= ?");
      values.push(q.to);
    }
    if (categoryIds.length) {
      where.push(
        `s.id IN (SELECT spa_id FROM treatments WHERE category_id IN (${categoryIds.map(() => "?").join(",")}))`
      );
      values.push(...categoryIds);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM spas s JOIN vendors v ON v.id = s.vendor_id WHERE ${whereSql}`,
      values
    );
    const rows = await query<{
      id: number;
      slug: string;
      name: string;
      clinic_code: string;
      city_id: number;
      is_published: number;
      vendor_id: number;
      business_name: string;
      vendor_status: string;
    }>(
      `SELECT s.id, s.slug, s.name, s.clinic_code, s.city_id, s.is_published,
         v.id AS vendor_id, v.business_name, v.status AS vendor_status
       FROM spas s JOIN vendors v ON v.id = s.vendor_id
       WHERE ${whereSql}
       ORDER BY s.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );
    return {
      items: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        name: r.name,
        clinicCode: r.clinic_code,
        cityName: staticCache.city(r.city_id)?.name ?? "",
        isPublished: Boolean(r.is_published),
        vendorId: r.vendor_id,
        vendorName: r.business_name,
        vendorStatus: r.vendor_status,
      })),
      categories: allCategories(),
      page,
      pageSize,
      total: Number(totalRow?.n ?? 0),
    };
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

  app.get("/admin/reviews", async (request) => {
    const q = clinicFilters.parse(request.query);
    const { page, pageSize, offset } = pagination(q);
    const categoryIds = csvIds(q.categoryIds);
    const where = ["1=1"];
    const values: unknown[] = [];
    if (q.clinicName?.trim()) {
      where.push("s.name LIKE ?");
      values.push(`%${q.clinicName.trim()}%`);
    }
    if (q.clinicId?.trim()) {
      where.push("s.clinic_code LIKE ?");
      values.push(`%${q.clinicId.trim().toUpperCase()}%`);
    }
    if (q.from) {
      where.push("DATE(rv.created_at) >= ?");
      values.push(q.from);
    }
    if (q.to) {
      where.push("DATE(rv.created_at) <= ?");
      values.push(q.to);
    }
    if (categoryIds.length) {
      where.push(
        `s.id IN (SELECT spa_id FROM treatments WHERE category_id IN (${categoryIds.map(() => "?").join(",")}))`
      );
      values.push(...categoryIds);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n
       FROM reviews rv JOIN users u ON u.id = rv.user_id JOIN spas s ON s.id = rv.spa_id
       WHERE ${whereSql}`,
      values
    );
    const items = await query(
      `SELECT rv.id, rv.rating, rv.title, rv.body, rv.status, rv.created_at AS createdAt,
         rv.moderated_at AS moderatedAt, rv.moderation_reason AS moderationReason,
         u.name AS authorName, u.email AS authorEmail,
         s.name AS spaName, s.slug AS spaSlug, s.clinic_code AS clinicCode
       FROM reviews rv
       JOIN users u ON u.id = rv.user_id
       JOIN spas s ON s.id = rv.spa_id
       WHERE ${whereSql}
       ORDER BY rv.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );
    return {
      items,
      categories: allCategories(),
      page,
      pageSize,
      total: Number(totalRow?.n ?? 0),
    };
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

  app.get("/admin/bookings", async (request) => {
    const q = clinicFilters.parse(request.query);
    const { page, pageSize, offset } = pagination(q);
    const categoryIds = csvIds(q.categoryIds);
    const where = ["1=1"];
    const values: unknown[] = [];
    if (q.clinicName?.trim()) {
      where.push("s.name LIKE ?");
      values.push(`%${q.clinicName.trim()}%`);
    }
    if (q.clinicId?.trim()) {
      where.push("s.clinic_code LIKE ?");
      values.push(`%${q.clinicId.trim().toUpperCase()}%`);
    }
    if (q.from) {
      where.push("DATE(b.starts_at) >= ?");
      values.push(q.from);
    }
    if (q.to) {
      where.push("DATE(b.starts_at) <= ?");
      values.push(q.to);
    }
    if (categoryIds.length) {
      where.push(`t.category_id IN (${categoryIds.map(() => "?").join(",")})`);
      values.push(...categoryIds);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n
       FROM bookings b
       JOIN spas s ON s.id = b.spa_id
       JOIN treatments t ON t.id = b.treatment_id
       JOIN users u ON u.id = b.user_id
       WHERE ${whereSql}`,
      values
    );
    const items = await query<{
      id: number;
      code: string;
      startsAt: string;
      createdAt: string;
      partySize: number;
      totalMinor: number;
      paidMinor: number;
      platformFeeMinor: number;
      statusCode: string;
      paymentModeCode: string;
      spaName: string;
      clinicCode: string;
      treatmentName: string;
      treatmentCategoryId: number;
      guestName: string;
    }>(
      `SELECT b.id, b.code, b.starts_at AS startsAt, b.created_at AS createdAt, b.party_size AS partySize,
         b.total_minor AS totalMinor, b.paid_minor AS paidMinor,
         b.platform_fee_minor AS platformFeeMinor,
         bs.code AS statusCode, pm.code AS paymentModeCode,
         s.name AS spaName, s.clinic_code AS clinicCode, t.name AS treatmentName,
         t.category_id AS treatmentCategoryId, u.name AS guestName
       FROM bookings b
       JOIN booking_statuses bs ON bs.id = b.status_id
       JOIN payment_modes pm ON pm.id = b.payment_mode_id
       JOIN spas s ON s.id = b.spa_id
       JOIN treatments t ON t.id = b.treatment_id
       JOIN users u ON u.id = b.user_id
       WHERE ${whereSql}
       ORDER BY b.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );
    return {
      items: items.map((r) => ({
        ...r,
        treatmentCategoryName: staticCache.treatmentCategoryName(r.treatmentCategoryId),
      })),
      categories: allCategories(),
      page,
      pageSize,
      total: Number(totalRow?.n ?? 0),
    };
  });
}
