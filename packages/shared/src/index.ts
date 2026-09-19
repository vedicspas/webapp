// Shared types between the Fastify API (apps/api) and the Next.js web app (apps/web).

// ---------- Static lookup tables (cached in memory by the API at startup) ----------

export interface Country {
  id: number;
  iso2: string;
  name: string;
}

export interface City {
  id: number;
  countryId: number;
  name: string;
  lat: number;
  lng: number;
}

export interface Amenity {
  id: number;
  name: string;
  icon: string;
}

export interface NamedLookup {
  id: number;
  name: string;
}

export type OnRequestFlag = "on_request" | "not_available";

export interface TreatmentCategory {
  id: number;
  slug: string;
  name: string;
}

export type PaymentModeCode = "full_prepay" | "deposit" | "booking_fee" | "pay_at_spa";

export interface PaymentMode {
  id: number;
  code: PaymentModeCode;
  name: string;
  description: string;
}

export type BookingStatusCode =
  | "pending_payment"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export interface BookingStatus {
  id: number;
  code: BookingStatusCode;
  name: string;
}

export interface Currency {
  id: number;
  code: string;
  symbol: string;
}

/** Stored as `traveler` in the database; shown as “Visitor” in the product. */
export type RoleCode = "traveler" | "vendor" | "admin";

export type VendorStatus = "pending" | "approved" | "suspended";

export interface Role {
  id: number;
  code: RoleCode;
}

export interface StaticMeta {
  countries: Country[];
  cities: City[];
  amenities: Amenity[];
  treatmentCategories: TreatmentCategory[];
  paymentModes: PaymentMode[];
  bookingStatuses: BookingStatus[];
  currencies: Currency[];
  roles: Role[];
  languages: NamedLookup[];
  dietaryOptions: NamedLookup[];
  accommodationTypes: NamedLookup[];
}

// ---------- Core entities ----------

export interface PublicUser {
  id: number;
  username: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export type TreatmentKind = "session" | "retreat";

export interface Treatment {
  id: number;
  spaId: number;
  categoryId: number;
  categoryName: string;
  kind: TreatmentKind;
  name: string;
  description: string;
  durationMinutes: number | null; // sessions
  nights: number | null; // retreats
  priceMinor: number;
  isActive: boolean;
}

export interface SpaPhoto {
  id: number;
  url: string;
  /** Short caption shown on the listing gallery. Stored as text, not a file blob. */
  title: string;
  alt: string;
  sortOrder: number;
}

export interface SpaSummary {
  id: number;
  slug: string;
  name: string;
  shortDescription: string;
  cityId: number;
  cityName: string;
  countryName: string;
  lat: number;
  lng: number;
  coverPhotoUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  priceFromMinor: number | null;
  currencyCode: string;
  paymentModeCode: PaymentModeCode;
  amenityIds: number[];
}

export interface SpaDetail extends SpaSummary {
  description: string;
  addressLine: string;
  postalCode: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  shopifyCollectionHandle: string | null;
  depositBps: number | null;
  bookingFeeMinor: number | null;
  photos: SpaPhoto[];
  treatments: Treatment[];
  openHours: OpenHours[];
  languages: NamedLookup[];
  dietaryOptions: NamedLookup[];
  airportPickup: OnRequestFlag | null;
  accommodationType: NamedLookup | null;
  accessibility: string | null;
  familyAccommodation: OnRequestFlag | null;
}

export interface OpenHours {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  openTime: string; // "09:00"
  closeTime: string; // "18:00"
}

export interface Review {
  id: number;
  spaId: number;
  rating: number;
  title: string;
  body: string;
  visitedOn: string | null;
  createdAt: string;
  user: PublicUser;
  response: ReviewResponse | null;
}

export interface ReviewResponse {
  id: number;
  body: string;
  createdAt: string;
  responderName: string;
}

export interface Question {
  id: number;
  spaId: number;
  body: string;
  createdAt: string;
  user: PublicUser;
  answers: Answer[];
}

export interface Answer {
  id: number;
  body: string;
  isVendor: boolean;
  createdAt: string;
  user: PublicUser;
}

export interface AvailabilitySlot {
  startsAt: string; // ISO datetime
  endsAt: string;
}

export interface RetreatSlot {
  id: number;
  treatmentId: number;
  startDate: string; // YYYY-MM-DD
  capacity: number;
  bookedCount: number;
}

export interface Booking {
  id: number;
  code: string;
  spaId: number;
  spaName: string;
  spaSlug: string;
  treatmentId: number;
  treatmentName: string;
  treatmentCategoryName: string;
  treatmentKind: TreatmentKind;
  statusCode: BookingStatusCode;
  paymentModeCode: PaymentModeCode;
  startsAt: string;
  endsAt: string;
  partySize: number;
  totalMinor: number;
  paidMinor: number;
  currencyCode: string;
  createdAt: string;
}

export interface CreateBookingResponse {
  booking: Booking;
  /** Present when an online payment is required (full_prepay, deposit, booking_fee). */
  stripeClientSecret: string | null;
  /** Amount being charged now, in minor units. */
  payNowMinor: number;
}

// ---------- API helper types ----------

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SearchFilters {
  q?: string;
  cityId?: number;
  countryId?: number;
  categoryId?: number;
  amenityIds?: number[];
  ratingMin?: number;
  paymentMode?: PaymentModeCode;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: "rating" | "price_asc" | "price_desc" | "distance";
  page?: number;
}

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  username: string;
  role: RoleCode;
  avatarUrl: string | null;
}
