import type {
  Booking,
  CreateBookingResponse,
  Paginated,
  Question,
  Review,
  SpaDetail,
  SpaSummary,
  StaticMeta,
} from "@vedic/shared";

// This module only runs on the server (server components/route handlers).
// Inside Docker the API is reached via the compose network (API_URL_INTERNAL);
// the browser always uses NEXT_PUBLIC_API_URL.
const API_URL =
  process.env.API_URL_INTERNAL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4100";

interface FetchOptions {
  revalidate?: number | false;
  token?: string;
  method?: string;
  body?: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    // Prerender-friendly caching for public GETs; no-store when authenticated
    // or when the caller opts out (spa detail must not serve stale treatments).
    ...(options.token || options.method || options.revalidate === false
      ? { cache: "no-store" as const }
      : { next: { revalidate: options.revalidate ?? 300 } }),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // keep default message
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// ---- Typed helpers for server components ----

export const EMPTY_META: StaticMeta = {
  countries: [],
  cities: [],
  amenities: [],
  treatmentCategories: [],
  paymentModes: [],
  bookingStatuses: [],
  currencies: [],
  roles: [],
  languages: [],
  dietaryOptions: [],
  accommodationTypes: [],
};

export const getMeta = () => api<StaticMeta>("/meta", { revalidate: 3600 });

/**
 * Like getMeta, but tolerates an unreachable API (e.g. during Docker image
 * builds). Pages prerender with empty data and fill in via ISR at runtime.
 */
export async function getMetaSafe(): Promise<StaticMeta> {
  try {
    return await getMeta();
  } catch {
    return EMPTY_META;
  }
}
export const getSpaSlugs = () => api<string[]>("/spas/slugs", { revalidate: 300 });
export const getSpa = (slug: string) => api<SpaDetail>(`/spas/${slug}`, { revalidate: false });
export const searchSpas = (qs: string) =>
  api<Paginated<SpaSummary & { distanceKm?: number }>>(`/spas?${qs}`, { revalidate: 60 });
export const getReviews = (slug: string, page = 1) =>
  api<Paginated<Review>>(`/spas/${slug}/reviews?page=${page}`, { revalidate: 60 });
export const getQuestions = (slug: string) =>
  api<Question[]>(`/spas/${slug}/questions`, { revalidate: 60 });

export type { Booking, CreateBookingResponse };
