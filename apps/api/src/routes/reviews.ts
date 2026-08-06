import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Review } from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";

interface ReviewRow {
  id: number;
  spa_id: number;
  rating: number;
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

const REVIEW_SELECT = `
  SELECT rv.id, rv.spa_id, rv.rating, rv.title, rv.body, rv.visited_on, rv.created_at,
    u.id AS user_id, u.username, u.name AS user_name, u.avatar_url, u.bio AS user_bio,
    u.created_at AS user_created_at,
    rr.id AS response_id, rr.body AS response_body, rr.created_at AS response_created_at,
    ru.name AS responder_name
  FROM reviews rv
  JOIN users u ON u.id = rv.user_id
  LEFT JOIN review_responses rr ON rr.review_id = rv.id
  LEFT JOIN users ru ON ru.id = rr.user_id
`;

export function toReview(row: ReviewRow): Review {
  return {
    id: row.id,
    spaId: row.spa_id,
    rating: row.rating,
    title: row.title,
    body: row.body,
    visitedOn: row.visited_on ? new Date(row.visited_on).toISOString().slice(0, 10) : null,
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

export async function reviewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/spas/:slug/reviews", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const { page = 1 } = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(request.query);

    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const pageSize = 10;
    const [rows, count] = await Promise.all([
      query<ReviewRow>(
        `${REVIEW_SELECT} WHERE rv.spa_id = ? ORDER BY rv.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        [spa.id]
      ),
      queryOne<{ total: number }>("SELECT COUNT(*) AS total FROM reviews WHERE spa_id = ?", [spa.id]),
    ]);

    return { items: rows.map(toReview), page, pageSize, total: Number(count?.total ?? 0) };
  });

  app.post("/spas/:slug/reviews", { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        title: z.string().min(3).max(160),
        body: z.string().min(10),
        visitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .parse(request.body);

    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const result = await execute(
      "INSERT INTO reviews (spa_id, user_id, rating, title, body, visited_on) VALUES (?,?,?,?,?,?)",
      [spa.id, request.user!.id, body.rating, body.title, body.body, body.visitedOn ?? null]
    );
    const row = (await queryOne<ReviewRow>(`${REVIEW_SELECT} WHERE rv.id = ?`, [result.insertId]))!;
    return reply.code(201).send(toReview(row));
  });

  // Vendor response to a review of one of their spas.
  app.post("/reviews/:id/response", { preHandler: requireAuth }, async (request, reply) => {
    const reviewId = Number((request.params as { id: string }).id);
    const body = z.object({ body: z.string().min(3) }).parse(request.body);

    const owner = await queryOne<{ vendor_user_id: number }>(
      `SELECT v.user_id AS vendor_user_id
       FROM reviews rv JOIN spas s ON s.id = rv.spa_id JOIN vendors v ON v.id = s.vendor_id
       WHERE rv.id = ?`,
      [reviewId]
    );
    if (!owner) return reply.code(404).send({ error: "Review not found" });
    if (owner.vendor_user_id !== request.user!.id && request.user!.role !== "admin") {
      return reply.code(403).send({ error: "Only the spa owner can respond to this review" });
    }

    await execute(
      "INSERT INTO review_responses (review_id, user_id, body) VALUES (?,?,?) ON DUPLICATE KEY UPDATE body = VALUES(body)",
      [reviewId, request.user!.id, body.body]
    );
    const row = (await queryOne<ReviewRow>(`${REVIEW_SELECT} WHERE rv.id = ?`, [reviewId]))!;
    return reply.code(201).send(toReview(row));
  });
}
