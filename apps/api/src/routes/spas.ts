import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { OpenHours, SpaDetail, Treatment } from "@vedic/shared";
import { query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import {
  SPA_SUMMARY_SELECT,
  amenityIdsBySpa,
  toSpaSummary,
  type SpaSummaryRow,
} from "../lib/spaQueries.js";
import { publicPhotoUrl } from "../lib/uploads.js";
import { loadSpaStay } from "../lib/spaStay.js";

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
    const orderArgs: unknown[] = [];
    let qLike: string | undefined;
    let qPrefixLike: string | undefined;
    let matchingCityIds: number[] = [];
    let matchingCategoryIds: number[] = [];

    if (params.q) {
      const needle = params.q.trim();
      const escaped = needle.replace(/([%_\\])/g, "\\$1");
      qLike = `%${escaped}%`;
      qPrefixLike = `${escaped}%`;
      const qLower = needle.toLowerCase();
      matchingCityIds = [
        ...new Set(
          staticCache.cities
            .filter((c) => {
              if (c.name.toLowerCase().includes(qLower)) return true;
              const country = staticCache.country(c.countryId);
              return Boolean(country?.name.toLowerCase().includes(qLower));
            })
            .map((c) => c.id)
        ),
      ];
      matchingCategoryIds = staticCache.treatmentCategories
        .filter(
          (c) => c.name.toLowerCase().includes(qLower) || c.slug.toLowerCase().includes(qLower)
        )
        .map((c) => c.id);

      // Match only fields the user can see/search: name, city/country, address, treatment.
      // Do not search long descriptions — "Veda" must not hit "Ayurveda" in body copy.
      const clauses = [
        "s.name LIKE ?",
        "s.address_line LIKE ?",
        `EXISTS (
           SELECT 1 FROM treatments tr
           WHERE tr.spa_id = s.id AND tr.is_active = 1 AND tr.name LIKE ?
         )`,
      ];
      args.push(qLike, qLike, qLike);

      if (matchingCityIds.length > 0) {
        clauses.push(`s.city_id IN (${matchingCityIds.map(() => "?").join(",")})`);
        args.push(...matchingCityIds);
      }
      if (matchingCategoryIds.length > 0) {
        clauses.push(
          `EXISTS (
             SELECT 1 FROM treatments tr
             WHERE tr.spa_id = s.id AND tr.is_active = 1 AND tr.category_id IN (${matchingCategoryIds.map(() => "?").join(",")})
           )`
        );
        args.push(...matchingCategoryIds);
      }

      where.push(`(${clauses.join(" OR ")})`);
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

    const sortTiebreaker =
      params.sort === "price_asc"
        ? "priceFromMinor ASC"
        : params.sort === "price_desc"
          ? "priceFromMinor DESC"
          : params.sort === "distance" && distanceSelect
            ? "distanceKm ASC"
            : "ratingAvg DESC, ratingCount DESC";

    let orderBy = sortTiebreaker;
    if (params.q && qLike && qPrefixLike) {
      const rankWhen: string[] = ["WHEN s.name LIKE ? THEN 0", "WHEN s.name LIKE ? THEN 1"];
      orderArgs.push(qPrefixLike, qLike);
      if (matchingCityIds.length > 0) {
        rankWhen.push(
          `WHEN s.city_id IN (${matchingCityIds.map(() => "?").join(",")}) THEN 2`
        );
        orderArgs.push(...matchingCityIds);
      }
      rankWhen.push("WHEN s.address_line LIKE ? THEN 2");
      orderArgs.push(qLike);
      rankWhen.push(`WHEN EXISTS (
        SELECT 1 FROM treatments tr
        WHERE tr.spa_id = s.id AND tr.is_active = 1 AND tr.name LIKE ?
      ) THEN 3`);
      orderArgs.push(qLike);
      if (matchingCategoryIds.length > 0) {
        rankWhen.push(`WHEN EXISTS (
          SELECT 1 FROM treatments tr
          WHERE tr.spa_id = s.id AND tr.is_active = 1 AND tr.category_id IN (${matchingCategoryIds.map(() => "?").join(",")})
        ) THEN 3`);
        orderArgs.push(...matchingCategoryIds);
      }
      orderBy = `CASE ${rankWhen.join(" ")} ELSE 4 END ASC, ${sortTiebreaker}`;
    }

    const baseSql = `${SPA_SUMMARY_SELECT.replace(
      "t.min_price AS priceFromMinor",
      `t.min_price AS priceFromMinor${distanceSelect}`
    )} WHERE ${where.join(" AND ")} ${having}`;

    const countRows = await query<{ id: number }>(baseSql, args);
    const total = countRows.length;

    const offset = (params.page - 1) * PAGE_SIZE;
    const rows = await query<SpaSummaryRow>(
      `${baseSql} ORDER BY ${orderBy} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      [...args, ...orderArgs]
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

    const [photos, treatments, hours, amenities, stay] = await Promise.all([
      query<{ id: number; url: string; alt: string; sortOrder: number }>(
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
      loadSpaStay(row.id),
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
      photos: photos.map((p) => ({
        id: p.id,
        url: publicPhotoUrl(p.url) ?? p.url,
        title: p.alt,
        alt: p.alt,
        sortOrder: p.sortOrder,
      })),
      treatments: treatments.map((t) => ({ ...t, isActive: Boolean(t.isActive) })),
      openHours: hours,
      ...stay,
    };
    reply.header("Cache-Control", "private, no-store");
    return detail;
  });
}
