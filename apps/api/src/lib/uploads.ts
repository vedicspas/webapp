import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

export function publicPhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/uploads/")) return `${config.apiOrigin}${url}`;
  return url;
}

export async function saveSpaPhotoFile(
  spaId: number,
  buffer: Buffer,
  mimeType: string
): Promise<{ relativeUrl: string; absoluteUrl: string }> {
  const ext = MIME_TO_EXT[mimeType];
  if (!ext) {
    throw Object.assign(new Error("Use a JPEG, PNG, WebP, or GIF image"), { statusCode: 400 });
  }
  const dir = join(config.uploadDir, "spas", String(spaId));
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  await writeFile(join(dir, filename), buffer);
  const relativeUrl = `/uploads/spas/${spaId}/${filename}`;
  return { relativeUrl, absoluteUrl: `${config.apiOrigin}${relativeUrl}` };
}

export async function deleteLocalPhoto(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const relative = url.startsWith("http")
    ? (() => {
        try {
          return new URL(url).pathname;
        } catch {
          return "";
        }
      })()
    : url;
  if (!relative.startsWith("/uploads/spas/")) return;
  const diskPath = join(config.uploadDir, relative.replace(/^\/uploads\//, ""));
  try {
    await unlink(diskPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
