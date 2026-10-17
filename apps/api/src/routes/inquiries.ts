import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { execute, query, queryOne } from "../db/pool.js";
import { loadSpaAddress, notifyPatientInterest } from "../lib/notify.js";

export const INQUIRY_SERVICES = ["consultation", "massage", "general_enquiry"] as const;
export const INQUIRY_TIMEFRAMES = ["this_week", "this_month", "exploring"] as const;

export const INQUIRY_SERVICE_LABELS: Record<(typeof INQUIRY_SERVICES)[number], string> = {
  consultation: "Consultation",
  massage: "Massage",
  general_enquiry: "General enquiry",
};

export const INQUIRY_TIMEFRAME_LABELS: Record<(typeof INQUIRY_TIMEFRAMES)[number], string> = {
  this_week: "This week",
  this_month: "This month",
  exploring: "Exploring options",
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inquiryBody = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().max(255).regex(emailRe, "Invalid email"),
  phone: z.string().trim().max(32).optional().nullable(),
  service: z.enum(INQUIRY_SERVICES).optional().nullable(),
  timeframe: z.enum(INQUIRY_TIMEFRAMES).optional().nullable(),
  shareConsent: z.literal(true),
});

interface InquiryRow {
  id: number;
  spa_id: number;
  name: string;
  email: string;
  phone: string | null;
  service: (typeof INQUIRY_SERVICES)[number] | null;
  timeframe: (typeof INQUIRY_TIMEFRAMES)[number] | null;
  share_consent: number;
  created_at: Date | string;
}

function publicInquiry(row: InquiryRow & { spa_name?: string; slug?: string; clinic_code?: string }) {
  return {
    id: row.id,
    spaId: row.spa_id,
    spaName: row.spa_name,
    slug: row.slug,
    clinicCode: row.clinic_code,
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    serviceLabel: row.service ? INQUIRY_SERVICE_LABELS[row.service] : null,
    timeframe: row.timeframe,
    timeframeLabel: row.timeframe ? INQUIRY_TIMEFRAME_LABELS[row.timeframe] : null,
    shareConsent: Boolean(row.share_consent),
    createdAt: row.created_at,
  };
}

export async function inquiryRoutes(app: FastifyInstance): Promise<void> {
  app.post("/spas/:slug/inquiries", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const spa = await queryOne<{ id: number; vendor_id: number | null; name: string; slug: string }>(
      "SELECT id, vendor_id, name, slug FROM spas WHERE slug = ? AND is_published = 1",
      [slug]
    );
    if (!spa) return reply.code(404).send({ error: "Spa not found" });
    if (spa.vendor_id != null) {
      return reply.code(409).send({ error: "This clinic already accepts appointment bookings" });
    }

    const body = inquiryBody.parse(request.body);
    const phone = body.phone?.trim() || null;
    const recent = await queryOne<{ id: number }>(
      `SELECT id FROM spa_inquiries
       WHERE spa_id = ? AND email = ? AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)
       LIMIT 1`,
      [spa.id, body.email.toLowerCase()]
    );
    if (recent) {
      return reply.code(429).send({ error: "You already submitted interest for this clinic. Please wait a few minutes." });
    }

    const result = await execute(
      `INSERT INTO spa_inquiries (spa_id, name, email, phone, service, timeframe, share_consent)
       VALUES (?,?,?,?,?,?,1)`,
      [spa.id, body.name, body.email.toLowerCase(), phone, body.service ?? null, body.timeframe ?? null]
    );
    const address = await loadSpaAddress(spa.id);
    await notifyPatientInterest({
      clinicName: spa.name,
      clinicAddress: address?.address || "",
      slug: spa.slug,
      patientName: body.name,
      patientEmail: body.email.toLowerCase(),
      patientPhone: phone || "—",
      interestedService: body.service ? INQUIRY_SERVICE_LABELS[body.service] : "—",
      preferredVisitTimeframe: body.timeframe ? INQUIRY_TIMEFRAME_LABELS[body.timeframe] : "—",
      sharingConsent: "Yes",
      submittedAt: new Date(),
      inquiryId: result.insertId,
    });
    return reply.code(201).send({ ok: true, id: result.insertId });
  });
}

export async function adminInquiryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/inquiries", async (request) => {
    const q = z
      .object({
        spaId: z.coerce.number().int().positive().optional(),
        inquiryId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
      })
      .parse(request.query);
    const pageSize = [10, 20, 30, 40, 50].includes(q.pageSize) ? q.pageSize : 20;
    const offset = (q.page - 1) * pageSize;
    const where: string[] = ["1=1"];
    const args: unknown[] = [];
    if (q.spaId) {
      where.push("i.spa_id = ?");
      args.push(q.spaId);
    }
    if (q.inquiryId) {
      where.push("i.id = ?");
      args.push(q.inquiryId);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM spa_inquiries i WHERE ${whereSql}`,
      args
    );
    const rows = await query<
      InquiryRow & { spa_name: string; slug: string; clinic_code: string }
    >(
      `SELECT i.*, s.name AS spa_name, s.slug, s.clinic_code
       FROM spa_inquiries i
       JOIN spas s ON s.id = i.spa_id
       WHERE ${whereSql}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      args
    );
    return {
      items: rows.map((r) => publicInquiry(r)),
      page: q.page,
      pageSize,
      total: Number(totalRow?.n ?? 0),
    };
  });
}
