import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { SessionUser } from "@vedic/shared";
import { execute, queryOne } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";
import { signApiToken } from "../plugins/auth.js";

interface UserRow {
  id: number;
  email: string;
  password_hash: string | null;
  name: string;
  username: string;
  avatar_url: string | null;
  role_code: string;
}

const USER_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.name, u.username, u.avatar_url, r.code AS role_code
  FROM users u JOIN roles r ON r.id = u.role_id
`;

async function sessionPayload(row: UserRow): Promise<{ user: SessionUser; apiToken: string }> {
  const user: SessionUser = {
    id: row.id,
    email: row.email,
    name: row.name,
    username: row.username,
    role: row.role_code as SessionUser["role"],
    avatarUrl: row.avatar_url,
  };
  const apiToken = await signApiToken({ id: row.id, email: row.email, role: user.role });
  return { user, apiToken };
}

function usernameFrom(email: string): string {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40) || "user";
  return `${base}${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/register", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1).max(120),
      })
      .parse(request.body);

    const existing = await queryOne("SELECT id FROM users WHERE email = ?", [body.email]);
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }

    const roleId = (await staticCache.requireRole("traveler")).id;
    const hash = await bcrypt.hash(body.password, 10);
    const result = await execute(
      "INSERT INTO users (role_id, email, password_hash, name, username) VALUES (?,?,?,?,?)",
      [roleId, body.email, hash, body.name, usernameFrom(body.email)]
    );
    const row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ?`, [result.insertId]);
    if (!row) {
      return reply.code(500).send({ error: "Failed to load the created account" });
    }
    return sessionPayload(row);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = z
      .object({ email: z.string().email(), password: z.string() })
      .parse(request.body);

    const row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.email = ?`, [body.email]);
    if (!row?.password_hash || !(await bcrypt.compare(body.password, row.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    return sessionPayload(row);
  });

  // Upsert used by the Auth.js Google provider on the web app.
  app.post("/auth/oauth", async (request, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1).max(120),
        avatarUrl: z.string().url().nullable().optional(),
      })
      .parse(request.body);

    let row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.email = ?`, [body.email]);
    if (!row) {
      const roleId = (await staticCache.requireRole("traveler")).id;
      const result = await execute(
        "INSERT INTO users (role_id, email, name, username, avatar_url) VALUES (?,?,?,?,?)",
        [roleId, body.email, body.name, usernameFrom(body.email), body.avatarUrl ?? null]
      );
      row = await queryOne<UserRow>(`${USER_SELECT} WHERE u.id = ?`, [result.insertId]);
    }
    if (!row) {
      return reply.code(500).send({ error: "Failed to load the created account" });
    }
    return sessionPayload(row);
  });
}
