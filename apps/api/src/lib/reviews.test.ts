import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VALID_RATINGS, distributionBucket, isValidRating, ratingLabel } from "@vedic/shared";
import { parseCreateReviewJson, assertCanModerate } from "./reviewValidation.js";
import { summarizeReviews } from "./reviewStats.js";
import { sniffImage, validatePhotoUpload, allowedExtension } from "./reviewPhotos.js";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const webp = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([16, 0, 0, 0]),
  Buffer.from("WEBP"),
  Buffer.alloc(4),
]);

function validPayload(over: Record<string, unknown> = {}) {
  return {
    rating: 2.5,
    title: "A fair second stay",
    body: "The treatments were mixed this time and the rooms felt tired compared with last year.",
    recommends: true,
    confirmedGenuine: true,
    aspects: { treatments: 3, food: null },
    ...over,
  };
}

describe("rating scale", () => {
  it("accepts every valid half-point value", () => {
    for (const value of VALID_RATINGS) {
      assert.equal(isValidRating(value), true, String(value));
    }
  });

  it("accepts whole-number ratings", () => {
    for (const value of [1, 2, 3, 4, 5]) {
      assert.equal(isValidRating(value), true);
    }
  });

  it("rejects invalid ratings including 2.2", () => {
    for (const value of [0, 2.2, 3.7, 5.5, -1, 6, 1.25, NaN, "2.5", null, undefined]) {
      assert.equal(isValidRating(value as never), false, String(value));
    }
  });

  it("labels 2.5 as Average", () => {
    assert.equal(ratingLabel(2.5), "Average");
    assert.equal(ratingLabel(1), "Terrible");
    assert.equal(ratingLabel(5), "Excellent");
  });

  it("buckets half points onto five distribution bars", () => {
    assert.equal(distributionBucket(5), 5);
    assert.equal(distributionBucket(4.5), 5);
    assert.equal(distributionBucket(4), 4);
    assert.equal(distributionBucket(3.5), 4);
    assert.equal(distributionBucket(2.5), 3);
    assert.equal(distributionBucket(1), 1);
  });
});

describe("create review schema", () => {
  it("saves a 2.5 overall rating", () => {
    const parsed = parseCreateReviewJson(validPayload());
    assert.equal(parsed.rating, 2.5);
  });

  it("rejects 2.2 even if sent from a manipulated client", () => {
    assert.throws(() => parseCreateReviewJson(validPayload({ rating: 2.2 })));
  });

  it("rejects missing genuineness confirmation", () => {
    assert.throws(() => parseCreateReviewJson(validPayload({ confirmedGenuine: false })));
  });

  it("allows not-applicable categories as null, never requiring zero", () => {
    const parsed = parseCreateReviewJson(validPayload({ aspects: { food: null, treatments: 4.5 } }));
    assert.equal(parsed.aspects?.food, null);
    assert.equal(parsed.aspects?.treatments, 4.5);
  });
});

describe("review summary math", () => {
  it("averages overall including 2.5 and ignores null categories", () => {
    const summary = summarizeReviews([
      {
        rating: 5,
        recommends: 1,
        aspects: {
          treatments: 5,
          practitioners: 5,
          staff: 5,
          food: 5,
          accommodations: 5,
          cleanliness: 5,
          location: 5,
          transport: 5,
          communication: 5,
          value: 5,
        },
      },
      {
        rating: 2.5,
        recommends: 0,
        aspects: {
          treatments: 3,
          practitioners: null,
          staff: 2,
          food: null,
          accommodations: 2,
          cleanliness: 3,
          location: 4,
          transport: null,
          communication: 3,
          value: 2.5,
        },
      },
    ]);
    assert.equal(summary.ratingAvg, 3.8);
    assert.equal(summary.ratingCount, 2);
    assert.equal(summary.recommendPercent, 50);
    assert.equal(summary.aspectAvgs.treatments, 4);
    assert.equal(summary.aspectAvgs.food, 5);
    assert.equal(summary.distribution[5], 1);
    assert.equal(summary.distribution[3], 1);
  });

  it("excludes hidden reviews when they are not passed in", () => {
    const visible = summarizeReviews([{ rating: 4, recommends: 1, aspects: emptyAspects() }]);
    const withHidden = summarizeReviews([
      { rating: 4, recommends: 1, aspects: emptyAspects() },
      { rating: 1, recommends: 0, aspects: emptyAspects() },
    ]);
    assert.equal(visible.ratingAvg, 4);
    assert.notEqual(withHidden.ratingAvg, visible.ratingAvg);
  });
});

describe("moderation authorization", () => {
  it("rejects missing and non-admin users", () => {
    assert.throws(() => assertCanModerate(null), /Authentication required/);
    assert.throws(() => assertCanModerate({ role: "traveler" }), /Admin access required/);
    assert.throws(() => assertCanModerate({ role: "vendor" }), /Admin access required/);
    assert.doesNotThrow(() => assertCanModerate({ role: "admin" }));
  });
});

describe("photo validation", () => {
  it("sniffs jpeg png and webp signatures", () => {
    assert.equal(sniffImage(jpeg), "jpeg");
    assert.equal(sniffImage(png), "png");
    assert.equal(sniffImage(webp), "webp");
    assert.equal(sniffImage(Buffer.from("not-an-image")), null);
  });

  it("rejects extension/MIME mismatches and oversize files", () => {
    assert.equal(allowedExtension("photo.jpg", "jpeg"), true);
    assert.equal(allowedExtension("photo.png", "jpeg"), false);
    const bad = validatePhotoUpload({ filename: "x.png", mimetype: "image/png", buffer: jpeg });
    assert.equal(bad.ok, false);
    const huge = validatePhotoUpload({
      filename: "x.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.concat([jpeg, Buffer.alloc(5 * 1024 * 1024)]),
    });
    assert.equal(huge.ok, false);
    const ok = validatePhotoUpload({ filename: "stay.jpg", mimetype: "image/jpeg", buffer: jpeg });
    assert.equal(ok.ok, true);
  });
});

function emptyAspects() {
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
