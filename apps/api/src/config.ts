import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Load the repo-root .env (works from src/ via tsx and from dist/ when built),
// then any workspace-local .env as an override.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, "../../../.env") });
loadEnv();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Managed hosts (Railway, PlanetScale, etc.) provide a single connection URL
 * such as mysql://user:pass@host:3306/dbname. It takes precedence over the
 * individual DATABASE_* variables when present.
 */
function dbFromUrl(): DbConfig | null {
  const url = process.env.DATABASE_URL ?? process.env.MYSQL_URL;
  if (!url) return null;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export const config = {
  db:
    dbFromUrl() ??
    ({
      host: required("DATABASE_HOST", "127.0.0.1"),
      port: Number(required("DATABASE_PORT", "3306")),
      user: required("DATABASE_USER", "vedic"),
      password: required("DATABASE_PASSWORD", "vedicpassword"),
      database: required("DATABASE_NAME", "vedic_spas"),
    } satisfies DbConfig),
  // PaaS platforms (Railway, Render, Heroku) inject PORT; API_PORT is the
  // local/docker-compose setting.
  apiPort: Number(process.env.PORT ?? required("API_PORT", "4100")),
  apiOrigin: required("API_ORIGIN", "http://localhost:4000"),
  webOrigin: required("WEB_ORIGIN", "http://localhost:3000"),
  authSecret: required("AUTH_SECRET", "dev-secret-do-not-use-in-production"),
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
    platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? "750"),
    defaultBookingFeeMinor: Number(process.env.DEFAULT_BOOKING_FEE_MINOR ?? "500"),
  },
  // Spa listing photos are stored on the local disk (not S3/blob). Docker
  // mounts a volume here so files survive container rebuilds.
  uploadDir: process.env.UPLOAD_DIR ?? join(here, "../../../uploads"),
};
