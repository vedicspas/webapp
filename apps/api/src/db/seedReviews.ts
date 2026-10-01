/**
 * Inserts demo reviews into an already-migrated database (does not drop other tables).
 * Run after db:migrate:reviews when you do not want a full schema rebuild.
 */
import { execute, queryOne, pool } from "./pool.js";

async function userId(email: string): Promise<number> {
  const row = await queryOne<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
  if (!row) throw new Error(`Missing seeded user ${email}`);
  return row.id;
}

async function spaId(slug: string): Promise<number> {
  const row = await queryOne<{ id: number }>("SELECT id FROM spas WHERE slug = ?", [slug]);
  if (!row) throw new Error(`Missing seeded spa ${slug}`);
  return row.id;
}

async function main() {
  const asha = await userId("asha@example.test");
  const marco = await userId("marco@example.test");
  const vendor1 = await userId("vendor1@vedicspas.test");
  const ganga = await spaId("ganga-veda-rishikesh");
  const kerala = await spaId("kerala-roots-kochi");
  const palm = await spaId("palm-shala-goa");
  const ubud = await spaId("ubud-prana-retreat");
  const sedona = await spaId("red-rock-veda-sedona");

  await execute("DELETE FROM review_moderation_events", []);
  await execute("DELETE FROM review_photos", []);
  await execute("DELETE FROM review_responses", []);
  await execute("DELETE FROM reviews", []);

  const sql = `INSERT INTO reviews (
      spa_id, user_id, rating,
      rating_treatments, rating_practitioners, rating_staff, rating_food, rating_accommodations,
      rating_cleanliness, rating_location, rating_transport, rating_communication, rating_value,
      recommends, confirmed_genuine, title, body, visited_on, status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,'published')`;

  const first = await execute(sql, [
    ganga, asha, 5.0, 5.0, 5.0, 4.5, 4.5, 4.0, 5.0, 5.0, 3.5, 4.5, 4.5, 1,
    "Life-changing panchakarma",
    "The doctors took time to explain every step. The riverside setting makes the daily treatments unforgettable.",
    "2026-01-01",
  ]);
  await execute(sql, [
    ganga, asha, 2.5, 3.0, 3.5, 2.5, null, 2.0, 3.0, 4.0, null, 3.0, 2.5, 0,
    "Return visit felt average",
    "Came back for a shorter stay. Treatments were fine but the rooms and value did not match the first visit. Food was not applicable this time as I ate in town.",
    "2026-06-01",
  ]);
  await execute(sql, [
    ganga, marco, 4.0, 4.0, 4.5, 4.0, 3.5, 3.5, 4.0, 4.5, 3.0, 4.0, 4.0, 1,
    "Wonderful, book early",
    "Excellent therapists and food. Rooms are simple. Book the retreat months ahead — it fills up quickly every season.",
    "2025-11-01",
  ]);
  await execute(sql, [
    kerala, marco, 5.0, 5.0, 5.0, 4.5, 5.0, 4.5, 5.0, 4.0, 4.0, 4.5, 5.0, 1,
    "The real deal",
    "This is a proper Ayurvedic hospital, not a tourist spa. Strict but incredibly effective 14-night program with attentive doctors.",
    "2025-12-01",
  ]);
  await execute(sql, [
    palm, asha, 3.5, 4.0, 3.5, 4.0, 3.5, null, 4.0, 4.5, 3.0, 3.5, 4.0, 1,
    "Great value abhyanga",
    "Lovely open-air shala and skilled therapists. Sunset yoga after shirodhara is perfect. We did not stay overnight so rooms are not applicable.",
    "2026-02-01",
  ]);
  await execute(sql, [
    ubud, asha, 4.5, 4.5, 4.0, 4.5, 5.0, 4.5, 4.5, 5.0, 4.0, 4.0, 4.0, 1,
    "Jungle magic",
    "The blend of Balinese and Ayurvedic techniques works beautifully. The herbal meals alone are worth the journey into Ubud.",
    "2026-03-01",
  ]);
  await execute(sql, [
    sedona, marco, 1.5, 2.0, 2.5, 2.0, null, 1.5, 2.5, 4.0, 1.0, 2.0, 1.0, 0,
    "Overpriced for what we received",
    "Best scenery in the US, but the treatments felt rushed and arrival transfers never showed. Would not recommend at this price.",
    "2026-04-01",
  ]);

  await execute("INSERT INTO review_responses (review_id, user_id, body) VALUES (?,?,?)", [
    first.insertId,
    vendor1,
    "Thank you Asha! We are delighted the program helped. Our doctors send their regards — see you next season.",
  ]);

  console.log("Demo reviews inserted (includes a 2.5 rating and N/A categories).");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
