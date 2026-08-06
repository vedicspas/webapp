import type { FastifyInstance } from "fastify";
import { staticCache } from "../cache/staticCache.js";

export async function metaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({ ok: true }));

  // All static lookup tables, served straight from the in-memory cache.
  app.get("/meta", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300");
    return staticCache.toMeta();
  });
}
