import type { SpaSummary } from "@vedic/shared";
import { query } from "../db/pool.js";
import { staticCache } from "../cache/staticCache.js";

export interface SpaSummaryRow {
  id: number;
  slug: string;
  name: string;
  shortDescription: string;
  cityId: number;
  lat: number;
  lng: number;
  paymentModeId: number;
  currencyId: number;
  coverPhotoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  priceFromMinor: number | null;
  distanceKm?: number;
}

export const SPA_SUMMARY_SELECT = `
  SELECT s.id, s.slug, s.name, s.short_description AS shortDescription,
    s.city_id AS cityId, s.lat, s.lng,
    s.payment_mode_id AS paymentModeId, s.currency_id AS currencyId,
    (SELECT p.url FROM spa_photos p WHERE p.spa_id = s.id ORDER BY p.sort_order LIMIT 1) AS coverPhotoUrl,
    COALESCE(r.avg_rating, 0) AS ratingAvg,
    COALESCE(r.cnt, 0) AS ratingCount,
    t.min_price AS priceFromMinor
  FROM spas s
  LEFT JOIN (
    SELECT spa_id, ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS cnt
    FROM reviews GROUP BY spa_id
  ) r ON r.spa_id = s.id
  LEFT JOIN (
    SELECT spa_id, MIN(price_minor) AS min_price
    FROM treatments WHERE is_active = 1 GROUP BY spa_id
  ) t ON t.spa_id = s.id
`;

export async function amenityIdsBySpa(spaIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (spaIds.length === 0) return map;
  const rows = await query<{ spa_id: number; amenity_id: number }>(
    `SELECT spa_id, amenity_id FROM spa_amenities WHERE spa_id IN (${spaIds.map(() => "?").join(",")})`,
    spaIds
  );
  for (const row of rows) {
    const list = map.get(row.spa_id) ?? [];
    list.push(row.amenity_id);
    map.set(row.spa_id, list);
  }
  return map;
}

export function toSpaSummary(row: SpaSummaryRow, amenityIds: number[]): SpaSummary {
  const city = staticCache.city(row.cityId);
  const country = city ? staticCache.country(city.countryId) : undefined;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    cityId: row.cityId,
    cityName: city?.name ?? "",
    countryName: country?.name ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    coverPhotoUrl: row.coverPhotoUrl,
    ratingAvg: Number(row.ratingAvg),
    ratingCount: Number(row.ratingCount),
    priceFromMinor: row.priceFromMinor === null ? null : Number(row.priceFromMinor),
    currencyCode: staticCache.currency(row.currencyId)?.code ?? "USD",
    paymentModeCode: (staticCache.paymentMode(row.paymentModeId)?.code ?? "pay_at_spa") as SpaSummary["paymentModeCode"],
    amenityIds,
  };
}
