import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clampDisplayOrder,
  omitAdminNotes,
  parseAdminNotes,
  parseDisplayOrder,
  placementSummary,
  planFeaturedOrders,
  planRemoveOrders,
  publicFeaturedSequence,
  publicPayloadHasNotes,
  rankFeaturedFirst,
  requireAdminRole,
  withFeaturedFirst,
  ADMIN_NOTES_MAX,
  type FeaturedRow,
} from "./featuredSpas.js";

const list = (pairs: Array<[number, number]>): FeaturedRow[] =>
  pairs.map(([spaId, displayOrder]) => ({ spaId, displayOrder }));

describe("featured display order", () => {
  it("adds a clinic at the end", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2], [3, 3]]), 4, 4);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
      ]
    );
  });

  it("adds a clinic at position 1 and shifts the rest", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2], [3, 3]]), 4, 1);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [4, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ]
    );
  });

  it("moves a clinic forward from 3 to 1", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2], [3, 3]]), 3, 1);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [3, 1],
        [1, 2],
        [2, 3],
      ]
    );
  });

  it("moves a clinic backward from 1 to 3", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2], [3, 3]]), 1, 3);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [2, 1],
        [3, 2],
        [1, 3],
      ]
    );
  });

  it("moves a clinic to the last position", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2], [3, 3], [4, 4]]), 2, 4);
    assert.deepEqual(
      next.map((row) => row.spaId),
      [1, 3, 4, 2]
    );
  });

  it("clamps an oversized position to the end", () => {
    assert.equal(clampDisplayOrder(99, 3), 4);
    const next = planFeaturedOrders(list([[1, 1], [2, 2]]), 3, 99);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ]
    );
  });

  it("removes a clinic and closes the order gap", () => {
    const next = planRemoveOrders(list([[1, 1], [2, 2], [3, 3]]), 2);
    assert.deepEqual(
      next.map((row) => [row.spaId, row.displayOrder]),
      [
        [1, 1],
        [3, 2],
      ]
    );
  });

  it("does not duplicate a spa already in the list", () => {
    const next = planFeaturedOrders(list([[1, 1], [2, 2]]), 1, 2);
    assert.equal(next.length, 2);
    assert.equal(next.filter((row) => row.spaId === 1).length, 1);
  });
});

describe("featured validation", () => {
  it("rejects invalid positions", () => {
    for (const value of [0, -1, 1.5, "0", "abc", "", null, undefined, "1.0"]) {
      assert.throws(() => parseDisplayOrder(value), /positive whole number/);
    }
  });

  it("accepts positive whole numbers including numeric strings", () => {
    assert.equal(parseDisplayOrder(1), 1);
    assert.equal(parseDisplayOrder("12"), 12);
  });

  it("trims notes and rejects overlong notes", () => {
    assert.equal(parseAdminNotes("  why this clinic  "), "why this clinic");
    assert.equal(parseAdminNotes("   "), null);
    assert.equal(parseAdminNotes(null), null);
    assert.throws(() => parseAdminNotes("x".repeat(ADMIN_NOTES_MAX + 1)), /1000/);
  });

  it("rejects unauthorized admin access", () => {
    assert.throws(() => requireAdminRole("vendor"), /Admin access required/);
    assert.throws(() => requireAdminRole("traveler"), /Admin access required/);
    assert.throws(() => requireAdminRole(undefined), /Admin access required/);
    requireAdminRole("admin");
  });
});

describe("featured public payload", () => {
  it("never includes internal notes", () => {
    const publicItem = omitAdminNotes({
      id: 1,
      name: "Kerala Roots",
      adminNotes: "Promo agreement Q4",
      tags: ["Panchakarma"],
    });
    assert.equal("adminNotes" in publicItem, false);
    assert.equal(publicPayloadHasNotes({ items: [publicItem] }), false);
    assert.equal(publicPayloadHasNotes({ adminNotes: "secret" }), true);
  });

  it("excludes unpublished clinics and keeps display order", () => {
    const sequence = publicFeaturedSequence(
      list([[10, 1], [20, 2], [30, 3]]),
      [
        { id: 10, isPublished: true },
        { id: 20, isPublished: false },
        { id: 30, isPublished: true },
      ]
    );
    assert.deepEqual(sequence, [10, 30]);
  });

  it("hides the homepage section when no eligible clinics remain", () => {
    const sequence = publicFeaturedSequence(list([[10, 1]]), [{ id: 10, isPublished: false }]);
    assert.deepEqual(sequence, []);
  });
});

describe("featured search ranking", () => {
  it("puts matching featured clinics first without duplicating them", () => {
    const ranked = rankFeaturedFirst(
      [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      list([
        [3, 1],
        [1, 2],
      ])
    );
    assert.deepEqual(
      ranked.map((row) => row.id),
      [3, 1, 2, 4]
    );
  });

  it("ignores featured clinics that do not match the current filters", () => {
    const ranked = rankFeaturedFirst(
      [{ id: 2 }, { id: 4 }],
      list([
        [3, 1],
        [4, 2],
      ])
    );
    assert.deepEqual(
      ranked.map((row) => row.id),
      [4, 2]
    );
  });

  it("keeps the original order when no featured clinics match", () => {
    const ranked = rankFeaturedFirst([{ id: 8 }, { id: 9 }], list([[1, 1]]));
    assert.deepEqual(
      ranked.map((row) => row.id),
      [8, 9]
    );
  });

  it("prefixes listing SQL so featured rows sort ahead of the existing order", () => {
    const sql = withFeaturedFirst("ratingAvg DESC, ratingCount DESC");
    assert.match(sql, /fs\.spa_id IS NOT NULL/);
    assert.match(sql, /fs\.display_order ASC/);
    assert.ok(sql.endsWith("ratingAvg DESC, ratingCount DESC"));
  });
});

describe("featured placement history", () => {
  it("pairs featured and taken-down events into a running summary", () => {
    const summary = placementSummary([
      { action: "featured", at: "2026-03-01T00:00:00.000Z", displayOrder: 1 },
      { action: "removed", at: "2026-03-20T00:00:00.000Z", displayOrder: 1 },
      { action: "featured", at: "2026-11-01T00:00:00.000Z", displayOrder: 2 },
    ]);
    assert.deepEqual(summary, [
      { featuredAt: "2026-03-01T00:00:00.000Z", removedAt: "2026-03-20T00:00:00.000Z", position: 1 },
      { featuredAt: "2026-11-01T00:00:00.000Z", removedAt: null, position: 2 },
    ]);
  });
});
