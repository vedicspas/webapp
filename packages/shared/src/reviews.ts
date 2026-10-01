/** Half-star rating scale and review aspect metadata shared by API and web. */

export const VALID_RATINGS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
export type ValidRating = (typeof VALID_RATINGS)[number];

export const MAX_REVIEWS_PER_SPA_USER = 3;
export const MAX_REVIEW_PHOTOS = 5;
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;
export const REVIEW_TITLE_MIN = 5;
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MIN = 30;
export const REVIEW_BODY_MAX = 5000;

export type ReviewAspectId =
  | "treatments"
  | "practitioners"
  | "staff"
  | "food"
  | "accommodations"
  | "cleanliness"
  | "location"
  | "transport"
  | "communication"
  | "value";

export const REVIEW_ASPECTS: { id: ReviewAspectId; label: string; column: string }[] = [
  { id: "treatments", label: "Quality of treatments", column: "rating_treatments" },
  { id: "practitioners", label: "Quality of doctors and practitioners", column: "rating_practitioners" },
  { id: "staff", label: "Staff and service", column: "rating_staff" },
  { id: "food", label: "Food and dietary program", column: "rating_food" },
  { id: "accommodations", label: "Accommodations", column: "rating_accommodations" },
  { id: "cleanliness", label: "Cleanliness and hygiene", column: "rating_cleanliness" },
  { id: "location", label: "Location and surroundings", column: "rating_location" },
  { id: "transport", label: "Transportation and arrival assistance", column: "rating_transport" },
  { id: "communication", label: "Communication before arrival", column: "rating_communication" },
  { id: "value", label: "Value for money", column: "rating_value" },
];

export type ReviewStatus = "published" | "hidden";

const RATING_SET = new Set<number>(VALID_RATINGS);

/** True for 1.0–5.0 in 0.5 steps. Rejects 0, 2.2, 3.7, 5.5, NaN. */
export function isValidRating(value: unknown): value is ValidRating {
  return typeof value === "number" && Number.isFinite(value) && RATING_SET.has(value);
}

export function ratingLabel(value: number): string {
  if (value <= 1) return "Terrible";
  if (value <= 2) return "Poor";
  if (value <= 3) return "Average";
  if (value <= 4) return "Very good";
  return "Excellent";
}

/** Maps a 0.5-step (or average) score onto the 1–5 distribution bars. */
export function distributionBucket(rating: number): 1 | 2 | 3 | 4 | 5 {
  if (rating >= 4.5) return 5;
  if (rating >= 3.5) return 4;
  if (rating >= 2.5) return 3;
  if (rating >= 1.5) return 2;
  return 1;
}

export const DISTRIBUTION_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "Excellent",
  4: "Very good",
  3: "Average",
  2: "Poor",
  1: "Terrible",
};

export function emptyAspectScores(): Record<ReviewAspectId, number | null> {
  return {
    treatments: null,
    practitioners: null,
    staff: null,
    food: null,
    accommodations: null,
    cleanliness: null,
    location: null,
    transport: null,
    communication: null,
    value: null,
  };
}
