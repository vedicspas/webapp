import type { FastifyRequest } from "fastify";

export function turnstileSecret(): string {
  return process.env.TURNSTILE_SECRET?.trim() ?? "";
}

export function turnstileSiteKey(): string | null {
  const key = process.env.TURNSTILE_SITE_KEY?.trim();
  return key || null;
}

function clientIp(request: FastifyRequest): string | undefined {
  const cf = request.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.trim()) return cf.trim();
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim();
  }
  return request.ip;
}

/** When the secret is set, a valid one-time Turnstile token is required. */
export async function assertTurnstile(request: FastifyRequest, token: string | undefined): Promise<void> {
  const secret = turnstileSecret();
  if (!secret) return;
  const response = token?.trim() ?? "";
  if (!response) {
    throw Object.assign(new Error("Please confirm you are human."), { statusCode: 400 });
  }
  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", response);
  const ip = clientIp(request);
  if (ip) body.set("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
  if (!data?.success) {
    throw Object.assign(new Error("Captcha failed. Please try again."), { statusCode: 400 });
  }
}
