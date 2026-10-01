import { randomBytes } from "node:crypto";
import { queryOne } from "../db/pool.js";

const SUFFIX_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function formatClinicCode(n: number): string {
  return `AA${String(n).padStart(4, "0")}`;
}

export async function allocateClinicCode(): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const n = randomBytes(2).readUInt16BE(0) % 10000;
    const code = formatClinicCode(n);
    const exists = await queryOne("SELECT id FROM spas WHERE clinic_code = ?", [code]);
    if (!exists) return code;
  }
  for (let n = 0; n < 10000; n++) {
    const code = formatClinicCode(n);
    const exists = await queryOne("SELECT id FROM spas WHERE clinic_code = ?", [code]);
    if (!exists) return code;
  }
  throw new Error("No clinic IDs remaining");
}

export function bookingDateStamp(d = new Date()): string {
  const y = d.getUTCFullYear() % 100;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(2, "0")}${String(m).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function randomSuffix(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) out += SUFFIX_CHARS[bytes[i]! % SUFFIX_CHARS.length];
  return out;
}

export async function allocateBookingCode(clinicCode: string, at = new Date()): Promise<string> {
  const date = bookingDateStamp(at);
  for (let i = 0; i < 40; i++) {
    const code = `${clinicCode}-${date}-${randomSuffix()}`;
    const exists = await queryOne("SELECT id FROM bookings WHERE code = ?", [code]);
    if (!exists) return code;
  }
  throw new Error("Could not allocate a booking reference number");
}

export function isBookingRefFormat(code: string): boolean {
  return /^[A-Z]{2}\d{4}-\d{6}-[A-Z0-9]{4}$/.test(code);
}

/** Strip clinic prefix and spaces so vendors can type a suffix or the rest of the ref. */
export function parseBookingRefInput(raw: string, clinicCode?: string | null): {
  full: string | null;
  suffix: string | null;
  remainder: string | null;
} {
  let q = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!q) return { full: null, suffix: null, remainder: null };
  if (clinicCode) {
    const prefix = clinicCode.toUpperCase();
    if (q.startsWith(prefix)) q = q.slice(prefix.length).replace(/^-+/, "");
  }
  const suffix =
    /^[A-Z0-9]{4}$/.test(q) ? q
    : /^\d{6}-[A-Z0-9]{4}$/.test(q) ? q.slice(-4)
    : /^[A-Z]{2}\d{4}-\d{6}-[A-Z0-9]{4}$/.test(q) ? q.slice(-4)
    : null;
  let full: string | null = null;
  if (/^[A-Z]{2}\d{4}-\d{6}-[A-Z0-9]{4}$/.test(q)) full = q;
  else if (clinicCode && /^\d{6}-[A-Z0-9]{4}$/.test(q)) full = `${clinicCode.toUpperCase()}-${q}`;
  return { full, suffix, remainder: q || null };
}
