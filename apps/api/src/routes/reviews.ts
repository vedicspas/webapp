import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Review, ReviewAspectId, ReviewListResponse, ReviewPhoto } from "@vedic/shared";
import {
  MAX_REVIEWS_PER_SPA_USER,
  REVIEW_ASPECTS,
  emptyAspectScores,
} from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";
import { config } from "../config.js";
import {
  aspectValues,
  parseCreateReviewJson,
  visitedOnFrom,
} from "../lib/reviewValidation.js";
import { summarizeReviews, type ReviewStatRow } from "../lib/reviewStats.js";
import { saveReviewPhotos, safeReviewPhotoName } from "../lib/reviewPhotos.js";

interface ReviewRow {
  id: number;
  spa_id: number;
  rating: number;
  rating_treatments: number | null;
  rating_practitioners: number | null;
  rating_staff: number | null;
  rating_food: number | null;
  rating_accommodations: number | null;
  rating_cleanliness: number | null;
  rating_location: number | null;
  rating_transport: number | null;
  rating_communication: number | null;
  rating_value: number | null;
  recommends: number | null;
  title: string;
  body: string;
  visited_on: string | null;
  created_at: string;
  user_id: number;
  username: string;
  user_name: string;
  avatar_url: string | null;
  user_bio: string | null;
  user_created_at: string;
  response_id: number | null;
  response_body: string | null;
  response_created_at: string | null;
  responder_name: string | null;
}

const ASPECT_COLUMNS = REVIEW_ASPECTS.map((a) => `rv.${a.column}`).join(", ");

const REVIEW_SELECT = `
  SELECT rv.id, rv.spa_id, rv.rating, ${ASPECT_COLUMNS},
    rv.recommends, rv.title, rv.body, rv.visited_on, rv.created_at,
    u.id AS user_id, u.username, u.name AS user_name, u.avatar_url, u.bio AS user_bio,
    u.created_at AS user_created_at,
    rr.id AS response_id, rr.body AS response_body, rr.created_at AS response_created_at,
    ru.name AS responder_name
  FROM reviews rv
  JOIN users u ON u.id = rv.user_id
  LEFT JOIN review_responses rr ON rr.review_id = rv.id
  LEFT JOIN users ru ON ru.id = rr.user_id
`;

function numOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function aspectsFromRow(row: ReviewRow): Record<ReviewAspectId, number | null> {
  const aspects = emptyAspectScores();
  for (const aspect of REVIEW_ASPECTS) {
    const key = `rating_${aspect.id}` as keyof ReviewRow;
    aspects[aspect.id] = numOrNull(row[key] as number | null);
  }
  return aspects;
}

export async function photosByReview(reviewIds: number[]): Promise<Map<number, ReviewPhoto[]>> {
  const map = new Map<number, ReviewPhoto[]>();
  if (reviewIds.length === 0) return map;
  const rows = await query<{
    id: number;
    review_id: number;
    url: string;
    alt: string;
    sort_order: number;
  }>(
    `SELECT id, review_id, url, alt, sort_order FROM review_photos
     WHERE review_id IN (${reviewIds.map(() => "?").join(",")}) ORDER BY sort_order, id`,
    reviewIds
  );
  for (const row of rows) {
    const list = map.get(row.review_id) ?? [];
    list.push({ id: row.id, url: row.url, alt: row.alt, sortOrder: row.sort_order });
    map.set(row.review_id, list);
  }
  return map;
}

export function toReview(row: ReviewRow, photos: ReviewPhoto[] = []): Review {
  return {
    id: row.id,
    spaId: row.spa_id,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    visitedOn: row.visited_on ? new Date(row.visited_on).toISOString().slice(0, 7) : null,
    recommends: row.recommends == null ? null : Boolean(row.recommends),
    aspects: aspectsFromRow(row),
    photos,
    createdAt: new Date(row.created_at).toISOString(),
    user: {
      id: row.user_id,
      username: row.username,
      name: row.user_name,
      avatarUrl: row.avatar_url,
      bio: row.user_bio,
      createdAt: new Date(row.user_created_at).toISOString(),
    },
    response: row.response_id
      ? {
          id: row.response_id,
          body: row.response_body!,
          createdAt: new Date(row.response_created_at!).toISOString(),
          responderName: row.responder_name ?? "Management",
        }
      : null,
  };
}

async function loadReview(id: number): Promise<Review | null> {
  const row = await queryOne<ReviewRow>(`${REVIEW_SELECT} WHERE rv.id = ?`, [id]);
  if (!row) return null;
  const photos = await photosByReview([id]);
  return toReview(row, photos.get(id) ?? []);
}

async function readSubmit(request: FastifyRequest): Promise<{
  payload: unknown;
  files: Array<{ filename: string; mimetype: string; buffer: Buffer }>;
}> {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.includes("multipart/form-data")) {
    return { payload: request.body, files: [] };
  }
  const files: Array<{ filename: string; mimetype: string; buffer: Buffer }> = [];
  let payloadRaw: string | undefined;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      if (part.fieldname === "photos") {
        files.push({ filename: part.filename, mimetype: part.mimetype, buffer });
      }
    } else if (part.fieldname === "payload") {
      payloadRaw = String(part.value);
    }
  }
    if (!payloadRaw) {
      throw Object.assign(new Error("Missing review payload"), { statusCode: 400 });
    }
    try {
      return { payload: JSON.parse(payloadRaw) as unknown, files };
    } catch {
      throw Object.assign(new Error("Invalid review payload"), { statusCode: 400 });
    }
}

async function summaryForSpa(spaId: number) {
  const rows = await query<
    ReviewRow & { recommends: number | null }
  >(
    `SELECT rating, recommends, ${REVIEW_ASPECTS.map((a) => a.column).join(", ")}
     FROM reviews WHERE spa_id = ? AND status = 'published'`,
    [spaId]
  );
  const mapped: ReviewStatRow[] = rows.map((row) => ({
    rating: Number(row.rating),
    recommends: row.recommends,
    aspects: aspectsFromRow(row as ReviewRow),
  }));
  return summarizeReviews(mapped);
}

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/uploads/reviews/:file", async (request, reply) => {
    const name = safeReviewPhotoName((request.params as { file: string }).file);
    if (!name) return reply.code(400).send({ error: "Invalid file" });
    const path = join(config.reviewUploadDir, name);
    try {
      await stat(path);
    } catch {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.type("image/webp").send(createReadStream(path));
  });

  app.get("/spas/:slug/reviews", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { page = 1 } = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(request.query);

    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const pageSize = 10;
    const [rows, count, summary] = await Promise.all([
      query<ReviewRow>(
        `${REVIEW_SELECT} WHERE rv.spa_id = ? AND rv.status = 'published'
         ORDER BY rv.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        [spa.id]
      ),
      queryOne<{ total: number }>(
        "SELECT COUNT(*) AS total FROM reviews WHERE spa_id = ? AND status = 'published'",
        [spa.id]
      ),
      summaryForSpa(spa.id),
    ]);
    const photos = await photosByReview(rows.map((r) => r.id));
    const body: ReviewListResponse = {
      items: rows.map((r) => toReview(r, photos.get(r.id) ?? [])),
      page,
      pageSize,
      total: Number(count?.total ?? 0),
      summary,
    };
    return body;
  });

  app.post("/spas/:slug/reviews", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) return;
    const { slug } = request.params as { slug: string };
    let parsed;
    let files: Array<{ filename: string; mimetype: string; buffer: Buffer }>;
    try {
      const submitted = await readSubmit(request);
      files = submitted.files;
      parsed = parseCreateReviewJson(submitted.payload);
    } catch (err) {
      if ((err as { name?: string }).name === "ZodError") throw err;
      const message = err instanceof Error ? err.message : "Invalid review";
      const status = (err as { statusCode?: number }).statusCode ?? 400;
      return reply.code(status).send({ error: message });
    }

    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const existing = await queryOne<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reviews WHERE spa_id = ? AND user_id = ?",
      [spa.id, request.user.id]
    );
    if (Number(existing?.total ?? 0) >= MAX_REVIEWS_PER_SPA_USER) {
      return reply
        .code(409)
        .send({ error: `You can publish at most ${MAX_REVIEWS_PER_SPA_USER} reviews for this clinic` });
    }

    let visitedOn: string | null;
    try {
      visitedOn = visitedOnFrom(parsed);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : "Invalid visit date" });
    }

    const aspects = aspectValues(parsed);
    const photoUrls = await saveReviewPhotos(files);

    const result = await execute(
      `INSERT INTO reviews (
         spa_id, user_id, rating,
         rating_treatments, rating_practitioners, rating_staff, rating_food, rating_accommodations,
         rating_cleanliness, rating_location, rating_transport, rating_communication, rating_value,
         recommends, confirmed_genuine, title, body, visited_on, status
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,'published')`,
      [
        spa.id,
        request.user.id,
        parsed.rating,
        aspects.treatments,
        aspects.practitioners,
        aspects.staff,
        aspects.food,
        aspects.accommodations,
        aspects.cleanliness,
        aspects.location,
        aspects.transport,
        aspects.communication,
        aspects.value,
        parsed.recommends ? 1 : 0,
        parsed.title,
        parsed.body,
        visitedOn,
      ]
    );

    const reviewId = result.insertId;
    for (const [i, url] of photoUrls.entries()) {
      await execute("INSERT INTO review_photos (review_id, url, alt, sort_order) VALUES (?,?,?,?)", [
        reviewId,
        url,
        "",
        i,
      ]);
    }

    const created = await loadReview(reviewId);
    if (!created) return reply.code(500).send({ error: "Failed to load the created review" });
    return reply.code(201).send(created);
  });

  app.post("/reviews/:id/response", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) return;
    const reviewId = Number((request.params as { id: string }).id);
    const body = z.object({ body: z.string().min(3) }).parse(request.body);

    const owner = await queryOne<{ vendor_user_id: number }>(
      `SELECT v.user_id AS vendor_user_id
       FROM reviews rv JOIN spas s ON s.id = rv.spa_id JOIN vendors v ON v.id = s.vendor_id
       WHERE rv.id = ?`,
      [reviewId]
    );
    if (!owner) return reply.code(404).send({ error: "Review not found" });
    if (owner.vendor_user_id !== request.user.id && request.user.role !== "admin") {
      return reply.code(403).send({ error: "Only the spa owner can respond to this review" });
    }

    await execute(
      "INSERT INTO review_responses (review_id, user_id, body) VALUES (?,?,?) ON DUPLICATE KEY UPDATE body = VALUES(body)",
      [reviewId, request.user.id, body.body]
    );
    const updated = await loadReview(reviewId);
    if (!updated) return reply.code(404).send({ error: "Review not found" });
    return reply.code(201).send(updated);
  });
}
