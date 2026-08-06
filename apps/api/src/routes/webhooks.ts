import type { FastifyInstance } from "fastify";
import { execute, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { stripe } from "../lib/stripe.js";
import { config } from "../config.js";

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Stripe requires the raw request body for signature verification.
  app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body)
    );

    scope.post("/webhooks/stripe", async (request, reply) => {
      if (!stripe) return reply.code(503).send({ error: "Stripe not configured" });

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          request.body as Buffer,
          request.headers["stripe-signature"] as string,
          config.stripe.webhookSecret
        );
      } catch {
        return reply.code(400).send({ error: "Invalid signature" });
      }

      if (
        event.type === "payment_intent.succeeded" ||
        event.type === "payment_intent.payment_failed"
      ) {
        const intent = event.data.object;
        const booking = await queryOne<{ id: number }>(
          "SELECT id FROM bookings WHERE stripe_payment_intent_id = ?",
          [intent.id]
        );
        if (booking) {
          const already = await queryOne(
            "SELECT id FROM payment_events WHERE stripe_event_id = ?",
            [event.id]
          );
          if (!already) {
            await execute(
              "INSERT INTO payment_events (booking_id, stripe_event_id, type, amount_minor) VALUES (?,?,?,?)",
              [booking.id, event.id, event.type, intent.amount_received ?? 0]
            );
            if (event.type === "payment_intent.succeeded") {
              const confirmed = staticCache.bookingStatusByCode("confirmed")!.id;
              await execute(
                "UPDATE bookings SET status_id = ?, paid_minor = paid_minor + ? WHERE id = ?",
                [confirmed, intent.amount_received ?? 0, booking.id]
              );
            }
          }
        }
      }

      return { received: true };
    });
  });
}
