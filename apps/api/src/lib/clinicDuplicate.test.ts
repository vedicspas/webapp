import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findDuplicateClinics,
  namesSimilar,
  addressesSimilar,
  locationSimilar,
  phoneKey,
  websiteHost,
  type ClinicDuplicateRow,
} from "./clinicDuplicate.js";

function spa(partial: Partial<ClinicDuplicateRow> & { id: number; name: string }): ClinicDuplicateRow {
  return {
    slug: `spa-${partial.id}`,
    addressLine: "",
    cityName: "",
    origin: "admin",
    vendorId: null,
    isPublished: 1,
    ...partial,
  };
}

const incoming = {
  name: "Somatheeram Ayurvedic Hospital",
  addressLine: "123 Beach Rd, Chowara",
  cityName: "Kovalam",
  countryId: 1,
  postalCode: "695521",
  lat: 8.385,
  lng: 76.978,
  phone: "+91 471 226 8101",
  email: "stay@somatheeram.org",
  website: "https://www.somatheeram.org",
};

describe("clinic duplicate matching", () => {
  it("treats Rd vs Road in the same city as the same place", () => {
    const matches = findDuplicateClinics(incoming, [
      spa({
        id: 1,
        name: "Somatheeram Ayurvedic Hospital",
        addressLine: "123 Beach Road, Chowara, Kovalam",
        cityName: "Kovalam",
        countryId: 1,
      }),
    ]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].reason, "place");
  });

  it("ignores filler words in the clinic name", () => {
    assert.equal(namesSimilar("Somatheeram Ayurvedic Hospital", "Somatheeram"), true);
    assert.equal(addressesSimilar("Beach Rd, Chowara", "Beach Road, Chowara, Kovalam"), true);
  });

  it("does not warn for the same brand in a different city", () => {
    const matches = findDuplicateClinics(
      { ...incoming, phone: null, email: null, website: null, postalCode: "", lat: null, lng: null },
      [
        spa({
          id: 2,
          name: "Somatheeram Ayurvedic Hospital",
          addressLine: "MG Road",
          cityName: "Kochi",
          countryId: 1,
          postalCode: "682016",
        }),
      ]
    );
    assert.equal(matches.length, 0);
  });

  it("does not warn for two branches in the same city with different streets", () => {
    const matches = findDuplicateClinics(
      {
        name: "Kairali Ayurvedic Group",
        addressLine: "12 MG Road",
        cityName: "Kochi",
        countryId: 1,
        postalCode: "682016",
        lat: 9.98,
        lng: 76.28,
        phone: null,
        email: null,
        website: null,
      },
      [
        spa({
          id: 3,
          name: "Kairali Ayurvedic Group",
          addressLine: "88 Beach Road",
          cityName: "Kochi",
          countryId: 1,
          postalCode: "682001",
          lat: 9.97,
          lng: 76.31,
        }),
      ]
    );
    assert.equal(matches.length, 0);
  });

  it("warns on the same phone even when the name differs", () => {
    const matches = findDuplicateClinics(incoming, [
      spa({
        id: 4,
        name: "Chowara Beach Retreat",
        addressLine: "Other street",
        cityName: "Trivandrum",
        countryId: 1,
        phone: "0471-2268101",
      }),
    ]);
    assert.equal(matches[0]?.reason, "phone");
    assert.equal(phoneKey("+91 471 226 8101"), "4712268101");
  });

  it("warns on the same website host", () => {
    const matches = findDuplicateClinics(
      { ...incoming, phone: null, email: null },
      [
        spa({
          id: 5,
          name: "Completely Different Name",
          addressLine: "Somewhere else",
          cityName: "Delhi",
          countryId: 1,
          website: "somatheeram.org/contact",
        }),
      ]
    );
    assert.equal(matches[0]?.reason, "website");
    assert.equal(websiteHost("https://www.somatheeram.org"), "somatheeram.org");
  });

  it("warns on the same PIN with a similar name", () => {
    const matches = findDuplicateClinics(
      { ...incoming, phone: null, email: null, website: null, lat: null, lng: null, addressLine: "Near the lighthouse" },
      [
        spa({
          id: 6,
          name: "Somatheeram Hospital",
          addressLine: "Chowara P.O.",
          cityName: "Thiruvananthapuram",
          countryId: 1,
          postalCode: "695521",
        }),
      ]
    );
    assert.equal(matches[0]?.reason, "place");
  });

  it("warns when coordinates are within 400 metres", () => {
    const matches = findDuplicateClinics(
      { ...incoming, phone: null, email: null, website: null, postalCode: "", cityName: "Chowara" },
      [
        spa({
          id: 7,
          name: "Somatheeram",
          addressLine: "Lighthouse road",
          cityName: "Kovalam",
          countryId: 1,
          lat: 8.3852,
          lng: 76.9781,
        }),
      ]
    );
    assert.equal(matches[0]?.reason, "place");
  });

  it("does not treat different countries as the same place", () => {
    assert.equal(
      locationSimilar(
        { name: "Test", addressLine: "1 Main", cityName: "Kovalam", countryId: 1, postalCode: "695521" },
        { name: "Test", addressLine: "1 Main", cityName: "Kovalam", countryId: 2, postalCode: "695521" }
      ),
      false
    );
  });

  it("returns at most five matches, contact first", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      spa({
        id: i + 1,
        name: incoming.name,
        addressLine: incoming.addressLine,
        cityName: incoming.cityName,
        countryId: 1,
      })
    );
    rows[0] = { ...rows[0], phone: incoming.phone };
    const matches = findDuplicateClinics(incoming, rows);
    assert.equal(matches.length, 5);
    assert.equal(matches[0].reason, "phone");
  });
});
