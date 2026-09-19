import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { requireAuth } from "../plugins/auth.js";
import { stripe } from "../lib/stripe.js";
import { config } from "../config.js";
import { deleteLocalPhoto, publicPhotoUrl, saveSpaPhotoFile } from "../lib/uploads.js";
import { toBooking } from "./bookings.js";
import { toReview } from "./reviews.js";
import { issueSessionForUserId } from "./auth.js";
import { ensureVendorAccount } from "../lib/vendorAccount.js";
import { loadSpaStay, saveSpaStay } from "../lib/spaStay.js";
import { allocateClinicCode, parseBookingRefInput } from "../lib/bookingRefs.js";

function multipartField(file: { fields?: Record<string, unknown> }, names: string[]): string {
  for (const name of names) {
    const raw = file.fields?.[name];
    if (!raw) continue;
    const one = Array.isArray(raw) ? raw[0] : raw;
    if (one && typeof one === "object" && "value" in one) {
      return String((one as { value?: unknown }).value ?? "");
    }
  }
  return "";
}

interface VendorRow {
  id: number;
  user_id: number;
  business_name: string;
  status: "pending" | "approved" | "suspended";
  stripe_account_id: string | null;
  stripe_onboarded: number;
}

async function vendorFor(request: FastifyRequest): Promise<VendorRow | null> {
  return queryOne<VendorRow>(
    "SELECT id, user_id, business_name, status, stripe_account_id, stripe_onboarded FROM vendors WHERE user_id = ?",
    [request.user!.id]
  );
}

async function requireVendor(request: FastifyRequest, reply: FastifyReply): Promise<VendorRow | null> {
  const vendor = await vendorFor(request);
  if (!vendor) {
    reply.code(403).send({ error: "Vendor account required" });
    return null;
  }
  return vendor;
}

async function assertSpaOwnership(
  spaId: number,
  vendorId: number,
  reply: FastifyReply
): Promise<boolean> {
  const spa = await queryOne("SELECT id FROM spas WHERE id = ? AND vendor_id = ?", [spaId, vendorId]);
  if (!spa) {
    reply.code(404).send({ error: "Spa not found" });
    return false;
  }
  return true;
}

const spaBodySchema = z.object({
  name: z.string().min(3).max(160),
  shortDescription: z.string().max(300).default(""),
  description: z.string().default(""),
  addressLine: z.string().max(255).default(""),
  postalCode: z.string().max(20).default(""),
  cityId: z.number(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: z.string().max(32).nullable().default(null),
  email: z.string().email().nullable().default(null),
  website: z.string().url().nullable().default(null),
  shopifyCollectionHandle: z.string().max(160).nullable().default(null),
  paymentModeCode: z.enum(["full_prepay", "deposit", "booking_fee", "pay_at_spa"]),
  depositBps: z.number().int().min(500).max(10000).nullable().default(null),
  bookingFeeMinor: z.number().int().min(100).nullable().default(null),
  currencyCode: z.string().length(3).default("USD"),
  isPublished: z.boolean().default(false),
  languages: z.array(z.string().max(80)).optional().default([]),
  dietaryOptions: z.array(z.string().max(80)).optional().default([]),
  airportPickup: z.enum(["on_request", "not_available"]).nullable().optional().default(null),
  accommodationTypeId: z.number().int().nullable().optional().default(null),
  accessibility: z.string().max(2000).nullable().optional().default(null),
  familyAccommodation: z.enum(["on_request", "not_available"]).nullable().optional().default(null),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);

  // ---- Vendor account ----

  app.post("/vendor/register", async (request, reply) => {
    const body = z.object({ businessName: z.string().min(2).max(160) }).parse(request.body);
    const existing = await vendorFor(request);
    if (existing) return reply.code(409).send({ error: "Already a vendor" });

    await ensureVendorAccount(request.user!.id, body.businessName);
    return reply.code(201).send(await issueSessionForUserId(request.user!.id));
  });

  app.get("/vendor/me", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;

    const spas = await query<{
      id: number;
      slug: string;
      name: string;
      city_id: number;
      payment_mode_id: number;
      is_published: number;
      clinic_code: string;
    }>(
      "SELECT id, slug, name, city_id, payment_mode_id, is_published, clinic_code FROM spas WHERE vendor_id = ? ORDER BY name",
      [vendor.id]
    );

    const cancelled = staticCache.bookingStatusByCode("cancelled")?.id;
    const noShow = staticCache.bookingStatusByCode("no_show")?.id;
    const skipStatus = [cancelled, noShow].filter((id): id is number => typeof id === "number");
    const counts = spas.length
      ? await query<{ spa_id: number; todayCount: number; weekCount: number }>(
          `SELECT b.spa_id,
             SUM(CASE WHEN DATE(b.starts_at) = UTC_DATE() THEN 1 ELSE 0 END) AS todayCount,
             SUM(CASE WHEN DATE(b.starts_at) >= DATE_SUB(UTC_DATE(), INTERVAL WEEKDAY(UTC_DATE()) DAY)
                       AND DATE(b.starts_at) < DATE_ADD(DATE_SUB(UTC_DATE(), INTERVAL WEEKDAY(UTC_DATE()) DAY), INTERVAL 7 DAY)
                  THEN 1 ELSE 0 END) AS weekCount
           FROM bookings b
           WHERE b.spa_id IN (${spas.map(() => "?").join(",")})
             ${skipStatus.length ? `AND b.status_id NOT IN (${skipStatus.map(() => "?").join(",")})` : ""}
           GROUP BY b.spa_id`,
          [...spas.map((s) => s.id), ...skipStatus]
        )
      : [];
    const countBySpa = new Map(counts.map((c) => [c.spa_id, c]));

    return {
      id: vendor.id,
      businessName: vendor.business_name,
      status: vendor.status,
      stripeOnboarded: Boolean(vendor.stripe_onboarded),
      hasStripeAccount: Boolean(vendor.stripe_account_id),
      spas: spas.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        clinicCode: s.clinic_code,
        cityName: staticCache.city(s.city_id)?.name ?? "",
        paymentModeCode: staticCache.paymentMode(s.payment_mode_id)?.code,
        isPublished: Boolean(s.is_published),
        bookingsToday: Number(countBySpa.get(s.id)?.todayCount ?? 0),
        bookingsThisWeek: Number(countBySpa.get(s.id)?.weekCount ?? 0),
      })),
    };
  });

  // ---- Stripe Connect Express onboarding ----

  app.post("/vendor/stripe/onboard", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    if (!stripe) return reply.code(503).send({ error: "Stripe is not configured on this server" });

    let accountId = vendor.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: request.user!.email,
        business_profile: { name: vendor.business_name },
        capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
      });
      accountId = account.id;
      await execute("UPDATE vendors SET stripe_account_id = ? WHERE id = ?", [accountId, vendor.id]);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${config.webOrigin}/vendor?stripe=refresh`,
      return_url: `${config.webOrigin}/vendor?stripe=return`,
      type: "account_onboarding",
    });
    return { url: link.url };
  });

  app.get("/vendor/stripe/status", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    if (!stripe || !vendor.stripe_account_id) {
      return { onboarded: Boolean(vendor.stripe_onboarded) };
    }
    const account = await stripe.accounts.retrieve(vendor.stripe_account_id);
    const onboarded = Boolean(account.charges_enabled && account.payouts_enabled);
    await execute("UPDATE vendors SET stripe_onboarded = ? WHERE id = ?", [
      onboarded ? 1 : 0,
      vendor.id,
    ]);
    return { onboarded };
  });

  // ---- Spa listings ----

  app.post("/vendor/spas", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const body = spaBodySchema.parse(request.body);
    if (body.isPublished && vendor.status !== "approved") {
      return reply
        .code(403)
        .send({ error: "Your vendor account is awaiting approval; you can prepare the listing but not publish it yet." });
    }

    const mode = staticCache.paymentModeByCode(body.paymentModeCode)!;
    const currency = staticCache.currencies.find((c) => c.code === body.currencyCode);
    if (!currency) return reply.code(400).send({ error: "Unknown currency" });

    let slug = slugify(body.name);
    if (await queryOne("SELECT id FROM spas WHERE slug = ?", [slug])) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const clinicCode = await allocateClinicCode();
    const result = await execute(
      `INSERT INTO spas
        (vendor_id, clinic_code, slug, name, short_description, description, address_line, postal_code, city_id,
         lat, lng, phone, email, website, shopify_collection_handle, payment_mode_id, deposit_bps,
         booking_fee_minor, currency_id, is_published)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        vendor.id, clinicCode, slug, body.name, body.shortDescription, body.description, body.addressLine,
        body.postalCode, body.cityId, body.lat, body.lng, body.phone, body.email, body.website,
        body.shopifyCollectionHandle, mode.id, body.depositBps, body.bookingFeeMinor,
        currency.id, body.isPublished ? 1 : 0,
      ]
    );
    await saveSpaStay(result.insertId, body);
    return reply.code(201).send({ id: result.insertId, slug, clinicCode });
  });

  app.put("/vendor/spas/:id", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const spaId = Number((request.params as { id: string }).id);
    if (!(await assertSpaOwnership(spaId, vendor.id, reply))) return;

    const body = spaBodySchema.parse(request.body);
    if (body.isPublished && vendor.status !== "approved") {
      return reply
        .code(403)
        .send({ error: "Your vendor account is awaiting approval; you can prepare the listing but not publish it yet." });
    }
    const mode = staticCache.paymentModeByCode(body.paymentModeCode)!;
    const currency = staticCache.currencies.find((c) => c.code === body.currencyCode);
    if (!currency) return reply.code(400).send({ error: "Unknown currency" });

    await execute(
      `UPDATE spas SET name=?, short_description=?, description=?, address_line=?, postal_code=?,
         city_id=?, lat=?, lng=?, phone=?, email=?, website=?, shopify_collection_handle=?,
         payment_mode_id=?, deposit_bps=?, booking_fee_minor=?, currency_id=?, is_published=?
       WHERE id = ?`,
      [
        body.name, body.shortDescription, body.description, body.addressLine, body.postalCode,
        body.cityId, body.lat, body.lng, body.phone, body.email, body.website,
        body.shopifyCollectionHandle, mode.id, body.depositBps, body.bookingFeeMinor,
        currency.id, body.isPublished ? 1 : 0, spaId,
      ]
    );
    await saveSpaStay(spaId, body);
    return { ok: true };
  });

  app.get("/vendor/spas/:id", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const spaId = Number((request.params as { id: string }).id);

    const spa = await queryOne<Record<string, unknown>>(
      `SELECT id, slug, name, clinic_code AS clinicCode, short_description AS shortDescription, description,
         address_line AS addressLine, postal_code AS postalCode, city_id AS cityId, lat, lng,
         phone, email, website, shopify_collection_handle AS shopifyCollectionHandle,
         payment_mode_id AS paymentModeId, deposit_bps AS depositBps,
         booking_fee_minor AS bookingFeeMinor, currency_id AS currencyId, is_published AS isPublished
       FROM spas WHERE id = ? AND vendor_id = ?`,
      [spaId, vendor.id]
    );
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const treatments = await query<{
      id: number;
      categoryId: number;
      kind: string;
      name: string;
      description: string;
      durationMinutes: number | null;
      nights: number | null;
      priceMinor: number;
      isActive: number;
    }>(
      `SELECT id, category_id AS categoryId, kind, name, description,
         duration_minutes AS durationMinutes, nights, price_minor AS priceMinor, is_active AS isActive
       FROM treatments WHERE spa_id = ? ORDER BY kind, name`,
      [spaId]
    );
    const treatmentIds = treatments.map((t) => t.id);
    const slotRows =
      treatmentIds.length === 0
        ? []
        : await query<{ id: number; treatmentId: number; startDate: string; capacity: number }>(
            `SELECT id, treatment_id AS treatmentId,
               DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, capacity
             FROM retreat_slots
             WHERE treatment_id IN (${treatmentIds.map(() => "?").join(",")})
             ORDER BY start_date`,
            treatmentIds
          );
    const slotsByTreatment = new Map<number, { id: number; startDate: string; capacity: number }[]>();
    for (const row of slotRows) {
      const list = slotsByTreatment.get(row.treatmentId) ?? [];
      list.push({ id: row.id, startDate: row.startDate, capacity: row.capacity });
      slotsByTreatment.set(row.treatmentId, list);
    }
    const hours = await query(
      `SELECT weekday, TIME_FORMAT(open_time,'%H:%i') AS openTime, TIME_FORMAT(close_time,'%H:%i') AS closeTime
       FROM spa_open_hours WHERE spa_id = ? ORDER BY weekday`,
      [spaId]
    );
    const photos = await query<{ id: number; url: string; alt: string; sortOrder: number }>(
      "SELECT id, url, alt, sort_order AS sortOrder FROM spa_photos WHERE spa_id = ? ORDER BY sort_order",
      [spaId]
    );
    const stay = await loadSpaStay(spaId);
    return {
      ...spa,
      paymentModeCode: staticCache.paymentMode(Number(spa.paymentModeId))?.code,
      currencyCode: staticCache.currency(Number(spa.currencyId))?.code,
      isPublished: Boolean(spa.isPublished),
      treatments: treatments.map((t) => ({
        ...t,
        categoryName: staticCache.treatmentCategoryName(t.categoryId),
        slots: slotsByTreatment.get(t.id) ?? [],
      })),
      openHours: hours,
      photos: photos.map((p) => ({
        id: p.id,
        url: publicPhotoUrl(p.url) ?? p.url,
        title: p.alt,
        alt: p.alt,
        sortOrder: p.sortOrder,
      })),
      ...stay,
      accommodationTypeId: stay.accommodationType?.id ?? null,
    };
  });

  app.put("/vendor/spas/:id/hours", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const spaId = Number((request.params as { id: string }).id);
    if (!(await assertSpaOwnership(spaId, vendor.id, reply))) return;

    const body = z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          openTime: z.string().regex(/^\d{2}:\d{2}$/),
          closeTime: z.string().regex(/^\d{2}:\d{2}$/),
        })
      )
      .parse(request.body);

    await execute("DELETE FROM spa_open_hours WHERE spa_id = ?", [spaId]);
    for (const h of body) {
      await execute(
        "INSERT INTO spa_open_hours (spa_id, weekday, open_time, close_time) VALUES (?,?,?,?)",
        [spaId, h.weekday, `${h.openTime}:00`, `${h.closeTime}:00`]
      );
    }
    return { ok: true };
  });

  app.post("/vendor/spas/:id/photos", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const spaId = Number((request.params as { id: string }).id);
    if (!(await assertSpaOwnership(spaId, vendor.id, reply))) return;

    const max = await queryOne<{ m: number }>(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM spa_photos WHERE spa_id = ?",
      [spaId]
    );
    const nextOrder = Number(max?.m ?? -1) + 1;
    const contentType = String(request.headers["content-type"] ?? "");

    if (contentType.includes("multipart/form-data")) {
      const file = await request.file();
      if (!file) return reply.code(400).send({ error: "Choose an image file to upload" });
      const buffer = await file.toBuffer();
      const title = multipartField(file, ["title", "alt"]).slice(0, 200);
      try {
        const saved = await saveSpaPhotoFile(spaId, buffer, file.mimetype);
        const result = await execute(
          "INSERT INTO spa_photos (spa_id, url, alt, sort_order) VALUES (?,?,?,?)",
          [spaId, saved.relativeUrl, title, nextOrder]
        );
        return reply.code(201).send({
          id: result.insertId,
          url: saved.absoluteUrl,
          title,
          alt: title,
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        return reply.code(status).send({ error: (err as Error).message });
      }
    }

    const body = z
      .object({
        url: z.string().url(),
        title: z.string().max(200).optional(),
        alt: z.string().max(200).optional(),
      })
      .parse(request.body);
    const title = (body.title ?? body.alt ?? "").slice(0, 200);
    const result = await execute(
      "INSERT INTO spa_photos (spa_id, url, alt, sort_order) VALUES (?,?,?,?)",
      [spaId, body.url, title, nextOrder]
    );
    return reply.code(201).send({ id: result.insertId, url: body.url, title, alt: title });
  });

  app.patch("/vendor/photos/:photoId", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const photoId = Number((request.params as { photoId: string }).photoId);
    const body = z.object({ title: z.string().max(200) }).parse(request.body);
    const result = await execute(
      `UPDATE spa_photos p JOIN spas s ON s.id = p.spa_id
       SET p.alt = ? WHERE p.id = ? AND s.vendor_id = ?`,
      [body.title, photoId, vendor.id]
    );
    if (result.affectedRows === 0) return reply.code(404).send({ error: "Photo not found" });
    return { ok: true, title: body.title };
  });

  app.delete("/vendor/photos/:photoId", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const photoId = Number((request.params as { photoId: string }).photoId);
    const row = await queryOne<{ url: string }>(
      `SELECT p.url FROM spa_photos p JOIN spas s ON s.id = p.spa_id
       WHERE p.id = ? AND s.vendor_id = ?`,
      [photoId, vendor.id]
    );
    if (!row) return reply.code(404).send({ error: "Photo not found" });
    await execute(
      `DELETE p FROM spa_photos p JOIN spas s ON s.id = p.spa_id
       WHERE p.id = ? AND s.vendor_id = ?`,
      [photoId, vendor.id]
    );
    await deleteLocalPhoto(row.url);
    return { ok: true };
  });

  // ---- Treatments ----

  const treatmentSchema = z.object({
    categoryId: z.number(),
    kind: z.enum(["session", "retreat"]),
    name: z.string().min(3).max(160),
    description: z.string().default(""),
    durationMinutes: z.number().int().min(15).max(480).nullable().default(null),
    nights: z.number().int().min(1).max(60).nullable().default(null),
    priceMinor: z.number().int().min(0),
    isActive: z.boolean().default(true),
  });

  app.post("/vendor/spas/:id/treatments", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const spaId = Number((request.params as { id: string }).id);
    if (!(await assertSpaOwnership(spaId, vendor.id, reply))) return;

    const body = treatmentSchema.parse(request.body);
    if (!staticCache.treatmentCategory(body.categoryId)) {
      return reply.code(400).send({ error: "Unknown treatment category" });
    }
    const result = await execute(
      `INSERT INTO treatments (spa_id, category_id, kind, name, description, duration_minutes, nights, price_minor, is_active)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        spaId, body.categoryId, body.kind, body.name, body.description,
        body.durationMinutes, body.nights, body.priceMinor, body.isActive ? 1 : 0,
      ]
    );
    return reply.code(201).send({ id: result.insertId });
  });

  app.put("/vendor/treatments/:id", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const treatmentId = Number((request.params as { id: string }).id);
    const body = treatmentSchema.parse(request.body);
    if (!staticCache.treatmentCategory(body.categoryId)) {
      return reply.code(400).send({ error: "Unknown treatment category" });
    }

    const result = await execute(
      `UPDATE treatments t JOIN spas s ON s.id = t.spa_id
       SET t.category_id=?, t.kind=?, t.name=?, t.description=?, t.duration_minutes=?,
           t.nights=?, t.price_minor=?, t.is_active=?
       WHERE t.id = ? AND s.vendor_id = ?`,
      [
        body.categoryId, body.kind, body.name, body.description, body.durationMinutes,
        body.nights, body.priceMinor, body.isActive ? 1 : 0, treatmentId, vendor.id,
      ]
    );
    if (result.affectedRows === 0) return reply.code(404).send({ error: "Treatment not found" });
    return { ok: true };
  });

  app.delete("/vendor/treatments/:id", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const treatmentId = Number((request.params as { id: string }).id);

    const owned = await queryOne<{ id: number }>(
      "SELECT t.id FROM treatments t JOIN spas s ON s.id = t.spa_id WHERE t.id = ? AND s.vendor_id = ?",
      [treatmentId, vendor.id]
    );
    if (!owned) return reply.code(404).send({ error: "Treatment not found" });

    const booked = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM bookings WHERE treatment_id = ?",
      [treatmentId]
    );
    if (Number(booked?.n ?? 0) > 0) {
      return reply.code(409).send({
        error:
          "This treatment has bookings, so it cannot be deleted. Uncheck Active to hide it from guests.",
      });
    }

    await execute("DELETE FROM treatments WHERE id = ?", [treatmentId]);
    return { ok: true };
  });

  app.post("/vendor/treatments/:id/retreat-slots", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const treatmentId = Number((request.params as { id: string }).id);
    const owned = await queryOne<{ id: number; kind: string }>(
      "SELECT t.id, t.kind FROM treatments t JOIN spas s ON s.id = t.spa_id WHERE t.id = ? AND s.vendor_id = ?",
      [treatmentId, vendor.id]
    );
    if (!owned) return reply.code(404).send({ error: "Treatment not found" });
    if (owned.kind !== "retreat") {
      return reply.code(400).send({ error: "Start dates can only be added to multi-day retreats" });
    }

    const body = z
      .object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        capacity: z.number().int().min(1).max(500),
      })
      .parse(request.body);
    await execute(
      `INSERT INTO retreat_slots (treatment_id, start_date, capacity) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE capacity = VALUES(capacity)`,
      [treatmentId, body.startDate, body.capacity]
    );
    const slot = await queryOne<{ id: number; startDate: string; capacity: number }>(
      `SELECT id, DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate, capacity
       FROM retreat_slots WHERE treatment_id = ? AND start_date = ?`,
      [treatmentId, body.startDate]
    );
    return reply.code(201).send(slot);
  });

  app.delete("/vendor/treatments/:id/retreat-slots/:slotId", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const { id, slotId } = request.params as { id: string; slotId: string };
    const treatmentId = Number(id);
    const slotPk = Number(slotId);

    const slot = await queryOne<{ id: number; start_date: string }>(
      `SELECT rs.id, rs.start_date
       FROM retreat_slots rs
       JOIN treatments t ON t.id = rs.treatment_id
       JOIN spas s ON s.id = t.spa_id
       WHERE rs.id = ? AND rs.treatment_id = ? AND s.vendor_id = ?`,
      [slotPk, treatmentId, vendor.id]
    );
    if (!slot) return reply.code(404).send({ error: "Start date not found" });

    const cancelled = staticCache.bookingStatusByCode("cancelled")?.id;
    const booked = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM bookings
       WHERE treatment_id = ? AND DATE(starts_at) = ?
         AND status_id != ?`,
      [treatmentId, slot.start_date, cancelled ?? 0]
    );
    if (Number(booked?.n ?? 0) > 0) {
      return reply.code(409).send({
        error: "Guests have already booked this start date, so it cannot be removed.",
      });
    }

    await execute("DELETE FROM retreat_slots WHERE id = ?", [slotPk]);
    return { ok: true };
  });

  // ---- Bookings ----

  app.get("/vendor/bookings", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const params = z
      .object({
        spaId: z.coerce.number().int().positive().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        treatmentIds: z.string().optional(),
        categoryIds: z.string().optional(),
        guestName: z.string().max(120).optional(),
        bookingRef: z.string().max(32).optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(request.query);

    const pageSize = 10;
    const categoryIds = (params.categoryIds || params.treatmentIds || "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    let spa: { id: number; name: string; cityName: string; clinicCode: string } | null = null;
    if (params.spaId) {
      const row = await queryOne<{ id: number; name: string; city_id: number; clinic_code: string }>(
        "SELECT id, name, city_id, clinic_code FROM spas WHERE id = ? AND vendor_id = ?",
        [params.spaId, vendor.id]
      );
      if (!row) return reply.code(404).send({ error: "Clinic not found" });
      spa = {
        id: row.id,
        name: row.name,
        cityName: staticCache.city(row.city_id)?.name ?? "",
        clinicCode: row.clinic_code,
      };
    }

    const where = ["s.vendor_id = ?"];
    const values: unknown[] = [vendor.id];
    if (params.spaId) {
      where.push("b.spa_id = ?");
      values.push(params.spaId);
    }
    if (params.from) {
      where.push("DATE(b.starts_at) >= ?");
      values.push(params.from);
    }
    if (params.to) {
      where.push("DATE(b.starts_at) <= ?");
      values.push(params.to);
    }
    if (params.guestName?.trim()) {
      where.push("u.name LIKE ?");
      values.push(`%${params.guestName.trim()}%`);
    }
    const ref = parseBookingRefInput(params.bookingRef ?? "", spa?.clinicCode);
    if (ref.remainder) {
      const parts: string[] = [];
      if (ref.full) {
        parts.push("b.code = ?");
        values.push(ref.full);
      }
      if (ref.suffix) {
        parts.push("SUBSTRING_INDEX(b.code, '-', -1) = ?");
        values.push(ref.suffix);
      }
      if (spa?.clinicCode && ref.remainder) {
        parts.push("b.code LIKE ?");
        values.push(`${spa.clinicCode}-${ref.remainder}%`);
      }
      if (!spa?.clinicCode && ref.remainder) {
        parts.push("b.code LIKE ?");
        values.push(`%${ref.remainder}%`);
      }
      if (parts.length) where.push(`(${parts.join(" OR ")})`);
    }
    if (categoryIds.length > 0) {
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
    const total = Number(totalRow?.n ?? 0);
    const offset = (params.page - 1) * pageSize;

    const rows = await query<Parameters<typeof toBooking>[0] & { guest_name: string; guest_email: string }>(
      `SELECT b.id, b.code, b.spa_id, s.name AS spa_name, s.slug AS spa_slug,
         b.treatment_id, t.name AS treatment_name, t.kind AS treatment_kind,
         t.category_id AS treatment_category_id,
         b.status_id, b.payment_mode_id, b.starts_at, b.ends_at, b.party_size,
         b.total_minor, b.paid_minor, b.currency_id, b.created_at,
         u.name AS guest_name, u.email AS guest_email
       FROM bookings b
       JOIN spas s ON s.id = b.spa_id
       JOIN treatments t ON t.id = b.treatment_id
       JOIN users u ON u.id = b.user_id
       WHERE ${whereSql}
       ORDER BY b.starts_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      values
    );

    const categories = staticCache.treatmentCategories.map((c) => ({ id: c.id, name: c.name }));

    return {
      spa,
      categories,
      items: rows.map((r) => ({ ...toBooking(r), guestName: r.guest_name, guestEmail: r.guest_email })),
      page: params.page,
      pageSize,
      total,
    };
  });

  app.patch("/vendor/bookings/:id/status", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const bookingId = Number((request.params as { id: string }).id);
    const body = z
      .object({ status: z.enum(["confirmed", "cancelled", "completed", "no_show"]) })
      .parse(request.body);

    const statusId = staticCache.bookingStatusByCode(body.status)!.id;
    const result = await execute(
      `UPDATE bookings b JOIN spas s ON s.id = b.spa_id
       SET b.status_id = ? WHERE b.id = ? AND s.vendor_id = ?`,
      [statusId, bookingId, vendor.id]
    );
    if (result.affectedRows === 0) return reply.code(404).send({ error: "Booking not found" });
    return { ok: true };
  });

  // ---- Reviews needing a reply ----

  app.get("/vendor/reviews", async (request, reply) => {
    const vendor = await requireVendor(request, reply);
    if (!vendor) return;
    const rows = await query<Parameters<typeof toReview>[0] & { spa_name: string }>(
      `SELECT rv.id, rv.spa_id, rv.rating, rv.title, rv.body, rv.visited_on, rv.created_at,
         u.id AS user_id, u.username, u.name AS user_name, u.avatar_url, u.bio AS user_bio,
         u.created_at AS user_created_at,
         rr.id AS response_id, rr.body AS response_body, rr.created_at AS response_created_at,
         ru.name AS responder_name, s.name AS spa_name
       FROM reviews rv
       JOIN spas s ON s.id = rv.spa_id
       JOIN users u ON u.id = rv.user_id
       LEFT JOIN review_responses rr ON rr.review_id = rv.id
       LEFT JOIN users ru ON ru.id = rr.user_id
       WHERE s.vendor_id = ? ORDER BY rv.created_at DESC LIMIT 100`,
      [vendor.id]
    );
    return rows.map((r) => ({ ...toReview(r), spaName: r.spa_name }));
  });
}
