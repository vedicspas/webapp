import bcrypt from "bcryptjs";
import { pool, execute, query } from "./pool.js";

async function insert(sql: string, params: unknown[]): Promise<number> {
  const result = await execute(sql, params);
  return result.insertId;
}

async function main() {
  console.log("Seeding database...");

  // ---- Static lookup tables ----
  await execute("INSERT INTO roles (code) VALUES ('traveler'), ('vendor'), ('admin')", []);

  await execute(
    "INSERT INTO currencies (code, symbol) VALUES ('USD','$'), ('EUR','\u20ac'), ('INR','\u20b9'), ('LKR','Rs'), ('IDR','Rp')",
    []
  );

  await execute(
    `INSERT INTO countries (iso2, name) VALUES
     ('IN','India'), ('LK','Sri Lanka'), ('ID','Indonesia'), ('US','United States'), ('DE','Germany')`,
    []
  );

  const countryIds = new Map<string, number>();
  for (const row of await query<{ id: number; iso2: string }>("SELECT id, iso2 FROM countries")) {
    countryIds.set(row.iso2, row.id);
  }

  const cities: Array<[string, string, number, number]> = [
    ["IN", "Rishikesh", 30.0869, 78.2676],
    ["IN", "Kochi", 9.9312, 76.2673],
    ["IN", "Goa", 15.2993, 74.124],
    ["LK", "Colombo", 6.9271, 79.8612],
    ["ID", "Ubud", -8.5069, 115.2625],
    ["US", "Sedona", 34.8697, -111.761],
    ["DE", "Baden-Baden", 48.7606, 8.2396],
  ];
  const cityIds = new Map<string, number>();
  for (const [iso2, name, lat, lng] of cities) {
    const id = await insert("INSERT INTO cities (country_id, name, lat, lng) VALUES (?,?,?,?)", [
      countryIds.get(iso2),
      name,
      lat,
      lng,
    ]);
    cityIds.set(name, id);
  }

  await execute(
    `INSERT INTO amenities (name, icon) VALUES
     ('Steam room','steam'), ('Herbal pharmacy','pharmacy'), ('Yoga shala','yoga'),
     ('Vegetarian restaurant','restaurant'), ('Accommodation','bed'), ('Doctor consultation','doctor'),
     ('Meditation garden','garden'), ('Pool','pool'), ('Airport pickup','car'), ('Wi-Fi','wifi')`,
    []
  );

  await execute(
    `INSERT INTO treatment_categories (slug, name) VALUES
     ('abhyanga','Abhyanga Massage'), ('shirodhara','Shirodhara'), ('panchakarma','Panchakarma'),
     ('udvartana','Udvartana'), ('nasya','Nasya'), ('marma','Marma Therapy'),
     ('yoga-retreat','Yoga & Meditation Retreat'), ('detox-retreat','Detox Retreat'),
     ('consultation','Ayurvedic Consultation')`,
    []
  );

  await execute(
    `INSERT INTO payment_modes (code, name, description) VALUES
     ('full_prepay','Pay in full online','The full treatment price is charged online at booking time.'),
     ('deposit','Deposit online','A percentage deposit is charged online; the balance is paid at the spa.'),
     ('booking_fee','Booking fee','A small fixed booking fee is charged online; the treatment is paid at the spa.'),
     ('pay_at_spa','Pay at the spa','Free reservation. Everything is paid on arrival.')`,
    []
  );

  await execute(
    `INSERT INTO booking_statuses (code, name) VALUES
     ('pending_payment','Pending payment'), ('confirmed','Confirmed'), ('cancelled','Cancelled'),
     ('completed','Completed'), ('no_show','No-show')`,
    []
  );

  // ---- Users ----
  const hash = await bcrypt.hash("password123", 10);
  const roleIds = new Map<string, number>();
  for (const row of await query<{ id: number; code: string }>("SELECT id, code FROM roles")) {
    roleIds.set(row.code, row.id);
  }

  const mkUser = (role: string, email: string, name: string, username: string, bio: string | null = null) =>
    insert(
      "INSERT INTO users (role_id, email, password_hash, name, username, avatar_url, bio) VALUES (?,?,?,?,?,?,?)",
      [roleIds.get(role), email, hash, name, username, `https://i.pravatar.cc/150?u=${username}`, bio]
    );

  const adminId = await mkUser("admin", "admin@vedicspas.test", "Admin", "admin");
  const travelerAId = await mkUser(
    "traveler",
    "asha@example.test",
    "Asha Patel",
    "asha",
    "Yoga teacher exploring authentic Ayurveda around the world."
  );
  const travelerBId = await mkUser(
    "traveler",
    "marco@example.test",
    "Marco Rossi",
    "marco",
    "Wellness traveler. Panchakarma believer."
  );
  const vendorUser1 = await mkUser("vendor", "vendor1@vedicspas.test", "Deepak Sharma", "deepak");
  const vendorUser2 = await mkUser("vendor", "vendor2@vedicspas.test", "Kamala Silva", "kamala");
  const vendorUser3 = await mkUser("vendor", "vendor3@vedicspas.test", "Wayan Putra", "wayan");
  void adminId;

  const vendor1 = await insert(
    "INSERT INTO vendors (user_id, business_name, status) VALUES (?,?,'approved')",
    [vendorUser1, "Himalaya Ayurveda Group"]
  );
  const vendor2 = await insert(
    "INSERT INTO vendors (user_id, business_name, status) VALUES (?,?,'approved')",
    [vendorUser2, "Ceylon Wellness Ltd"]
  );
  const vendor3 = await insert(
    "INSERT INTO vendors (user_id, business_name, status) VALUES (?,?,'approved')",
    [vendorUser3, "Bali Veda Retreats"]
  );

  // ---- Lookup helpers ----
  const currencyIds = new Map<string, number>();
  for (const row of await query<{ id: number; code: string }>("SELECT id, code FROM currencies")) {
    currencyIds.set(row.code, row.id);
  }
  const modeIds = new Map<string, number>();
  for (const row of await query<{ id: number; code: string }>("SELECT id, code FROM payment_modes")) {
    modeIds.set(row.code, row.id);
  }
  const categoryIds = new Map<string, number>();
  for (const row of await query<{ id: number; slug: string }>("SELECT id, slug FROM treatment_categories")) {
    categoryIds.set(row.slug, row.id);
  }

  // ---- Spas ----
  interface SpaSeed {
    vendorId: number;
    slug: string;
    name: string;
    short: string;
    city: string;
    lat: number;
    lng: number;
    mode: string;
    depositBps?: number;
    bookingFeeMinor?: number;
    currency: string;
    shopifyHandle: string | null;
    amenities: number[]; // amenity ids 1..10
  }

  const spaSeeds: SpaSeed[] = [
    {
      vendorId: vendor1,
      slug: "ganga-veda-rishikesh",
      name: "Ganga Veda Ayurveda Center",
      short: "Riverside panchakarma and yoga center in the yoga capital of the world.",
      city: "Rishikesh", lat: 30.1087, lng: 78.2932,
      mode: "deposit", depositBps: 2000, currency: "USD",
      shopifyHandle: "ganga-veda", amenities: [1, 2, 3, 4, 6, 7, 10],
    },
    {
      vendorId: vendor1,
      slug: "kerala-roots-kochi",
      name: "Kerala Roots Ayurveda Hospital",
      short: "Classical Kerala panchakarma hospital with in-house herbal pharmacy.",
      city: "Kochi", lat: 9.9525, 
      lng: 76.301,
      mode: "full_prepay", currency: "USD",
      shopifyHandle: "kerala-roots", amenities: [1, 2, 4, 5, 6, 9, 10],
    },
    {
      vendorId: vendor1,
      slug: "palm-shala-goa",
      name: "Palm Shala Wellness Goa",
      short: "Beachside abhyanga, shirodhara and sunset yoga near Palolem.",
      city: "Goa", lat: 15.0106, lng: 74.0233,
      mode: "booking_fee", bookingFeeMinor: 500, currency: "USD",
      shopifyHandle: "palm-shala", amenities: [3, 4, 7, 8, 10],
    },
    {
      vendorId: vendor2,
      slug: "ceylon-veda-colombo",
      name: "Ceylon Veda Sanctuary",
      short: "Urban Ayurvedic day spa with doctor-led treatment plans.",
      city: "Colombo", lat: 6.9147, lng: 79.8730,
      mode: "pay_at_spa", currency: "USD",
      shopifyHandle: "ceylon-veda", amenities: [1, 2, 6, 10],
    },
    {
      vendorId: vendor3,
      slug: "ubud-prana-retreat",
      name: "Ubud Prana Retreat",
      short: "Jungle retreat blending Balinese healing with classical Ayurveda.",
      city: "Ubud", lat: -8.5194, lng: 115.2633,
      mode: "deposit", depositBps: 3000, currency: "USD",
      shopifyHandle: "ubud-prana", amenities: [3, 4, 5, 7, 8, 9, 10],
    },
    {
      vendorId: vendor3,
      slug: "red-rock-veda-sedona",
      name: "Red Rock Veda Sedona",
      short: "High-desert Ayurveda studio with marma therapy and sound healing.",
      city: "Sedona", lat: 34.8656, lng: -111.7637,
      mode: "full_prepay", currency: "USD",
      shopifyHandle: "red-rock-veda", amenities: [1, 3, 6, 7, 10],
    },
  ];

  const spaIds = new Map<string, number>();
  for (const s of spaSeeds) {
    const description = `${s.short}\n\n${s.name} follows classical Ayurvedic protocols with personalised dosha assessments, treatments performed by trained therapists, and herbal preparations made from certified organic ingredients. Every guest begins with a consultation so treatments can be tailored to their constitution and health goals.`;
    const id = await insert(
      `INSERT INTO spas
        (vendor_id, slug, name, short_description, description, address_line, postal_code, city_id,
         lat, lng, phone, email, website, shopify_collection_handle, payment_mode_id, deposit_bps,
         booking_fee_minor, currency_id, is_published)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [
        s.vendorId, s.slug, s.name, s.short, description,
        `12 Wellness Lane`, "00000", cityIds.get(s.city),
        s.lat, s.lng, "+1 555 0100", `hello@${s.slug}.test`, `https://${s.slug}.test`,
        s.shopifyHandle, modeIds.get(s.mode), s.depositBps ?? null,
        s.bookingFeeMinor ?? null, currencyIds.get(s.currency),
      ]
    );
    spaIds.set(s.slug, id);

    for (const amenityId of s.amenities) {
      await execute("INSERT INTO spa_amenities (spa_id, amenity_id) VALUES (?,?)", [id, amenityId]);
    }
    for (let i = 0; i < 5; i++) {
      await execute("INSERT INTO spa_photos (spa_id, url, alt, sort_order) VALUES (?,?,?,?)", [
        id,
        `https://picsum.photos/seed/${s.slug}-${i}/1200/800`,
        `${s.name} photo ${i + 1}`,
        i,
      ]);
    }
    // Open 7 days, 9:00-18:00 (Sunday shorter)
    for (let weekday = 0; weekday <= 6; weekday++) {
      await execute(
        "INSERT INTO spa_open_hours (spa_id, weekday, open_time, close_time) VALUES (?,?,?,?)",
        [id, weekday, "09:00:00", weekday === 0 ? "14:00:00" : "18:00:00"]
      );
    }
  }

  // ---- Treatments ----
  interface TreatmentSeed {
    spa: string;
    cat: string;
    kind: "session" | "retreat";
    name: string;
    minutes?: number;
    nights?: number;
    priceMinor: number;
  }

  const treatments: TreatmentSeed[] = [
    { spa: "ganga-veda-rishikesh", cat: "abhyanga", kind: "session", name: "Traditional Abhyanga (60 min)", minutes: 60, priceMinor: 4500 },
    { spa: "ganga-veda-rishikesh", cat: "shirodhara", kind: "session", name: "Shirodhara Oil Flow (45 min)", minutes: 45, priceMinor: 5500 },
    { spa: "ganga-veda-rishikesh", cat: "panchakarma", kind: "retreat", name: "7-Night Panchakarma Immersion", nights: 7, priceMinor: 89000 },
    { spa: "ganga-veda-rishikesh", cat: "yoga-retreat", kind: "retreat", name: "5-Night Yoga & Ayurveda Retreat", nights: 5, priceMinor: 64000 },
    { spa: "kerala-roots-kochi", cat: "consultation", kind: "session", name: "Ayurvedic Doctor Consultation (30 min)", minutes: 30, priceMinor: 2500 },
    { spa: "kerala-roots-kochi", cat: "panchakarma", kind: "retreat", name: "14-Night Classical Panchakarma", nights: 14, priceMinor: 179000 },
    { spa: "kerala-roots-kochi", cat: "abhyanga", kind: "session", name: "Abhyanga + Steam (90 min)", minutes: 90, priceMinor: 6000 },
    { spa: "palm-shala-goa", cat: "abhyanga", kind: "session", name: "Beachside Abhyanga (60 min)", minutes: 60, priceMinor: 4000 },
    { spa: "palm-shala-goa", cat: "shirodhara", kind: "session", name: "Shirodhara Deep Rest (60 min)", minutes: 60, priceMinor: 5000 },
    { spa: "palm-shala-goa", cat: "yoga-retreat", kind: "retreat", name: "3-Night Weekend Reset", nights: 3, priceMinor: 39000 },
    { spa: "ceylon-veda-colombo", cat: "consultation", kind: "session", name: "Dosha Assessment (45 min)", minutes: 45, priceMinor: 3000 },
    { spa: "ceylon-veda-colombo", cat: "marma", kind: "session", name: "Marma Point Therapy (75 min)", minutes: 75, priceMinor: 6500 },
    { spa: "ubud-prana-retreat", cat: "abhyanga", kind: "session", name: "Prana Abhyanga (90 min)", minutes: 90, priceMinor: 7000 },
    { spa: "ubud-prana-retreat", cat: "detox-retreat", kind: "retreat", name: "10-Night Jungle Detox", nights: 10, priceMinor: 129000 },
    { spa: "red-rock-veda-sedona", cat: "marma", kind: "session", name: "Marma & Sound Healing (90 min)", minutes: 90, priceMinor: 12000 },
    { spa: "red-rock-veda-sedona", cat: "udvartana", kind: "session", name: "Udvartana Herbal Scrub (60 min)", minutes: 60, priceMinor: 9500 },
  ];

  const treatmentIds: number[] = [];
  for (const t of treatments) {
    const id = await insert(
      `INSERT INTO treatments (spa_id, category_id, kind, name, description, duration_minutes, nights, price_minor)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        spaIds.get(t.spa),
        categoryIds.get(t.cat),
        t.kind,
        t.name,
        `A signature ${t.kind === "retreat" ? "residential program" : "treatment"} at our center. Includes a personal consultation and herbal preparations suited to your dosha.`,
        t.minutes ?? null,
        t.nights ?? null,
        t.priceMinor,
      ]
    );
    treatmentIds.push(id);

    if (t.kind === "retreat") {
      // Monthly departures for the next 6 months
      const now = new Date();
      for (let m = 1; m <= 6; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() + m, 7);
        await execute(
          "INSERT INTO retreat_slots (treatment_id, start_date, capacity) VALUES (?,?,?)",
          [id, d.toISOString().slice(0, 10), 8]
        );
      }
    }
  }

  // ---- Reviews (with a vendor response), Q&A, wishlists ----
  const reviewInsert = `INSERT INTO reviews (
      spa_id, user_id, rating,
      rating_treatments, rating_practitioners, rating_staff, rating_food, rating_accommodations,
      rating_cleanliness, rating_location, rating_transport, rating_communication, rating_value,
      recommends, confirmed_genuine, title, body, visited_on, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,'published')`;

  const firstReviewId = await insert(reviewInsert, [
    spaIds.get("ganga-veda-rishikesh"), travelerAId, 5.0,
    5.0, 5.0, 4.5, 4.5, 4.0, 5.0, 5.0, 3.5, 4.5, 4.5,
    1, "Life-changing panchakarma",
    "The doctors took time to explain every step. The riverside setting makes the daily treatments unforgettable.",
    "2026-01-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("ganga-veda-rishikesh"), travelerAId, 2.5,
    3.0, 3.5, 2.5, null, 2.0, 3.0, 4.0, null, 3.0, 2.5,
    0, "Return visit felt average",
    "Came back for a shorter stay. Treatments were fine but the rooms and value did not match the first visit. Food was not applicable this time as I ate in town.",
    "2026-06-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("ganga-veda-rishikesh"), travelerBId, 4.0,
    4.0, 4.5, 4.0, 3.5, 3.5, 4.0, 4.5, 3.0, 4.0, 4.0,
    1, "Wonderful, book early",
    "Excellent therapists and food. Rooms are simple. Book the retreat months ahead — it fills up quickly every season.",
    "2025-11-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("kerala-roots-kochi"), travelerBId, 5.0,
    5.0, 5.0, 4.5, 5.0, 4.5, 5.0, 4.0, 4.0, 4.5, 5.0,
    1, "The real deal",
    "This is a proper Ayurvedic hospital, not a tourist spa. Strict but incredibly effective 14-night program with attentive doctors.",
    "2025-12-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("palm-shala-goa"), travelerAId, 3.5,
    4.0, 3.5, 4.0, 3.5, null, 4.0, 4.5, 3.0, 3.5, 4.0,
    1, "Great value abhyanga",
    "Lovely open-air shala and skilled therapists. Sunset yoga after shirodhara is perfect. We did not stay overnight so rooms are not applicable.",
    "2026-02-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("ubud-prana-retreat"), travelerAId, 4.5,
    4.5, 4.0, 4.5, 5.0, 4.5, 4.5, 5.0, 4.0, 4.0, 4.0,
    1, "Jungle magic",
    "The blend of Balinese and Ayurvedic techniques works beautifully. The herbal meals alone are worth the journey into Ubud.",
    "2026-03-01",
  ]);
  await insert(reviewInsert, [
    spaIds.get("red-rock-veda-sedona"), travelerBId, 1.5,
    2.0, 2.5, 2.0, null, 1.5, 2.5, 4.0, 1.0, 2.0, 1.0,
    0, "Overpriced for what we received",
    "Best scenery in the US, but the treatments felt rushed and arrival transfers never showed. Would not recommend at this price.",
    "2026-04-01",
  ]);

  await execute(
    "INSERT INTO review_responses (review_id, user_id, body) VALUES (?,?,?)",
    [firstReviewId, vendorUser1, "Thank you Asha! We are delighted the program helped. Our doctors send their regards — see you next season."]
  );

  const q1 = await insert(
    "INSERT INTO questions (spa_id, user_id, body) VALUES (?,?,?)",
    [spaIds.get("ganga-veda-rishikesh"), travelerBId, "Is the 7-night panchakarma suitable for first-timers, or should I start with a shorter program?"]
  );
  await execute(
    "INSERT INTO answers (question_id, user_id, is_vendor, body) VALUES (?,?,?,?)",
    [q1, vendorUser1, 1, "Yes \u2014 7 nights is our recommended introduction. The doctor adapts the intensity after your initial consultation."]
  );

  await execute("INSERT INTO wishlist_items (user_id, spa_id) VALUES (?,?), (?,?)", [
    travelerAId, spaIds.get("kerala-roots-kochi"),
    travelerAId, spaIds.get("ubud-prana-retreat"),
  ]);

  console.log("Seed complete.");
  console.log("Demo logins (password for all: password123):");
  console.log("  traveler: asha@example.test / marco@example.test");
  console.log("  vendor:   vendor1@vedicspas.test / vendor2@vedicspas.test / vendor3@vedicspas.test");
  console.log("  admin:    admin@vedicspas.test");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
