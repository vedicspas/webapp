import { z } from "zod";
import {
  isValidRating,
  REVIEW_ASPECTS,
  REVIEW_BODY_MAX,
  REVIEW_BODY_MIN,
  REVIEW_TITLE_MAX,
  REVIEW_TITLE_MIN,
  emptyAspectScores,
  type ReviewAspectId,
} from "@vedic/shared";

export const halfStarRating = z.number().refine(isValidRating, {
  message: "Rating must be between 1.0 and 5.0 in 0.5 steps",
});

export const optionalAspectRating = z
  .union([halfStarRating, z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const createReviewSchema = z.object({
  rating: halfStarRating,
  title: z.string().trim().min(REVIEW_TITLE_MIN).max(REVIEW_TITLE_MAX),
  body: z.string().trim().min(REVIEW_BODY_MIN).max(REVIEW_BODY_MAX),
  recommends: z.boolean(),
  confirmedGenuine: z
    .boolean()
    .refine((v) => v === true, { message: "Please confirm this is a genuine personal experience" }),
  visitedYear: z.number().int().min(1990).max(new Date().getFullYear()).optional(),
  visitedMonth: z.number().int().min(1).max(12).optional(),
  aspects: z
    .object({
      treatments: optionalAspectRating,
      practitioners: optionalAspectRating,
      staff: optionalAspectRating,
      food: optionalAspectRating,
      accommodations: optionalAspectRating,
      cleanliness: optionalAspectRating,
      location: optionalAspectRating,
      transport: optionalAspectRating,
      communication: optionalAspectRating,
      value: optionalAspectRating,
    })
    .optional(),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export function visitedOnFrom(input: CreateReviewInput): string | null {
  if (input.visitedYear == null || input.visitedMonth == null) {
    if (input.visitedYear != null || input.visitedMonth != null) {
      throw Object.assign(new Error("Visit month and year are both required when provided"), {
        statusCode: 400,
      });
    }
    return null;
  }
  const month = String(input.visitedMonth).padStart(2, "0");
  return `${input.visitedYear}-${month}-01`;
}

export function aspectValues(input: CreateReviewInput): Record<ReviewAspectId, number | null> {
  const base = emptyAspectScores();
  if (!input.aspects) return base;
  for (const aspect of REVIEW_ASPECTS) {
    const value = input.aspects[aspect.id];
    base[aspect.id] = value === undefined ? null : value;
  }
  return base;
}

export function assertCanModerate(user: { role: string } | null): void {
  if (!user) {
    throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  }
  if (user.role !== "admin") {
    throw Object.assign(new Error("Admin access required"), { statusCode: 403 });
  }
}

export function parseCreateReviewJson(raw: unknown): CreateReviewInput {
  return createReviewSchema.parse(raw);
}
