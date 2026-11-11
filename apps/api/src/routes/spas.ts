import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FeaturedSpaSummary, OpenHours, SpaDetail, Treatment } from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";
import { staticCache } from "../cache/staticCache.js";
import {
  SPA_SUMMARY_SELECT,
  amenityIdsBySpa,
  categoryTagsBySpa,
  toSpaSummary,
  treatmentNamesBySpa,
  type SpaSummaryRow,
} from "../lib/spaQueries.js";
import { publicPayloadHasNotes, withFeaturedFirst } from "../lib/featuredSpas.js";
import { publicPhotoUrl } from "../lib/uploads.js";
import { loadSpaStay } from "../lib/spaStay.js";
import { loadProgramRuns, weekdaysFromMask } from "../lib/treatmentSchedule.js";
import { loadTreatmentConditions } from "../lib/treatmentConditions.js";

const PAGE_SIZE = 12;

async function mapPublicTreatments(
  rows: Array<
    Omit<Treatment, "categoryName" | "retreatWeekdays" | "medicalConditions"> & {
      retreatWeekdays: number | null;
    }
  >
): Promise<Treatment[]> {
  const programIds = rows.filter((t) => t.kind === "program").map((t) => t.id);
  const upcoming =
    programIds.length === 0
      ? new Map()
      : await loadProgramRuns(programIds, { upcomingOnly: true });
  const medicalConditions = await loadTreatmentConditions(rows.map((t) => t.id));
  return rows
    .filter((t) => t.kind !== "program" || (upcoming.get(t.id)?.length ?? 0) > 0)
    .map((t) => ({
      ...t,
      durationDays: t.durationDays == null ? null : Number(t.durationDays),
      retreatWeekdays: weekdaysFromMask(t.retreatWeekdays),
      retreatCapacity: t.retreatCapacity == null ? null : Number(t.retreatCapacity),
      isActive: Boolean(t.isActive),
      categoryName: staticCache.treatmentCategoryName(t.categoryId),
      medicalConditions: medicalConditions.get(t.id) ?? [],
    }));
}

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
        "s.city_name LIKE ?",
        "s.state LIKE ?",
        `EXISTS (
           SELECT 1 FROM treatments tr
           WHERE tr.spa_id = s.id AND tr.is_active = 1 AND tr.name LIKE ?
         )`,
        `EXISTS (
           SELECT 1 FROM treatments tr
           JOIN treatment_medical_conditions tmc ON tmc.treatment_id = tr.id
           JOIN medical_conditions mc ON mc.id = tmc.medical_condition_id
           WHERE tr.spa_id = s.id AND tr.is_active = 1 AND mc.name LIKE ?
         )`,
      ];
      args.push(qLike, qLike, qLike, qLike, qLike, qLike);

      if (matchingCityIds.length > 0) {
        clauses.push(`s.city_id IN (${matchingCityIds.map(() => "?").join(",")})`);
        args.push(...matchingCityIds);
      }
      const matchingCountryIds = staticCache.countries
        .filter((c) => c.name.toLowerCase().includes(qLower))
        .map((c) => c.id);
      if (matchingCountryIds.length > 0) {
        clauses.push(`s.country_id IN (${matchingCountryIds.map(() => "?").join(",")})`);
        args.push(...matchingCountryIds);
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
      const city = staticCache.city(params.cityId);
      if (city) {
        where.push("(s.city_id = ? OR (s.city_name = ? AND (s.country_id = ? OR s.country_id IS NULL)))");
        args.push(params.cityId, city.name, city.countryId);
      } else {
        where.push("s.city_id = ?");
        args.push(params.cityId);
      }
    }
    if (params.countryId) {
      where.push("s.country_id = ?");
      args.push(params.countryId);
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
      where.push("s.lat IS NOT NULL AND s.lng IS NOT NULL");
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
      `t.min_price AS priceFromMinor${distanceSelect}, (fs.spa_id IS NOT NULL) AS featured`
    )} LEFT JOIN featured_spas fs ON fs.spa_id = s.id WHERE ${where.join(" AND ")} ${having}`;

    const countRows = await query<{ id: number }>(baseSql, args);
    const total = countRows.length;

    const offset = (params.page - 1) * PAGE_SIZE;
    const rows = await query<SpaSummaryRow>(
      `${baseSql} ORDER BY ${withFeaturedFirst(orderBy)} LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
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

  app.get("/spas/featured", async () => {
    const rows = await query<SpaSummaryRow>(
      `${SPA_SUMMARY_SELECT}
       INNER JOIN featured_spas fs ON fs.spa_id = s.id
       WHERE s.is_published = 1
       ORDER BY fs.display_order ASC, s.id ASC`
    );
    const spaIds = rows.map((row) => row.id);
    const [amenities, tags, treatmentNames] = await Promise.all([
      amenityIdsBySpa(spaIds),
      categoryTagsBySpa(spaIds, Number.POSITIVE_INFINITY),
      treatmentNamesBySpa(spaIds),
    ]);
    const items: FeaturedSpaSummary[] = rows.map((row) => ({
      ...toSpaSummary(row, amenities.get(row.id) ?? []),
      featured: true,
      tags: tags.get(row.id) ?? [],
      treatmentNames: treatmentNames.get(row.id) ?? [],
    }));
    const payload = { items };
    if (publicPayloadHasNotes(payload)) {
      throw Object.assign(new Error("Internal notes leaked into a public payload"), { statusCode: 500 });
    }
    return payload;
  });

  app.get("/spas/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };

    const row = await queryOne<
      SpaSummaryRow & {
        vendorId: number | null;
        description: string;
        phone: string | null;
        email: string | null;
        website: string | null;
        offersOnlineConsultation: number;
        onlineConsultationUrl: string | null;
        shopifyCollectionHandle: string | null;
        depositBps: number | null;
        bookingFeeMinor: number | null;
      }
    >(
      `${SPA_SUMMARY_SELECT.replace(
        "t.min_price AS priceFromMinor",
        `t.min_price AS priceFromMinor,
         s.vendor_id AS vendorId,
         s.description,
         s.phone, s.email, s.website,
         s.offers_online_consultation AS offersOnlineConsultation,
         s.online_consultation_url AS onlineConsultationUrl,
         s.shopify_collection_handle AS shopifyCollectionHandle,
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
      query<
        Omit<Treatment, "categoryName" | "retreatWeekdays"> & {
          retreatWeekdays: number | null;
        }
      >(
        `SELECT id, spa_id AS spaId, category_id AS categoryId, kind, name, description,
           duration_minutes AS durationMinutes, duration_days AS durationDays,
           retreat_weekdays AS retreatWeekdays, retreat_capacity AS retreatCapacity,
           price_minor AS priceMinor, is_active AS isActive
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

    const vendorId = row.vendorId == null ? null : Number(row.vendorId);
    const detail: SpaDetail = {
      ...toSpaSummary(row, amenities.get(row.id) ?? []),
      vendorId,
      isUnclaimed: vendorId == null,
      description: row.description,
      phone: row.phone,
      email: row.email,
      website: row.website,
      offersOnlineConsultation: Boolean(row.offersOnlineConsultation),
      onlineConsultationUrl: row.offersOnlineConsultation ? row.onlineConsultationUrl : null,
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
      treatments: await mapPublicTreatments(treatments),
      openHours: hours,
      ...stay,
    };
    reply.header("Cache-Control", "private, no-store");
    return detail;
  });

  app.post("/spas/:slug/consultation-contact", async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    const { slug } = request.params as { slug: string };
    const body = z
      .object({
        openId: z
          .string()
          .regex(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
            "Invalid open id"
          ),
      })
      .parse(request.body);

    const spa = await queryOne<{
      id: number;
      name: string;
      vendor_id: number | null;
      offers_online_consultation: number;
      phone: string | null;
      email: string | null;
      online_consultation_url: string | null;
    }>(
      `SELECT id, name, vendor_id, offers_online_consultation, phone, email, online_consultation_url
       FROM spas WHERE slug = ? AND is_published = 1`,
      [slug]
    );
    if (!spa || spa.vendor_id == null || !spa.offers_online_consultation) {
      return reply.code(404).send({ error: "Online consultation is not available for this clinic" });
    }

    await execute(
      `INSERT IGNORE INTO online_consultation_views (spa_id, user_id, open_id) VALUES (?,?,?)`,
      [spa.id, request.user!.id, body.openId]
    );

    const bookingUrl = httpUrlOrNull(spa.online_consultation_url);
    return {
      clinicName: spa.name,
      phone: spa.phone?.trim() || null,
      email: spa.email?.trim() || null,
      bookingUrl,
    };
  });
}

function httpUrlOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return trimmed;
  } catch {
    return null;
  }
}
