import { createReadStream } from "node:fs";
import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { execute, pool, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";
import { ensureVendorAccount } from "../lib/vendorAccount.js";
import { claimDocumentDiskPath, saveClaimDocument } from "../lib/uploads.js";
import {
  loadSpaAddress,
  notifyClaimAdminNotice,
  notifyClaimApproved,
  notifyClaimOtp,
  notifyClaimReceived,
  notifyClaimRejected,
} from "../lib/notify.js";

const RELATIONSHIPS = ["Owner", "Manager", "Authorized representative", "Other"] as const;

const claimFields = z.object({
  contactName: z.string().trim().min(2).max(160),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().max(32).optional().nullable(),
  relationship: z.enum(RELATIONSHIPS),
  notes: z.string().trim().max(4000).optional().nullable(),
});

interface ClaimRow {
  id: number;
  spa_id: number;
  vendor_id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  relationship: string;
  notes: string | null;
  document_path: string | null;
  document_name: string | null;
  document_mime: string | null;
  otp_verified_at: Date | string | null;
  submitted_at: Date | string | null;
  decided_at: Date | string | null;
  decided_by_user_id: number | null;
  rejection_note: string | null;
  created_at: Date | string;
}

async function vendorIdForUser(userId: number, displayName: string): Promise<number> {
  await ensureVendorAccount(userId, displayName || "Clinic owner");
  const row = await queryOne<{ id: number }>("SELECT id FROM vendors WHERE user_id = ?", [userId]);
  if (!row) throw Object.assign(new Error("Could not create vendor account"), { statusCode: 500 });
  return row.id;
}

async function publishedSpa(slug: string) {
  return queryOne<{ id: number; vendor_id: number | null; name: string; slug: string }>(
    "SELECT id, vendor_id, name, slug FROM spas WHERE slug = ? AND is_published = 1",
    [slug]
  );
}

function publicClaim(row: ClaimRow) {
  return {
    id: row.id,
    spaId: row.spa_id,
    status: row.status,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    relationship: row.relationship,
    notes: row.notes,
    hasDocument: Boolean(row.document_path),
    documentName: row.document_name,
    otpVerified: Boolean(row.otp_verified_at),
    submittedAt: row.submitted_at,
    rejectionNote: row.rejection_note,
  };
}

async function loadOwnClaim(claimId: number, vendorId: number): Promise<ClaimRow | null> {
  return queryOne<ClaimRow>("SELECT * FROM spa_claims WHERE id = ? AND vendor_id = ?", [claimId, vendorId]);
}

async function requireOwnOpenClaim(
  request: FastifyRequest,
  reply: FastifyReply,
  claimId: number
): Promise<ClaimRow | null> {
  await requireAuth(request, reply);
  if (reply.sent) return null;
  const vendorId = await vendorIdForUser(request.user!.id, request.user!.email);
  const claim = await loadOwnClaim(claimId, vendorId);
  if (!claim) {
    reply.code(404).send({ error: "Claim not found" });
    return null;
  }
  if (claim.status !== "draft") {
    reply.code(409).send({ error: "This claim can no longer be edited" });
    return null;
  }
  return claim;
}

export async function claimRoutes(app: FastifyInstance): Promise<void> {
  app.get("/spas/:slug/claim-status", async (request) => {
    const { slug } = request.params as { slug: string };
    const spa = await publishedSpa(slug);
    if (!spa) return { unclaimed: false, myClaim: null };
    let myClaim = null;
    if (request.user) {
      const vendor = await queryOne<{ id: number }>("SELECT id FROM vendors WHERE user_id = ?", [
        request.user.id,
      ]);
      if (vendor) {
        const row = await queryOne<ClaimRow>(
          `SELECT * FROM spa_claims
           WHERE spa_id = ? AND vendor_id = ? AND status IN ('draft','pending','approved','rejected')
           ORDER BY FIELD(status,'pending','draft','approved','rejected'), id DESC
           LIMIT 1`,
          [spa.id, vendor.id]
        );
        if (row) myClaim = publicClaim(row);
      }
    }
    return { unclaimed: spa.vendor_id == null, myClaim };
  });

  app.post("/spas/:slug/claims", async (request, reply) => {
    await requireAuth(request, reply);
    if (reply.sent) return;
    const { slug } = request.params as { slug: string };
    const spa = await publishedSpa(slug);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });
    if (spa.vendor_id != null) return reply.code(409).send({ error: "This clinic already has an owner" });

    const body = claimFields.parse(request.body);
    const vendorId = await vendorIdForUser(request.user!.id, body.contactName || request.user!.email);

    const existing = await queryOne<ClaimRow>(
      `SELECT * FROM spa_claims WHERE spa_id = ? AND vendor_id = ? AND status IN ('draft','pending')
       ORDER BY FIELD(status,'pending','draft') LIMIT 1`,
      [spa.id, vendorId]
    );
    if (existing?.status === "pending") {
      return reply.code(409).send({ error: "You already have a claim awaiting review" });
    }

    if (existing) {
      await execute(
        `UPDATE spa_claims
         SET contact_name=?, contact_email=?, contact_phone=?, relationship=?, notes=?,
             otp_verified_at = IF(contact_email = ?, otp_verified_at, NULL)
         WHERE id = ?`,
        [
          body.contactName,
          body.contactEmail.toLowerCase(),
          body.contactPhone?.trim() || "",
          body.relationship,
          body.notes?.trim() || null,
          body.contactEmail.toLowerCase(),
          existing.id,
        ]
      );
      const updated = await loadOwnClaim(existing.id, vendorId);
      return publicClaim(updated!);
    }

    const result = await execute(
      `INSERT INTO spa_claims
        (spa_id, vendor_id, status, contact_name, contact_email, contact_phone, relationship, notes)
       VALUES (?,?, 'draft', ?,?,?,?,?)`,
      [
        spa.id,
        vendorId,
        body.contactName,
        body.contactEmail.toLowerCase(),
        body.contactPhone?.trim() || "",
        body.relationship,
        body.notes?.trim() || null,
      ]
    );
    const created = await loadOwnClaim(result.insertId, vendorId);
    return reply.code(201).send(publicClaim(created!));
  });

  app.post("/claims/:id/document", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const claim = await requireOwnOpenClaim(request, reply, claimId);
    if (!claim) return;

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "Choose a PDF or image file" });
    const buffer = await file.toBuffer();
    const saved = await saveClaimDocument(claim.id, buffer, file.mimetype, file.filename);
    if (claim.document_path) {
      try {
        const { unlink } = await import("node:fs/promises");
        await unlink(claimDocumentDiskPath(claim.document_path));
      } catch {
        // Previous file may already be gone.
      }
    }
    await execute("UPDATE spa_claims SET document_path=?, document_name=?, document_mime=? WHERE id = ?", [
      saved.relativePath,
      saved.fileName,
      saved.mimeType,
      claim.id,
    ]);
    return { ok: true, documentName: saved.fileName };
  });

  app.post("/claims/:id/otp", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const claim = await requireOwnOpenClaim(request, reply, claimId);
    if (!claim) return;
    if (!claim.contact_email) return reply.code(400).send({ error: "Save your email before verifying" });

    const recent = await queryOne<{ created_at: Date | string }>(
      "SELECT created_at FROM spa_claim_otps WHERE claim_id = ? ORDER BY id DESC LIMIT 1",
      [claim.id]
    );
    if (recent) {
      const age = Date.now() - new Date(recent.created_at).getTime();
      if (age < 30_000) return reply.code(429).send({ error: "Wait 30 seconds before requesting another code" });
    }

    const code = String(randomInt(100000, 1000000));
    const mailed = await notifyClaimOtp(claim.contact_email, claim.contact_name, code);
    if (mailed !== "sent") {
      return reply.code(503).send({ error: "Could not send the verification email. Try again in a moment." });
    }
    const expires = new Date(Date.now() + 10 * 60_000);
    await execute("INSERT INTO spa_claim_otps (claim_id, email, code, expires_at) VALUES (?,?,?,?)", [
      claim.id,
      claim.contact_email,
      code,
      expires.toISOString().slice(0, 19).replace("T", " "),
    ]);
    return { ok: true };
  });

  app.post("/claims/:id/verify-otp", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const claim = await requireOwnOpenClaim(request, reply, claimId);
    if (!claim) return;
    const body = z.object({ code: z.string().trim().regex(/^\d{6}$/) }).parse(request.body);

    const otp = await queryOne<{ id: number }>(
      `SELECT id FROM spa_claim_otps
       WHERE claim_id = ? AND code = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
       ORDER BY id DESC LIMIT 1`,
      [claim.id, body.code]
    );
    if (!otp) return reply.code(400).send({ error: "Invalid or expired code" });
    await execute("UPDATE spa_claim_otps SET consumed_at = UTC_TIMESTAMP() WHERE id = ?", [otp.id]);
    await execute("UPDATE spa_claims SET otp_verified_at = UTC_TIMESTAMP() WHERE id = ?", [claim.id]);
    return { ok: true };
  });

  app.post("/claims/:id/submit", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const claim = await requireOwnOpenClaim(request, reply, claimId);
    if (!claim) return;
    if (!claim.otp_verified_at) return reply.code(400).send({ error: "Verify your email with the code we sent" });
    if (
      !claim.contact_name ||
      !claim.contact_email ||
      (claim.contact_phone || "").trim().length < 6 ||
      !claim.relationship
    ) {
      return reply.code(400).send({ error: "Complete the claim form before submitting" });
    }

    const spa = await queryOne<{ vendor_id: number | null; name: string; slug: string }>(
      "SELECT vendor_id, name, slug FROM spas WHERE id = ?",
      [claim.spa_id]
    );
    if (!spa || spa.vendor_id != null) {
      return reply.code(409).send({ error: "This clinic already has an owner" });
    }

    await execute(
      "UPDATE spa_claims SET status = 'pending', submitted_at = UTC_TIMESTAMP() WHERE id = ?",
      [claim.id]
    );
    const address = await loadSpaAddress(claim.spa_id);
    await notifyClaimReceived({
      to: claim.contact_email,
      name: claim.contact_name,
      clinicName: spa.name,
      slug: spa.slug,
    });
    await notifyClaimAdminNotice({
      clinicName: spa.name,
      clinicAddress: address?.address || "",
      claimantName: claim.contact_name,
      relationship: claim.relationship,
      claimantEmail: claim.contact_email,
      claimantPhone: claim.contact_phone,
      submittedAt: new Date(),
      claimId: claim.id,
    });
    return { ok: true, status: "pending" };
  });
}

export async function adminClaimRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/claims", async (request) => {
    const q = z
      .object({
        spaId: z.coerce.number().int().positive().optional(),
        status: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
        claimId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().positive().default(20),
      })
      .parse(request.query);
    const pageSize = [10, 20, 30, 40, 50].includes(q.pageSize) ? q.pageSize : 20;
    const offset = (q.page - 1) * pageSize;
    const where: string[] = ["1=1"];
    const args: unknown[] = [];
    if (q.spaId) {
      where.push("c.spa_id = ?");
      args.push(q.spaId);
    }
    if (q.status) {
      where.push("c.status = ?");
      args.push(q.status);
    }
    if (q.claimId) {
      where.push("c.id = ?");
      args.push(q.claimId);
    }
    const whereSql = where.join(" AND ");
    const totalRow = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM spa_claims c WHERE ${whereSql}`,
      args
    );
    const rows = await query<
      ClaimRow & {
        spa_name: string;
        slug: string;
        clinic_code: string;
        owner_email: string;
        owner_name: string;
        business_name: string;
      }
    >(
      `SELECT c.*, s.name AS spa_name, s.slug, s.clinic_code,
         u.email AS owner_email, u.name AS owner_name, v.business_name
       FROM spa_claims c
       JOIN spas s ON s.id = c.spa_id
       JOIN vendors v ON v.id = c.vendor_id
       JOIN users u ON u.id = v.user_id
       WHERE ${whereSql}
       ORDER BY FIELD(c.status,'pending','draft','approved','rejected'), c.submitted_at DESC, c.id DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      args
    );
    return {
      items: rows.map((r) => ({
        ...publicClaim(r),
        spaName: r.spa_name,
        slug: r.slug,
        clinicCode: r.clinic_code,
        ownerEmail: r.owner_email,
        ownerName: r.owner_name,
        businessName: r.business_name,
        decidedAt: r.decided_at,
      })),
      page: q.page,
      pageSize,
      total: Number(totalRow?.n ?? 0),
    };
  });

  app.get("/admin/claims/:id", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const row = await queryOne<
      ClaimRow & {
        spa_name: string;
        slug: string;
        clinic_code: string;
        spa_vendor_id: number | null;
        owner_email: string;
        owner_name: string;
        business_name: string;
      }
    >(
      `SELECT c.*, s.name AS spa_name, s.slug, s.clinic_code, s.vendor_id AS spa_vendor_id,
         u.email AS owner_email, u.name AS owner_name, v.business_name
       FROM spa_claims c
       JOIN spas s ON s.id = c.spa_id
       JOIN vendors v ON v.id = c.vendor_id
       JOIN users u ON u.id = v.user_id
       WHERE c.id = ?`,
      [claimId]
    );
    if (!row) return reply.code(404).send({ error: "Claim not found" });
    const notes = await query<{
      id: number;
      body: string;
      created_at: Date | string;
      admin_name: string;
      admin_email: string;
    }>(
      `SELECT n.id, n.body, n.created_at, u.name AS admin_name, u.email AS admin_email
       FROM spa_claim_notes n JOIN users u ON u.id = n.admin_user_id
       WHERE n.claim_id = ? ORDER BY n.id DESC`,
      [claimId]
    );
    const otps = await query<{
      id: number;
      email: string;
      code: string;
      expires_at: Date | string;
      consumed_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT id, email, code, expires_at, consumed_at, created_at
       FROM spa_claim_otps WHERE claim_id = ? ORDER BY id DESC LIMIT 20`,
      [claimId]
    );
    const pendingCount = await queryOne<{ n: number }>(
      "SELECT COUNT(*) AS n FROM spa_claims WHERE spa_id = ? AND status = 'pending'",
      [row.spa_id]
    );
    return {
      ...publicClaim(row),
      claimantNotes: row.notes,
      spaName: row.spa_name,
      slug: row.slug,
      clinicCode: row.clinic_code,
      spaVendorId: row.spa_vendor_id,
      ownerEmail: row.owner_email,
      ownerName: row.owner_name,
      businessName: row.business_name,
      decidedAt: row.decided_at,
      pendingClaimsForSpa: Number(pendingCount?.n ?? 0),
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
        adminName: n.admin_name,
        adminEmail: n.admin_email,
      })),
      otps: otps.map((o) => ({
        id: o.id,
        email: o.email,
        code: o.code,
        expiresAt: o.expires_at,
        consumedAt: o.consumed_at,
        createdAt: o.created_at,
      })),
    };
  });

  app.get("/admin/claims/:id/document", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const row = await queryOne<{ document_path: string; document_name: string; document_mime: string }>(
      "SELECT document_path, document_name, document_mime FROM spa_claims WHERE id = ?",
      [claimId]
    );
    if (!row?.document_path) return reply.code(404).send({ error: "No document on this claim" });
    reply.header("Content-Type", row.document_mime || "application/octet-stream");
    reply.header(
      "Content-Disposition",
      `attachment; filename="${(row.document_name || "document").replace(/"/g, "")}"`
    );
    return reply.send(createReadStream(claimDocumentDiskPath(row.document_path)));
  });

  app.post("/admin/claims/:id/notes", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const body = z.object({ body: z.string().trim().min(1).max(4000) }).parse(request.body);
    const exists = await queryOne("SELECT id FROM spa_claims WHERE id = ?", [claimId]);
    if (!exists) return reply.code(404).send({ error: "Claim not found" });
    await execute("INSERT INTO spa_claim_notes (claim_id, admin_user_id, body) VALUES (?,?,?)", [
      claimId,
      request.user!.id,
      body.body,
    ]);
    return { ok: true };
  });

  app.post("/admin/claims/:id/approve", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const claim = await queryOne<ClaimRow>("SELECT * FROM spa_claims WHERE id = ?", [claimId]);
    if (!claim) return reply.code(404).send({ error: "Claim not found" });
    if (claim.status !== "pending") return reply.code(409).send({ error: "Only pending claims can be approved" });

    const spa = await queryOne<{ vendor_id: number | null; name: string; slug: string }>(
      "SELECT vendor_id, name, slug FROM spas WHERE id = ?",
      [claim.spa_id]
    );
    if (!spa) return reply.code(404).send({ error: "Clinic not found" });
    if (spa.vendor_id != null && spa.vendor_id !== claim.vendor_id) {
      return reply.code(409).send({ error: "This clinic already has an owner" });
    }

    const competing = await query<ClaimRow>(
      "SELECT * FROM spa_claims WHERE spa_id = ? AND id != ? AND status = 'pending'",
      [claim.spa_id, claim.id]
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute("UPDATE spas SET vendor_id = ? WHERE id = ?", [claim.vendor_id, claim.spa_id]);
      await conn.execute("UPDATE vendors SET status = 'approved' WHERE id = ?", [claim.vendor_id]);
      await conn.execute(
        "UPDATE spa_claims SET status = 'approved', decided_at = UTC_TIMESTAMP(), decided_by_user_id = ? WHERE id = ?",
        [request.user!.id, claim.id]
      );
      await conn.execute(
        `UPDATE spa_claims
         SET status = 'rejected',
             rejection_note = 'Another claim was approved for this clinic.',
             decided_at = UTC_TIMESTAMP(),
             decided_by_user_id = ?
         WHERE spa_id = ? AND id != ? AND status IN ('pending','draft')`,
        [request.user!.id, claim.spa_id, claim.id]
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await notifyClaimApproved({
      to: claim.contact_email,
      name: claim.contact_name,
      clinicName: spa.name,
      spaId: claim.spa_id,
    });
    for (const loser of competing) {
      await notifyClaimRejected({
        to: loser.contact_email,
        name: loser.contact_name,
        clinicName: spa.name,
        slug: spa.slug,
        rejectionNote: loser.rejection_note || "Another claim was approved for this clinic.",
      });
    }
    return { ok: true };
  });

  app.post("/admin/claims/:id/reject", async (request, reply) => {
    const claimId = Number((request.params as { id: string }).id);
    const body = z.object({ note: z.string().trim().min(3).max(2000) }).parse(request.body);
    const claim = await queryOne<ClaimRow>("SELECT * FROM spa_claims WHERE id = ?", [claimId]);
    if (!claim) return reply.code(404).send({ error: "Claim not found" });
    if (claim.status !== "pending") return reply.code(409).send({ error: "Only pending claims can be rejected" });
    const spa = await queryOne<{ name: string; slug: string }>("SELECT name, slug FROM spas WHERE id = ?", [
      claim.spa_id,
    ]);
    await execute(
      `UPDATE spa_claims
       SET status = 'rejected', rejection_note = ?, decided_at = UTC_TIMESTAMP(), decided_by_user_id = ?
       WHERE id = ?`,
      [body.note, request.user!.id, claim.id]
    );
    if (spa) {
      await notifyClaimRejected({
        to: claim.contact_email,
        name: claim.contact_name,
        clinicName: spa.name,
        slug: spa.slug,
        rejectionNote: body.note,
      });
    }
    return { ok: true };
  });
}
