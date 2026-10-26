import { allocateBookingCode } from "../lib/bookingRefs.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type {
  AvailabilitySlot,
  Booking,
  CreateBookingResponse,
  ProgramRun,
  RetreatAvailability,
} from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { requireAuth } from "../plugins/auth.js";
import { platformFeeFor, stripe } from "../lib/stripe.js";
import { config } from "../config.js";
import { notifyBooking } from "../lib/notify.js";
import { addIsoDays, loadProgramRuns, padTime, weekdaysFromMask } from "../lib/treatmentSchedule.js";

const SLOT_STEP_MINUTES = 30;

interface BookingRow {
  id: number;
  code: string;
  spa_id: number;
  spa_name: string;
  spa_slug: string;
  treatment_id: number;
  treatment_name: string;
  treatment_kind: "session" | "retreat" | "program";
  treatment_category_id: number;
  status_id: number;
  payment_mode_id: number;
  starts_at: string;
  ends_at: string;
  party_size: number;
  total_minor: number;
  paid_minor: number;
  currency_id: number;
  created_at: string;
}

const BOOKING_SELECT = `
  SELECT b.id, b.code, b.spa_id, s.name AS spa_name, s.slug AS spa_slug,
    b.treatment_id, t.name AS treatment_name, t.kind AS treatment_kind,
    t.category_id AS treatment_category_id,
    b.status_id, b.payment_mode_id, b.starts_at, b.ends_at, b.party_size,
    b.total_minor, b.paid_minor, b.currency_id, b.created_at
  FROM bookings b
  JOIN spas s ON s.id = b.spa_id
  JOIN treatments t ON t.id = b.treatment_id
`;

export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    code: row.code,
    spaId: row.spa_id,
    spaName: row.spa_name,
    spaSlug: row.spa_slug,
    treatmentId: row.treatment_id,
    treatmentName: row.treatment_name,
    treatmentCategoryName: staticCache.treatmentCategoryName(row.treatment_category_id),
    treatmentKind: row.treatment_kind,
    statusCode: (staticCache.bookingStatus(row.status_id)?.code ?? "pending_payment") as Booking["statusCode"],
    paymentModeCode: (staticCache.paymentMode(row.payment_mode_id)?.code ?? "pay_at_spa") as Booking["paymentModeCode"],
    startsAt: new Date(row.starts_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    partySize: row.party_size,
    totalMinor: Number(row.total_minor),
    paidMinor: Number(row.paid_minor),
    currencyCode: staticCache.currency(row.currency_id)?.code ?? "USD",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function toMySqlDateTime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function bookingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Free time slots for a session treatment on a given date.
   * V1 model: one treatment room per spa (no overlapping session bookings).
   */
  app.get("/spas/:slug/availability", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const params = z
      .object({
        treatmentId: z.coerce.number(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(request.query);

    const spa = await queryOne<{ id: number }>(
      "SELECT id FROM spas WHERE slug = ? AND is_published = 1",
      [slug]
    );
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const treatment = await queryOne<{ duration_minutes: number; kind: string }>(
      "SELECT duration_minutes, kind FROM treatments WHERE id = ? AND spa_id = ? AND is_active = 1",
      [params.treatmentId, spa.id]
    );
    if (!treatment || treatment.kind !== "session") {
      return reply.code(400).send({ error: "Treatment is not a bookable session" });
    }

    const weekday = new Date(`${params.date}T00:00:00Z`).getUTCDay();
    const hours = await queryOne<{ open_time: string; close_time: string }>(
      "SELECT open_time, close_time FROM spa_open_hours WHERE spa_id = ? AND weekday = ?",
      [spa.id, weekday]
    );
    if (!hours) return [] satisfies AvailabilitySlot[];

    const closure = await queryOne(
      "SELECT id FROM spa_closures WHERE spa_id = ? AND ? BETWEEN date_from AND date_to",
      [spa.id, params.date]
    );
    if (closure) return [] satisfies AvailabilitySlot[];

    const cancelled = staticCache.bookingStatusByCode("cancelled")!.id;
    const existing = await query<{ starts_at: string; ends_at: string }>(
      `SELECT starts_at, ends_at FROM bookings
       WHERE spa_id = ? AND status_id != ? AND DATE(starts_at) = ?`,
      [spa.id, cancelled, params.date]
    );
    const busy = existing.map((b) => ({
      start: new Date(b.starts_at).getTime(),
      end: new Date(b.ends_at).getTime(),
    }));

    const open = new Date(`${params.date}T${String(hours.open_time).slice(0, 8)}Z`).getTime();
    const close = new Date(`${params.date}T${String(hours.close_time).slice(0, 8)}Z`).getTime();
    const durationMs = treatment.duration_minutes * 60_000;
    const stepMs = SLOT_STEP_MINUTES * 60_000;
    const now = Date.now();

    const slots: AvailabilitySlot[] = [];
    for (let start = open; start + durationMs <= close; start += stepMs) {
      const end = start + durationMs;
      if (start < now) continue;
      if (busy.some((b) => start < b.end && end > b.start)) continue;
      slots.push({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
    }
    return slots;
  });

  /** Allowed start weekdays and remaining capacity for a retreat. */
  app.get("/treatments/:id/retreat-availability", async (request, reply) => {
    const treatmentId = Number((request.params as { id: string }).id);
    const treatment = await queryOne<{
      spa_id: number;
      kind: string;
      duration_days: number | null;
      retreat_weekdays: number | null;
      retreat_capacity: number | null;
    }>(
      `SELECT spa_id, kind, duration_days, retreat_weekdays, retreat_capacity
       FROM treatments WHERE id = ? AND is_active = 1`,
      [treatmentId]
    );
    if (!treatment || treatment.kind !== "retreat") {
      return reply.code(400).send({ error: "Treatment is not a bookable retreat" });
    }

    const weekdays = weekdaysFromMask(treatment.retreat_weekdays);
    const capacity = Number(treatment.retreat_capacity ?? 0);
    const durationDays = Number(treatment.duration_days ?? 1);
    const remainingByDate: Record<string, number> = {};
    const empty: RetreatAvailability = { weekdays, capacity, durationDays, remainingByDate };
    if (weekdays.length === 0 || capacity < 1) return empty;

    const cancelled = staticCache.bookingStatusByCode("cancelled")!.id;
    const todayRow = await queryOne<{ d: string }>("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
    const today = todayRow?.d ?? new Date().toISOString().slice(0, 10);
    const horizon = addIsoDays(today, 180);

    const closures = await query<{ from: string; to: string }>(
      `SELECT DATE_FORMAT(date_from, '%Y-%m-%d') AS \`from\`, DATE_FORMAT(date_to, '%Y-%m-%d') AS \`to\`
       FROM spa_closures WHERE spa_id = ? AND date_to >= ? AND date_from <= ?`,
      [treatment.spa_id, today, horizon]
    );
    const closed = new Set<string>();
    for (const row of closures) {
      for (let d = row.from; d <= row.to; d = addIsoDays(d, 1)) closed.add(d);
    }

    const bookedRows = await query<{ d: string; n: number }>(
      `SELECT DATE_FORMAT(starts_at, '%Y-%m-%d') AS d, SUM(party_size) AS n
       FROM bookings
       WHERE treatment_id = ? AND status_id != ? AND DATE(starts_at) >= ? AND program_batch_id IS NULL
       GROUP BY DATE(starts_at)`,
      [treatmentId, cancelled, today]
    );
    const bookedByDate = new Map(bookedRows.map((r) => [r.d, Number(r.n)]));

    for (let d = today; d <= horizon; d = addIsoDays(d, 1)) {
      const weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (!weekdays.includes(weekday) || closed.has(d)) continue;
      remainingByDate[d] = Math.max(0, capacity - (bookedByDate.get(d) ?? 0));
    }
    return { weekdays, capacity, durationDays, remainingByDate } satisfies RetreatAvailability;
  });

  /** Upcoming special-program runs with time batches. */
  app.get("/treatments/:id/program-runs", async (request, reply) => {
    const treatmentId = Number((request.params as { id: string }).id);
    const treatment = await queryOne<{ kind: string; duration_days: number | null }>(
      "SELECT kind, duration_days FROM treatments WHERE id = ? AND is_active = 1",
      [treatmentId]
    );
    if (!treatment || treatment.kind !== "program") {
      return reply.code(400).send({ error: "Treatment is not a special program" });
    }
    const cancelled = staticCache.bookingStatusByCode("cancelled")!.id;
    const byTreatment = await loadProgramRuns([treatmentId], {
      upcomingOnly: true,
      durationByTreatment: new Map([[treatmentId, Number(treatment.duration_days ?? 1)]]),
      cancelledStatusId: cancelled,
    });
    return (byTreatment.get(treatmentId) ?? []) satisfies ProgramRun[];
  });

  app.post("/bookings", { preHandler: requireAuth }, async (request, reply) => {
    const body = z
      .object({
        treatmentId: z.number(),
        startsAt: z.string(), // ISO datetime for sessions; YYYY-MM-DD for retreats/programs
        batchId: z.number().int().positive().optional(),
        partySize: z.number().int().min(1).max(10).default(1),
        notes: z.string().max(2000).optional(),
      })
      .parse(request.body);

    const treatment = await queryOne<{
      id: number;
      spa_id: number;
      kind: "session" | "retreat" | "program";
      duration_minutes: number | null;
      duration_days: number | null;
      retreat_weekdays: number | null;
      retreat_capacity: number | null;
      price_minor: number;
    }>(
      `SELECT id, spa_id, kind, duration_minutes, duration_days, retreat_weekdays, retreat_capacity, price_minor
       FROM treatments WHERE id = ? AND is_active = 1`,
      [body.treatmentId]
    );
    if (!treatment) return reply.code(404).send({ error: "Treatment not found" });

    const spa = await queryOne<{
      id: number;
      name: string;
      clinic_code: string;
      payment_mode_id: number;
      deposit_bps: number | null;
      booking_fee_minor: number | null;
      currency_id: number;
      stripe_account_id: string | null;
      stripe_onboarded: number;
    }>(
      `SELECT s.id, s.name, s.clinic_code, s.payment_mode_id, s.deposit_bps, s.booking_fee_minor, s.currency_id,
         v.stripe_account_id, v.stripe_onboarded
       FROM spas s JOIN vendors v ON v.id = s.vendor_id
       WHERE s.id = ? AND s.is_published = 1 AND v.status = 'approved'`,
      [treatment.spa_id]
    );
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    // Compute start/end and validate availability
    let startsAt: Date;
    let endsAt: Date;
    let programBatchId: number | null = null;
    const cancelled = staticCache.bookingStatusByCode("cancelled")!.id;
    if (treatment.kind === "session") {
      startsAt = new Date(body.startsAt);
      if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now()) {
        return reply.code(400).send({ error: "Invalid start time" });
      }
      endsAt = new Date(startsAt.getTime() + (treatment.duration_minutes ?? 60) * 60_000);

      const clash = await queryOne(
        `SELECT id FROM bookings
         WHERE spa_id = ? AND status_id != ? AND starts_at < ? AND ends_at > ?`,
        [spa.id, cancelled, toMySqlDateTime(endsAt), toMySqlDateTime(startsAt)]
      );
      if (clash) return reply.code(409).send({ error: "This time slot was just taken. Pick another." });
    } else if (treatment.kind === "retreat") {
      const date = body.startsAt.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return reply.code(400).send({ error: "Choose a start date" });
      }
      const weekdays = weekdaysFromMask(treatment.retreat_weekdays);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      const capacity = Number(treatment.retreat_capacity ?? 0);
      if (!weekdays.includes(weekday) || capacity < 1) {
        return reply.code(400).send({ error: "That start date is not available for this retreat" });
      }
      const todayRow = await queryOne<{ d: string }>("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS d");
      if (date < (todayRow?.d ?? "")) {
        return reply.code(400).send({ error: "Choose a start date that is today or later" });
      }
      const closed = await queryOne(
        "SELECT id FROM spa_closures WHERE spa_id = ? AND ? BETWEEN date_from AND date_to",
        [spa.id, date]
      );
      if (closed) return reply.code(400).send({ error: "The clinic is closed on that date" });

      const booked = await queryOne<{ n: number }>(
        `SELECT COALESCE(SUM(party_size), 0) AS n FROM bookings
         WHERE treatment_id = ? AND DATE(starts_at) = ? AND status_id != ? AND program_batch_id IS NULL`,
        [treatment.id, date, cancelled]
      );
      if (Number(booked?.n ?? 0) + body.partySize > capacity) {
        return reply.code(409).send({ error: "Not enough spots left on that start date" });
      }
      startsAt = new Date(`${date}T14:00:00Z`);
      endsAt = new Date(
        startsAt.getTime() + (treatment.duration_days ?? 1) * 24 * 3600_000 - 2 * 3600_000
      );
    } else {
      if (!body.batchId) {
        return reply.code(400).send({ error: "Choose a time batch" });
      }
      const batch = await queryOne<{
        id: number;
        startDate: string;
        startTime: string;
        endTime: string;
        capacity: number;
        booked: number;
      }>(
        `SELECT pb.id, DATE_FORMAT(r.start_date, '%Y-%m-%d') AS startDate,
           TIME_FORMAT(pb.start_time, '%H:%i:%s') AS startTime,
           TIME_FORMAT(pb.end_time, '%H:%i:%s') AS endTime,
           pb.capacity,
           COALESCE((
             SELECT SUM(b.party_size) FROM bookings b
             WHERE b.program_batch_id = pb.id AND b.status_id != ?
           ), 0) AS booked
         FROM program_batches pb
         JOIN program_runs r ON r.id = pb.run_id
         WHERE pb.id = ? AND r.treatment_id = ? AND r.start_date >= CURDATE()`,
        [cancelled, body.batchId, treatment.id]
      );
      if (!batch) return reply.code(400).send({ error: "That time batch is no longer available" });
      if (Number(batch.booked) + body.partySize > batch.capacity) {
        return reply.code(409).send({ error: "Not enough spots left in that time batch" });
      }
      const lastDay = addIsoDays(batch.startDate, Math.max(1, treatment.duration_days ?? 1) - 1);
      startsAt = new Date(`${batch.startDate}T${padTime(batch.startTime)}Z`);
      endsAt = new Date(`${lastDay}T${padTime(batch.endTime)}Z`);
      programBatchId = batch.id;
    }

    // Pricing per payment mode
    const mode = staticCache.paymentMode(spa.payment_mode_id)!;
    const totalMinor = treatment.price_minor * body.partySize;
    let payNowMinor = 0;
    let platformFeeMinor = 0;

    switch (mode.code) {
      case "full_prepay":
        payNowMinor = totalMinor;
        platformFeeMinor = platformFeeFor(payNowMinor);
        break;
      case "deposit":
        payNowMinor = Math.round((totalMinor * (spa.deposit_bps ?? 2000)) / 10000);
        platformFeeMinor = platformFeeFor(payNowMinor);
        break;
      case "booking_fee":
        // The booking fee is platform revenue; the spa is paid on site.
        payNowMinor = spa.booking_fee_minor ?? config.stripe.defaultBookingFeeMinor;
        platformFeeMinor = payNowMinor;
        break;
      case "pay_at_spa":
        payNowMinor = 0;
        break;
    }

    const currency = staticCache.currency(spa.currency_id)!;
    const code = await allocateBookingCode(spa.clinic_code);
    const needsPayment = payNowMinor > 0 && stripe !== null;
    const statusCode = payNowMinor > 0 && stripe !== null ? "pending_payment" : "confirmed";
    const statusId = staticCache.bookingStatusByCode(statusCode)!.id;

    const result = await execute(
      `INSERT INTO bookings
        (code, user_id, spa_id, treatment_id, status_id, payment_mode_id, starts_at, ends_at,
         party_size, total_minor, paid_minor, platform_fee_minor, currency_id, program_batch_id, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`,
      [
        code, request.user!.id, spa.id, treatment.id, statusId, spa.payment_mode_id,
        toMySqlDateTime(startsAt), toMySqlDateTime(endsAt), body.partySize,
        totalMinor, platformFeeMinor, spa.currency_id, programBatchId, body.notes ?? null,
      ]
    );
    const bookingId = result.insertId;

    let stripeClientSecret: string | null = null;
    if (needsPayment) {
      const params: Record<string, unknown> = {
        amount: payNowMinor,
        currency: currency.code.toLowerCase(),
        metadata: { bookingId: String(bookingId), bookingCode: code },
        automatic_payment_methods: { enabled: true },
      };
      // Destination charge to the vendor for prepayments/deposits.
      // Booking fees stay on the platform account.
      if (mode.code !== "booking_fee") {
        if (!spa.stripe_account_id || !spa.stripe_onboarded) {
          await execute("DELETE FROM bookings WHERE id = ?", [bookingId]);
          return reply
            .code(409)
            .send({ error: "This spa cannot accept online payments yet. Try again later." });
        }
        params.application_fee_amount = platformFeeMinor;
        params.transfer_data = { destination: spa.stripe_account_id };
      }
      const intent = await stripe!.paymentIntents.create(params as never);
      stripeClientSecret = intent.client_secret;
      await execute("UPDATE bookings SET stripe_payment_intent_id = ? WHERE id = ?", [
        intent.id,
        bookingId,
      ]);
    }

    const row = (await queryOne<BookingRow>(`${BOOKING_SELECT} WHERE b.id = ?`, [bookingId]))!;
    await notifyBooking(bookingId);
    const response: CreateBookingResponse = {
      booking: toBooking(row),
      stripeClientSecret,
      payNowMinor,
    };
    return reply.code(201).send(response);
  });

  app.get("/bookings/mine", { preHandler: requireAuth }, async (request) => {
    const rows = await query<BookingRow>(
      `${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.starts_at DESC LIMIT 100`,
      [request.user!.id]
    );
    return rows.map(toBooking);
  });

  app.get("/bookings/:code", { preHandler: requireAuth }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const row = await queryOne<BookingRow & { user_id: number }>(
      `${BOOKING_SELECT.replace("b.created_at", "b.created_at, b.user_id")} WHERE b.code = ?`,
      [code]
    );
    if (!row || row.user_id !== request.user!.id) {
      return reply.code(404).send({ error: "Booking not found" });
    }
    return toBooking(row);
  });
}
