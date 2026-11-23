export const DUPLICATE_CLINIC_CODE = "duplicate_clinic";
export const MAX_DUPLICATE_MATCHES = 5;
export const PLACE_DISTANCE_METERS = 400;
export const NAME_SIMILARITY = 0.85;
export const ADDRESS_SIMILARITY = 0.8;

const NAME_FILLER = new Set([
  "ayurveda",
  "ayurvedic",
  "clinic",
  "hospital",
  "centre",
  "center",
  "wellness",
  "panchakarma",
  "spa",
  "resort",
  "retreat",
  "pvt",
  "ltd",
]);

const ADDRESS_WORDS: Record<string, string> = {
  rd: "road",
  st: "street",
  ln: "lane",
  nr: "near",
  opp: "opposite",
};

export interface ClinicDuplicateInput {
  name: string;
  addressLine: string;
  cityName?: string | null;
  countryId?: number | null;
  postalCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface ClinicDuplicateRow extends ClinicDuplicateInput {
  id: number;
  slug: string;
  origin: "vendor" | "admin" | "imported";
  vendorId?: number | null;
  isPublished?: boolean | number;
}

export type DuplicateReason = "phone" | "email" | "website" | "place";

export interface ClinicDuplicateMatch {
  id: number;
  slug: string;
  name: string;
  addressLine: string;
  cityName: string;
  origin: "vendor" | "admin" | "imported";
  isUnclaimed: boolean;
  isPublished: boolean;
  reason: DuplicateReason;
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function words(value: string): string[] {
  return fold(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function coreName(value: string): string {
  const all = words(value);
  const core = all.filter((word) => !NAME_FILLER.has(word));
  return (core.length ? core : all).join(" ");
}

export function normalizeAddress(value: string): string {
  return words(value)
    .map((word) => ADDRESS_WORDS[word] ?? word)
    .join(" ");
}

export function phoneKey(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function emailKey(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

export function websiteHost(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    const href = raw.includes("://") ? raw : `https://${raw}`;
    const host = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    const host = fold(raw).replace(/^www\./, "").split(/[/?#]/)[0] ?? "";
    return host || null;
  }
}

export function pinKey(postalCode?: string | null, addressLine?: string | null): string | null {
  const fromPostal = String(postalCode ?? "").match(/\d{6}/);
  if (fromPostal) return fromPostal[0];
  const fromAddress = String(addressLine ?? "").match(/\d{6}/);
  return fromAddress?.[0] ?? null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, prevDiag + cost);
      prevDiag = temp;
    }
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  if (a === b) return 1;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

export function namesSimilar(a: string, b: string): boolean {
  const left = coreName(a);
  const right = coreName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 6 && right.length >= 6 && (left.includes(right) || right.includes(left))) return true;
  return similarity(left, right) >= NAME_SIMILARITY;
}

export function addressesSimilar(a: string, b: string): boolean {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return similarity(left, right) >= ADDRESS_SIMILARITY;
}

function sameCity(a?: string | null, b?: string | null): boolean {
  const left = fold(String(a ?? ""));
  const right = fold(String(b ?? ""));
  return Boolean(left && right && left === right);
}

function sameCountry(a?: number | null, b?: number | null): boolean {
  if (a == null || b == null || a === 0 || b === 0) return true;
  return a === b;
}

export function metersBetween(
  aLat?: number | null,
  aLng?: number | null,
  bLat?: number | null,
  bLng?: number | null
): number | null {
  const coords = [aLat, aLng, bLat, bLng];
  if (coords.some((n) => typeof n !== "number" || !Number.isFinite(n))) return null;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad((bLat as number) - (aLat as number));
  const dLng = toRad((bLng as number) - (aLng as number));
  const lat1 = toRad(aLat as number);
  const lat2 = toRad(bLat as number);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function locationSimilar(incoming: ClinicDuplicateInput, existing: ClinicDuplicateInput): boolean {
  if (!sameCountry(incoming.countryId, existing.countryId)) return false;
  const pinA = pinKey(incoming.postalCode, incoming.addressLine);
  const pinB = pinKey(existing.postalCode, existing.addressLine);
  if (pinA && pinB && pinA === pinB) return true;
  const distance = metersBetween(incoming.lat, incoming.lng, existing.lat, existing.lng);
  if (distance != null && distance <= PLACE_DISTANCE_METERS) return true;
  return sameCity(incoming.cityName, existing.cityName) && addressesSimilar(incoming.addressLine, existing.addressLine);
}

function contactReason(incoming: ClinicDuplicateInput, existing: ClinicDuplicateInput): DuplicateReason | null {
  const phoneA = phoneKey(incoming.phone);
  const phoneB = phoneKey(existing.phone);
  if (phoneA && phoneB && phoneA === phoneB) return "phone";
  const emailA = emailKey(incoming.email);
  const emailB = emailKey(existing.email);
  if (emailA && emailB && emailA === emailB) return "email";
  const hostA = websiteHost(incoming.website);
  const hostB = websiteHost(existing.website);
  if (hostA && hostB && hostA === hostB) return "website";
  return null;
}

function rank(reason: DuplicateReason, incoming: ClinicDuplicateInput, existing: ClinicDuplicateInput): number {
  if (reason === "phone") return 100;
  if (reason === "email") return 95;
  if (reason === "website") return 90;
  return 50 + 40 * similarity(coreName(incoming.name), coreName(existing.name)) + 10 * similarity(
    normalizeAddress(incoming.addressLine),
    normalizeAddress(existing.addressLine)
  );
}

export function findDuplicateClinics(
  incoming: ClinicDuplicateInput,
  existing: ClinicDuplicateRow[]
): ClinicDuplicateMatch[] {
  const scored: Array<{ match: ClinicDuplicateMatch; score: number }> = [];
  for (const row of existing) {
    const contact = contactReason(incoming, row);
    const place = namesSimilar(incoming.name, row.name) && locationSimilar(incoming, row);
    const reason = contact ?? (place ? "place" : null);
    if (!reason) continue;
    scored.push({
      score: rank(reason, incoming, row),
      match: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        addressLine: row.addressLine,
        cityName: row.cityName?.trim() || "",
        origin: row.origin,
        isUnclaimed: row.vendorId == null,
        isPublished: Boolean(row.isPublished),
        reason,
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_DUPLICATE_MATCHES).map((item) => item.match);
}
