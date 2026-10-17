import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export const CLAIM_DOC_DIR = join(dirname(config.uploadDir), "claim-docs");

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

const CLAIM_MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export async function saveClaimDocument(
  claimId: number,
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<{ relativePath: string; fileName: string; mimeType: string }> {
  const ext = CLAIM_MIME_TO_EXT[mimeType];
  if (!ext) {
    throw Object.assign(new Error("Use a PDF, JPEG, PNG, or WebP file"), { statusCode: 400 });
  }
  const dir = join(CLAIM_DOC_DIR, String(claimId));
  await mkdir(dir, { recursive: true });
  const stored = `${randomUUID()}${ext}`;
  await writeFile(join(dir, stored), buffer);
  const safeName = originalName.replace(/[^\w.\- ()]+/g, "_").slice(0, 180) || `document${ext}`;
  return { relativePath: `${claimId}/${stored}`, fileName: safeName, mimeType };
}

export function claimDocumentDiskPath(relativePath: string): string {
  return join(CLAIM_DOC_DIR, relativePath);
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
