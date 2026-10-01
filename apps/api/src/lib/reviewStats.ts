import type { ReviewAspectId, ReviewSummary } from "@vedic/shared";
import { REVIEW_ASPECTS, distributionBucket, emptyAspectScores } from "@vedic/shared";

export interface ReviewStatRow {
  rating: number;
  recommends: number | null;
  aspects: Record<ReviewAspectId, number | null>;
}

export function summarizeReviews(rows: ReviewStatRow[]): ReviewSummary {
  const distribution: ReviewSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const aspectSums = emptyAspectScores() as Record<ReviewAspectId, number>;
  const aspectCounts = emptyAspectScores() as Record<ReviewAspectId, number>;
  for (const id of Object.keys(aspectSums) as ReviewAspectId[]) {
    aspectSums[id] = 0;
    aspectCounts[id] = 0;
  }

  let ratingTotal = 0;
  let recommendYes = 0;
  let recommendKnown = 0;

  for (const row of rows) {
    ratingTotal += row.rating;
    distribution[distributionBucket(row.rating)] += 1;
    if (row.recommends === 1 || row.recommends === 0) {
      recommendKnown += 1;
      if (row.recommends === 1) recommendYes += 1;
    }
    for (const aspect of REVIEW_ASPECTS) {
      const value = row.aspects[aspect.id];
      if (value != null) {
        aspectSums[aspect.id] += value;
        aspectCounts[aspect.id] += 1;
      }
    }
  }

  const aspectAvgs = emptyAspectScores();
  for (const aspect of REVIEW_ASPECTS) {
    const count = aspectCounts[aspect.id];
    aspectAvgs[aspect.id] = count > 0 ? round1(aspectSums[aspect.id] / count) : null;
  }

  return {
    ratingAvg: rows.length > 0 ? round1(ratingTotal / rows.length) : 0,
    ratingCount: rows.length,
    recommendPercent: recommendKnown > 0 ? Math.round((100 * recommendYes) / recommendKnown) : null,
    distribution,
    aspectAvgs,
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export const PUBLISHED_REVIEW = "rv.status = 'published'";
