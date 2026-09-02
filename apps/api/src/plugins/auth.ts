import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import type { RoleCode } from "@vedic/shared";
import { config } from "../config.js";

const secret = new TextEncoder().encode(config.authSecret);

export interface AuthUser {
  id: number;
  email: string;
  role: RoleCode;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

export async function signApiToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function readToken(request: FastifyRequest): Promise<AuthUser | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), secret);
    return {
      id: Number(payload.sub),
      email: String(payload.email),
      role: payload.role as RoleCode,
    };
  } catch {
    return null;
  }
}

/** preHandler: populates request.user when a valid token is present. */
export async function optionalAuth(request: FastifyRequest): Promise<void> {
  request.user = await readToken(request);
}

/** preHandler: rejects the request when no valid token is present. */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (request.method === "OPTIONS") return;
  request.user = await readToken(request);
  if (!request.user) {
    reply.code(401).send({ error: "Authentication required" });
  }
}
