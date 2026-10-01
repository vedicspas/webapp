import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  MAX_REVIEW_PHOTOS,
  MAX_REVIEW_PHOTO_BYTES,
} from "@vedic/shared";
import { config } from "../config.js";

export type SniffedImage = "jpeg" | "png" | "webp";

export function sniffImage(buffer: Buffer): SniffedImage | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  if (riff === "RIFF" && webp === "WEBP") return "webp";
  return null;
}

export function allowedExtension(filename: string, kind: SniffedImage): boolean {
  const ext = filename.toLowerCase().replace(/^.*(\.[a-z0-9]+)$/, "$1");
  if (kind === "jpeg") return ext === ".jpg" || ext === ".jpeg";
  if (kind === "png") return ext === ".png";
  return ext === ".webp";
}

export function allowedMime(mime: string, kind: SniffedImage): boolean {
  const normalized = mime.toLowerCase().split(";")[0].trim();
  if (kind === "jpeg") return normalized === "image/jpeg" || normalized === "image/jpg";
  if (kind === "png") return normalized === "image/png";
  return normalized === "image/webp";
}

export async function compressReviewPhoto(buffer: Buffer): Promise<Buffer> {
  // Keep aspect ratio, never enlarge, cap the long edge, encode as lightweight WebP.
  return sharp(buffer, { failOn: "truncated" })
    .rotate()
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();
}

export function validatePhotoUpload(opts: {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}): { ok: true } | { ok: false; error: string } {
  if (opts.buffer.length === 0) return { ok: false, error: "Empty image file" };
  if (opts.buffer.length > MAX_REVIEW_PHOTO_BYTES) {
    return { ok: false, error: "Each photo must be 5 MB or smaller" };
  }
  const kind = sniffImage(opts.buffer);
  if (!kind) return { ok: false, error: "Photos must be JPEG, PNG, or WebP" };
  if (!allowedExtension(opts.filename, kind)) {
    return { ok: false, error: "Photo extension does not match the file contents" };
  }
  if (opts.mimetype && !allowedMime(opts.mimetype, kind)) {
    return { ok: false, error: "Photo type does not match the file contents" };
  }
  return { ok: true };
}

export async function saveReviewPhotos(
  files: Array<{ filename: string; mimetype: string; buffer: Buffer }>
): Promise<string[]> {
  if (files.length > MAX_REVIEW_PHOTOS) {
    throw Object.assign(new Error("You can attach at most 5 photographs"), { statusCode: 400 });
  }
  await mkdir(config.reviewUploadDir, { recursive: true });
  const urls: string[] = [];
  for (const file of files) {
    const check = validatePhotoUpload(file);
    if (!check.ok) {
      throw Object.assign(new Error(check.error), { statusCode: 400 });
    }
    let compressed: Buffer;
    try {
      compressed = await compressReviewPhoto(file.buffer);
    } catch {
      throw Object.assign(new Error("Could not read this image. Try a different JPEG, PNG, or WebP."), {
        statusCode: 400,
      });
    }
    const name = `${randomUUID()}.webp`;
    await writeFile(join(config.reviewUploadDir, name), compressed);
    urls.push(`${config.apiOrigin}/uploads/reviews/${name}`);
  }
  return urls;
}

export function safeReviewPhotoName(name: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(name)
    ? name
    : null;
}
