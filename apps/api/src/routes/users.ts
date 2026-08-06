import type { FastifyInstance } from "fastify";
import { query, queryOne } from "../db/pool.js";

export async function userRoutes(app: FastifyInstance): Promise<void> {
  // Public profile with review history.
  app.get("/users/:username", async (request, reply) => {
    const { username } = request.params as { username: string };

    const user = await queryOne<{
      id: number;
      username: string;
      name: string;
      avatar_url: string | null;
      bio: string | null;
      created_at: string;
    }>(
      "SELECT id, username, name, avatar_url, bio, created_at FROM users WHERE username = ?",
      [username]
    );
    if (!user) return reply.code(404).send({ error: "User not found" });

    const reviews = await query<{
      id: number;
      rating: number;
      title: string;
      body: string;
      created_at: string;
      spa_name: string;
      spa_slug: string;
    }>(
      `SELECT rv.id, rv.rating, rv.title, rv.body, rv.created_at, s.name AS spa_name, s.slug AS spa_slug
       FROM reviews rv JOIN spas s ON s.id = rv.spa_id
       WHERE rv.user_id = ? ORDER BY rv.created_at DESC LIMIT 50`,
      [user.id]
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        createdAt: new Date(user.created_at).toISOString(),
      },
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        createdAt: new Date(r.created_at).toISOString(),
        spaName: r.spa_name,
        spaSlug: r.spa_slug,
      })),
    };
  });
}
