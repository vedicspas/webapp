import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Answer, Question } from "@vedic/shared";
import { execute, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";

interface QuestionRow {
  id: number;
  spa_id: number;
  body: string;
  created_at: string;
  user_id: number;
  username: string;
  user_name: string;
  avatar_url: string | null;
  user_created_at: string;
}

interface AnswerRow extends QuestionRow {
  question_id: number;
  is_vendor: number;
}

function publicUser(row: QuestionRow) {
  return {
    id: row.user_id,
    username: row.username,
    name: row.user_name,
    avatarUrl: row.avatar_url,
    bio: null,
    createdAt: new Date(row.user_created_at).toISOString(),
  };
}

export async function questionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/spas/:slug/questions", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const questions = await query<QuestionRow>(
      `SELECT q.id, q.spa_id, q.body, q.created_at,
         u.id AS user_id, u.username, u.name AS user_name, u.avatar_url, u.created_at AS user_created_at
       FROM questions q JOIN users u ON u.id = q.user_id
       WHERE q.spa_id = ? ORDER BY q.created_at DESC LIMIT 50`,
      [spa.id]
    );

    let answers: AnswerRow[] = [];
    if (questions.length > 0) {
      answers = await query<AnswerRow>(
        `SELECT a.id, a.question_id, a.is_vendor, a.body, a.created_at,
           u.id AS user_id, u.username, u.name AS user_name, u.avatar_url, u.created_at AS user_created_at
         FROM answers a JOIN users u ON u.id = a.user_id
         WHERE a.question_id IN (${questions.map(() => "?").join(",")})
         ORDER BY a.created_at`,
        questions.map((q) => q.id)
      );
    }

    const result: Question[] = questions.map((q) => ({
      id: q.id,
      spaId: q.spa_id,
      body: q.body,
      createdAt: new Date(q.created_at).toISOString(),
      user: publicUser(q),
      answers: answers
        .filter((a) => a.question_id === q.id)
        .map(
          (a): Answer => ({
            id: a.id,
            body: a.body,
            isVendor: Boolean(a.is_vendor),
            createdAt: new Date(a.created_at).toISOString(),
            user: publicUser(a),
          })
        ),
    }));
    return result;
  });

  app.post("/spas/:slug/questions", { preHandler: requireAuth }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const body = z.object({ body: z.string().min(5) }).parse(request.body);

    const spa = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
    if (!spa) return reply.code(404).send({ error: "Spa not found" });

    const result = await execute("INSERT INTO questions (spa_id, user_id, body) VALUES (?,?,?)", [
      spa.id,
      request.user!.id,
      body.body,
    ]);
    return reply.code(201).send({ id: result.insertId });
  });

  app.post("/questions/:id/answers", { preHandler: requireAuth }, async (request, reply) => {
    const questionId = Number((request.params as { id: string }).id);
    const body = z.object({ body: z.string().min(2) }).parse(request.body);

    const question = await queryOne<{ spa_id: number; vendor_user_id: number }>(
      `SELECT q.spa_id, v.user_id AS vendor_user_id
       FROM questions q JOIN spas s ON s.id = q.spa_id JOIN vendors v ON v.id = s.vendor_id
       WHERE q.id = ?`,
      [questionId]
    );
    if (!question) return reply.code(404).send({ error: "Question not found" });

    const isVendor = question.vendor_user_id === request.user!.id;
    const result = await execute(
      "INSERT INTO answers (question_id, user_id, is_vendor, body) VALUES (?,?,?,?)",
      [questionId, request.user!.id, isVendor ? 1 : 0, body.body]
    );
    return reply.code(201).send({ id: result.insertId });
  });
}
