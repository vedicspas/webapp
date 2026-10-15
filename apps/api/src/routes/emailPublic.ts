import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { addUnsubscribe, readEmailToken } from "../lib/mailer.js";

export async function emailPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/unsubscribe", async (request, reply) => {
    const q = z.object({ token: z.string().min(1) }).safeParse(request.query);
    if (!q.success) return reply.code(400).send({ error: "Missing unsubscribe token" });
    const email = await readEmailToken(q.data.token, "unsub");
    if (!email) return reply.code(400).send({ error: "This unsubscribe link is invalid or expired." });
    await addUnsubscribe(email);
    return { ok: true, email };
  });
}
