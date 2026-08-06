// Auth.js session plumbing only - all application endpoints live in the
// standalone Fastify API (apps/api).
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
