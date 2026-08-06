import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpenHours, SpaDetail, SpaPhoto, Treatment } from "@vedic/shared";
import { query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import {
  SPA_SUMMARY_SELECT,
  amenityIdsBySpa,
  toSpaSummary,
  type SpaSummaryRow,
} from "../lib/spaQueries.js";

const PAGE_SIZE = 12;

const searchSchema = z.object({
  q: z.string().optional(),
  cityId: z.coerce.number().optional(),
  countryId: z.coerce.number().optional(),
  categoryId: z.coerce.number().optional(),
  amenityIds: z.string().optional(), // comma separated
  ratingMin: z.coerce.number().min(1).max(5).optional(),
  paymentMode: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  sort: z.enum(["rating", "price_asc", "price_desc", "distance"]).optional(),
  page: z.coerce.number().int().positive().default(1),
});

export async function spaRoutes(app: FastifyInstance): Promise<void> {
  // Used by Next.js generateStaticParams to prerender spa pages.
  app.get("/spas/slugs", async () => {
    const rows = await query<{ slug: string }>(
      "SELECT slug FROM spas WHERE is_published = 1"
    );
    return rows.map((r) => r.slug);
  });

  app.get("/spas", async (request) => {
    const params = searchSchema.parse(request.query);

    const where: string[] = ["s.is_published = 1"];
    const args: unknown[] = [];

    if (params.q) {
      where.push("(s.name LIKE ? OR s.short_description LIKE ? OR s.description LIKE ?)");
      const like = `%${params.q}%`;
      args.push(like, like, like);
    }
    if (params.cityId) {
      where.push("s.city_id = ?");
      args.push(params.cityId);
    }
    if (params.countryId) {
      const cityIds = staticCache.cities
        .filter((c) => c.countryId === params.countryId)
        .map((c) => c.id);
      if (cityIds.length === 0) return { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
      where.push(`s.city_id IN (${cityIds.map(() => "?").join(",")})`);
      args.push(...cityIds);
    }
    if (params.categoryId) {
      where.push(
        "EXISTS (SELECT 1 FROM treatments tr WHERE tr.spa_id = s.id AND tr.category_id = ? AND tr.is_active = 1)"
      );
      args.push(params.categoryId);
    }
    if (params.amenityIds) {
      const ids = params.amenityIds.split(",").map(Number).filter(Boolean);
      for (const id of ids) {
        where.push("EXISTS (SELECT 1 FROM spa_amenities sa WHERE sa.spa_id = s.id AND sa.amenity_id = ?)");
        args.push(id);
      }
    }
    if (params.paymentMode) {
      const mode = staticCache.paymentModeByCode(params.paymentMode);
      if (mode) {
        where.push("s.payment_mode_id = ?");
        args.push(mode.id);
      }
    }

    let distanceSelect = "";
    if (params.lat !== undefined && params.lng !== undefined) {
      // Haversine distance in km
      distanceSelect = `, (6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.lat)) * COS(RADIANS(s.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(s.lat))))) AS distanceKm`;
      args.unshift(params.lat, params.lng, params.lat);
      if (params.radiusKm) {
        where.push(
          "(6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.lat)) * COS(RADIANS(s.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(s.lat))))) <= ?"
        );
        args.push(params.lat, params.lng, params.lat, params.radiusKm);
      }
    }

    let having = "";
    if (params.ratingMin) {
      having = "HAVING ratingAvg >= ?";
      args.push(params.ratingMin);
    }

    const orderBy =
      params.sort === "price_asc"
        ? "priceFromMinor ASC"
        : params.sort === "price_desc"
          ? "priceFromMinor DESC"
          : params.sort === "distance" && distanceSelect
            ? "distanceKm ASC"
            : "ratingAvg DESC, ratingCount DESC";

    const baseSql = `${SPA_SUMMARY_SELECT.replace(
      "t.min_price AS priceFromMinor",
      `t.min_price AS priceFromMinor${distanceSelect}`
    )} WHERE ${where.join(" AND ")} ${having}`;

    const countRows = await query<{ id: number }>(baseSql, args);
    const total = countRows.length;

    const offset = (params.page - 1) * PAGE_SIZE;
    const rows = await query<SpaSummaryRow>(
      `${baseSql} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      args
    );

    const amenities = await amenityIdsBySpa(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...toSpaSummary(r, amenities.get(r.id) ?? []),
        distanceKm: r.distanceKm !== undefined ? Number(r.distanceKm) : undefined,
      })),
      page: params.page,
      pageSize: PAGE_SIZE,
      total,
    };
  });

  app.get("/spas/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const row = await queryOne<
      SpaSummaryRow & {
        description: string;
        addressLine: string;
        postalCode: string;
        phone: string | null;
        email: string | null;
        website: string | null;
        shopifyCollectionHandle: string | null;
        depositBps: number | null;
        bookingFeeMinor: number | null;
      }
    >(
      `${SPA_SUMMARY_SELECT.replace(
        "t.min_price AS priceFromMinor",
        `t.min_price AS priceFromMinor,
         s.description, s.address_line AS addressLine, s.postal_code AS postalCode,
         s.phone, s.email, s.website, s.shopify_collection_handle AS shopifyCollectionHandle,
         s.deposit_bps AS depositBps, s.booking_fee_minor AS bookingFeeMinor`
      )} WHERE s.slug = ? AND s.is_published = 1`,
      [slug]
    );
    if (!row) return reply.code(404).send({ error: "Spa not found" });

    const [photos, treatments, hours, amenities] = await Promise.all([
      query<SpaPhoto>(
        "SELECT id, url, alt, sort_order AS sortOrder FROM spa_photos WHERE spa_id = ? ORDER BY sort_order",
        [row.id]
      ),
      query<Treatment>(
        `SELECT id, spa_id AS spaId, category_id AS categoryId, kind, name, description,
           duration_minutes AS durationMinutes, nights, price_minor AS priceMinor,
           is_active AS isActive
         FROM treatments WHERE spa_id = ? AND is_active = 1 ORDER BY kind, price_minor`,
        [row.id]
      ),
      query<OpenHours>(
        "SELECT weekday, TIME_FORMAT(open_time, '%H:%i') AS openTime, TIME_FORMAT(close_time, '%H:%i') AS closeTime FROM spa_open_hours WHERE spa_id = ? ORDER BY weekday",
        [row.id]
      ),
      amenityIdsBySpa([row.id]),
    ]);

    const detail: SpaDetail = {
      ...toSpaSummary(row, amenities.get(row.id) ?? []),
      description: row.description,
      addressLine: row.addressLine,
      postalCode: row.postalCode,
      phone: row.phone,
      email: row.email,
      website: row.website,
      shopifyCollectionHandle: row.shopifyCollectionHandle,
      depositBps: row.depositBps === null ? null : Number(row.depositBps),
      bookingFeeMinor: row.bookingFeeMinor === null ? null : Number(row.bookingFeeMinor),
      photos,
      treatments: treatments.map((t) => ({ ...t, isActive: Boolean(t.isActive) })),
      openHours: hours,
    };
    return detail;
  });
}
