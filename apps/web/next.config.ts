import type { NextConfig } from "next";
import { config as loadEnv } from "dotenv";
import { join } from "node:path";

// Single source of truth for configuration: the repo-root .env file.
loadEnv({ path: join(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (apps/web/Dockerfile).
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
      { protocol: "https", hostname: "cdn.shopify.com" },
      ...apiUploadPattern(),
    ],
  },
};

function apiUploadPattern(): NonNullable<NextConfig["images"]>["remotePatterns"] {
  try {
    const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100");
    return [
      {
        protocol: api.protocol.replace(":", "") as "http" | "https",
        hostname: api.hostname,
        ...(api.port ? { port: api.port } : {}),
        pathname: "/uploads/**",
      },
    ];
  } catch {
    return [];
  }
}

export default nextConfig;
