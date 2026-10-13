import { MAX_AVATAR_BYTES } from "@vedic/shared";

const ALLOWED = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/** Shrink a photo before upload while keeping aspect ratio. Server still square-crops. */
export async function compressImageForUpload(
  file: File,
  opts?: { maxEdge?: number; quality?: number; maxBytes?: number }
): Promise<File> {
  const maxEdge = opts?.maxEdge ?? 1600;
  const quality = opts?.quality ?? 0.86;
  const maxBytes = opts?.maxBytes ?? MAX_AVATAR_BYTES;
  if (file.type && !ALLOWED.has(file.type.toLowerCase())) {
    throw new Error("Use a JPEG, PNG, or WebP photo");
  }
  // Compress first so a large camera photo can still be used.
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Profile photo must be 5 MB or smaller");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Could not read this image. Try a different JPEG, PNG, or WebP.");
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process this image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (next) => (next ? resolve(next) : reject(new Error("Could not compress this image"))),
        "image/jpeg",
        quality
      );
    });
    if (blob.size > maxBytes) {
      throw new Error("Profile photo must be 5 MB or smaller");
    }
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
