import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeNameList, encodeNameList, parseCommaNames } from "./nameList.js";

describe("parseCommaNames", () => {
  it("splits, trims, and de-duplicates", () => {
    assert.deepEqual(parseCommaNames("Abhyangam,  Sirodhara, abhyangam ,"), ["Abhyangam", "Sirodhara"]);
  });

  it("keeps names that contain parentheses", () => {
    assert.deepEqual(parseCommaNames("Choorna Swedam (Podikizhi), Dhara"), [
      "Choorna Swedam (Podikizhi)",
      "Dhara",
    ]);
  });
});

describe("encode/decode name lists", () => {
  it("round-trips JSON storage", () => {
    const encoded = encodeNameList("Vasthi, Sirodhara");
    assert.equal(encoded, JSON.stringify(["Vasthi", "Sirodhara"]));
    assert.deepEqual(decodeNameList(encoded), ["Vasthi", "Sirodhara"]);
  });

  it("reads a legacy comma string", () => {
    assert.deepEqual(decodeNameList("Nasyam, Pizhichil"), ["Nasyam", "Pizhichil"]);
  });
});
