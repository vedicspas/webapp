import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { staticCache } from "./cache/staticCache.js";
import { optionalAuth } from "./plugins/auth.js";
import { metaRoutes } from "./routes/meta.js";
import { authRoutes } from "./routes/auth.js";
import { spaRoutes } from "./routes/spas.js";
import { reviewRoutes } from "./routes/reviews.js";
import { questionRoutes } from "./routes/questions.js";
import { wishlistRoutes } from "./routes/wishlist.js";
import { userRoutes } from "./routes/users.js";
import { bookingRoutes } from "./routes/bookings.js";
import { vendorRoutes } from "./routes/vendor.js";
import { adminRoutes } from "./routes/admin.js";
import { webhookRoutes } from "./routes/webhooks.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: [config.webOrigin],
    credentials: true,
    // Default @fastify/cors methods omit PATCH, which blocks admin approve/suspend
    // and other dashboard updates (browser preflight fails).
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // Load static lookup tables into memory before accepting traffic.
  await staticCache.reload();
  app.log.info(
    `Static cache loaded: ${staticCache.cities.length} cities, ${staticCache.amenities.length} amenities, ${staticCache.treatmentCategories.length} categories`
  );

  app.decorateRequest("user", null);
  app.addHook("preHandler", optionalAuth);

  app.setErrorHandler((error: unknown, _request, reply) => {
    const err = error as { name?: string; message?: string; statusCode?: number };
    if (err.name === "ZodError") {
      return reply
        .code(400)
        .send({ error: "Invalid request", details: JSON.parse(err.message ?? "[]") });
    }
    app.log.error(error);
    return reply.code(err.statusCode ?? 500).send({ error: err.message ?? "Internal error" });
  });

  await app.register(metaRoutes);
  await app.register(authRoutes);
  await app.register(spaRoutes);
  await app.register(reviewRoutes);
  await app.register(questionRoutes);
  await app.register(wishlistRoutes);
  await app.register(userRoutes);
  await app.register(bookingRoutes);
  await app.register(vendorRoutes, { prefix: "" });
  await app.register(adminRoutes);
  await app.register(webhookRoutes);

  // Set HOST=:: on platforms with IPv6 private networking (e.g. Railway).
  await app.listen({ port: config.apiPort, host: process.env.HOST ?? "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
