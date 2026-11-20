import { execute, queryOne } from "../db/pool.js";
import { saveSpaPhotoFile } from "./uploads.js";

export async function appendUploadedSpaPhoto(
  spaId: number,
  buffer: Buffer,
  mimeType: string,
  title: string
): Promise<{ id: number; url: string; title: string; alt: string }> {
  const max = await queryOne<{ m: number }>(
    "SELECT COALESCE(MAX(sort_order), -1) AS m FROM spa_photos WHERE spa_id = ?",
    [spaId]
  );
  const nextOrder = Number(max?.m ?? -1) + 1;
  const saved = await saveSpaPhotoFile(spaId, buffer, mimeType);
  const caption = title.slice(0, 200);
  const result = await execute(
    "INSERT INTO spa_photos (spa_id, url, alt, sort_order) VALUES (?,?,?,?)",
    [spaId, saved.relativeUrl, caption, nextOrder]
  );
  return { id: result.insertId, url: saved.absoluteUrl, title: caption, alt: caption };
}

export function multipartField(file: { fields?: Record<string, unknown> }, names: string[]): string {
  for (const name of names) {
    const raw = file.fields?.[name];
    if (!raw) continue;
    const one = Array.isArray(raw) ? raw[0] : raw;
    if (one && typeof one === "object" && "value" in one) {
      return String((one as { value?: unknown }).value ?? "");
    }
  }
  return "";
}
