import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { SiteSettings } from "@vedic/shared";
import { execute, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { sendContactNotification } from "../lib/mail.js";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe = /^[+]?[\d\s().-]{7,20}$/;

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

const guestBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(255).regex(emailRe, "Invalid email"),
  phone: z.string().trim().min(1).max(32),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

const authedBody = z.object({
  phone: z.string().trim().min(1).max(32),
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(5000),
});

function assertPhone(phone: string): void {
  const digits = phoneDigits(phone);
  if (!phoneRe.test(phone) || digits.length < 7 || digits.length > 15) {
    throw Object.assign(new Error("Invalid phone number"), { statusCode: 400 });
  }
}

export async function contactRoutes(app: FastifyInstance): Promise<void> {
  app.get("/site-settings", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    const settings: SiteSettings = staticCache.siteSettings;
    return settings;
  });

  app.post("/contact", async (request, reply) => {
    const authed = request.user;
    let name: string;
    let email: string;
    let phone: string;
    let subject: string;
    let message: string;

    if (authed) {
      const parsed = authedBody.parse(request.body);
      assertPhone(parsed.phone);
      const user = await queryOne<{ name: string; email: string }>(
        "SELECT name, email FROM users WHERE id = ?",
        [authed.id]
      );
      if (!user) {
        return reply.code(401).send({ error: "Authentication required" });
      }
      name = user.name;
      email = user.email;
      phone = parsed.phone;
      subject = parsed.subject;
      message = parsed.message;
    } else {
      const parsed = guestBody.parse(request.body);
      assertPhone(parsed.phone);
      name = parsed.name;
      email = parsed.email;
      phone = parsed.phone;
      subject = parsed.subject;
      message = parsed.message;
    }

    await execute(
      "INSERT INTO contact_messages (user_id, name, email, phone, subject, message) VALUES (?,?,?,?,?,?)",
      [authed?.id ?? null, name, email, phone, subject, message]
    );

    const to = staticCache.siteSettings.contactEmail;
    if (!to) {
      return { ok: true, emailed: false };
    }

    try {
      const emailed = await sendContactNotification({
        to,
        fromName: name,
        fromEmail: email,
        phone,
        subject,
        message,
      });
      return { ok: true, emailed: emailed === "sent" };
    } catch (err) {
      request.log.error(err);
      return { ok: true, emailed: false };
    }
  });
}
