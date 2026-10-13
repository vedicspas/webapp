import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_AVATAR_BYTES } from "@vedic/shared";
import { config } from "../config.js";
import { sniffImage, allowedExtension, allowedMime } from "./reviewPhotos.js";

const AVATAR_EDGE = 640;

export function avatarUploadDir(): string {
  return join(config.uploadDir, "avatars");
}

export async function compressAvatar(buffer: Buffer): Promise<Buffer> {
  // Square crop so circular UI never stretches; keep EXIF orientation;
  // cap the edge so the file stays small without a visible quality drop.
  return sharp(buffer, { failOn: "truncated" })
    .rotate()
    .resize({
      width: AVATAR_EDGE,
      height: AVATAR_EDGE,
      fit: "cover",
      position: "centre",
      withoutEnlargement: true,
    })
    .webp({ quality: 85, effort: 4 })
    .toBuffer();
}

export async function saveAvatarFile(opts: {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}): Promise<string> {
  if (opts.buffer.length === 0) {
    throw Object.assign(new Error("Choose a photo to upload"), { statusCode: 400 });
  }
  if (opts.buffer.length > MAX_AVATAR_BYTES) {
    throw Object.assign(new Error("Profile photo must be 5 MB or smaller"), { statusCode: 400 });
  }
  const kind = sniffImage(opts.buffer);
  if (!kind) {
    throw Object.assign(new Error("Use a JPEG, PNG, or WebP photo"), { statusCode: 400 });
  }
  if (opts.filename && !allowedExtension(opts.filename, kind)) {
    throw Object.assign(new Error("Photo extension does not match the file contents"), { statusCode: 400 });
  }
  if (opts.mimetype && !allowedMime(opts.mimetype, kind)) {
    throw Object.assign(new Error("Photo type does not match the file contents"), { statusCode: 400 });
  }
  let compressed: Buffer;
  try {
    compressed = await compressAvatar(opts.buffer);
  } catch {
    throw Object.assign(new Error("Could not read this image. Try a different JPEG, PNG, or WebP."), {
      statusCode: 400,
    });
  }
  const dir = avatarUploadDir();
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  await writeFile(join(dir, name), compressed);
  return `/uploads/avatars/${name}`;
}

export async function deleteLocalAvatar(url: string | null | undefined): Promise<void> {
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
  if (!relative.startsWith("/uploads/avatars/")) return;
  const diskPath = join(config.uploadDir, relative.replace(/^\/uploads\//, ""));
  try {
    await unlink(diskPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
