import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { execute, query, queryOne } from "../db/pool.js";
import { requireAuth } from "../plugins/auth.js";
import { publicPhotoUrl } from "../lib/uploads.js";
import { deleteLocalAvatar, saveAvatarFile } from "../lib/avatars.js";
import { issueSessionForUserId } from "./auth.js";

const nameSchema = z.string().trim().min(1, "Enter your name").max(120);

function multipartValue(part: { value?: unknown }): string {
  return String(part.value ?? "");
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get("/users/me", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) return;
    const { user } = await issueSessionForUserId(request.user.id);
    return { user };
  });

  app.patch("/users/me", { preHandler: requireAuth }, async (request, reply) => {
    if (!request.user) return;
    const contentType = String(request.headers["content-type"] ?? "");
    let name: string | undefined;
    let avatar:
      | { filename: string; mimetype: string; buffer: Buffer }
      | undefined;

    if (contentType.includes("multipart/form-data")) {
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (part.fieldname !== "avatar" || !part.filename) {
            await part.toBuffer();
            continue;
          }
          avatar = {
            filename: part.filename,
            mimetype: part.mimetype,
            buffer: await part.toBuffer(),
          };
        } else if (part.fieldname === "name") {
          name = multipartValue(part);
        }
      }
    } else {
      const body = z.object({ name: nameSchema }).parse(request.body);
      name = body.name;
    }

    const current = await queryOne<{ name: string; avatar_url: string | null }>(
      "SELECT name, avatar_url FROM users WHERE id = ?",
      [request.user.id]
    );
    if (!current) return reply.code(404).send({ error: "User not found" });

    const nextName = name === undefined ? current.name : nameSchema.parse(name);
    let nextAvatar = current.avatar_url;

    if (avatar) {
      try {
        nextAvatar = await saveAvatarFile(avatar);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode ?? 400;
        return reply.code(status).send({ error: (err as Error).message });
      }
    }

    await execute("UPDATE users SET name = ?, avatar_url = ? WHERE id = ?", [
      nextName,
      nextAvatar,
      request.user.id,
    ]);

    if (avatar && nextAvatar !== current.avatar_url) {
      await deleteLocalAvatar(current.avatar_url);
    }

    const { user } = await issueSessionForUserId(request.user.id);
    return { user };
  });

  // Public profile with review history.
  app.get("/users/:username", async (request, reply) => {
    const { username } = request.params as { username: string };

    const user = await queryOne<{
      id: number;
      username: string;
      name: string;
      email: string;
      avatar_url: string | null;
      bio: string | null;
      created_at: string;
    }>(
      "SELECT id, username, name, email, avatar_url, bio, created_at FROM users WHERE username = ?",
      [username]
    );
    if (!user) return reply.code(404).send({ error: "User not found" });

    const isOwner = request.user?.id === user.id;

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
       WHERE rv.user_id = ? AND rv.status = 'published' ORDER BY rv.created_at DESC LIMIT 50`,
      [user.id]
    );

    return {
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarUrl: publicPhotoUrl(user.avatar_url),
        bio: user.bio,
        createdAt: new Date(user.created_at).toISOString(),
        ...(isOwner ? { email: user.email } : {}),
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
