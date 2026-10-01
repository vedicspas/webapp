# VedaFinder — API Reference

The API is a standalone Fastify server (`apps/api`), default port **4100** (or the
platform-injected `PORT` in production). All request/response bodies are JSON except the Stripe
webhook (raw body).

## Conventions

- **Authentication** — send `Authorization: Bearer <token>`. The token is an HS256 JWT signed
  with `AUTH_SECRET`, obtained from `POST /auth/login`, `POST /auth/register`, or
  `POST /auth/oauth` (the web app does this automatically via Auth.js and exposes it as
  `session.apiToken`). Tokens carry `sub` (user id), `role`, `email`, `name` and expire after
  30 days.
- **Roles** — endpoints are marked *Public*, *Auth* (any signed-in user), *Vendor*, or *Admin*.
  Role checks are enforced server-side; a wrong role gets `403`.
- **Money** — always integer minor units (`4500` = $45.00). **Percentages** — basis points
  (`2000` = 20%).
- **Datetimes** — ISO-8601 UTC. **Dates** — `YYYY-MM-DD`.
- **Validation errors** — invalid input returns `400 {"error": "Invalid input", "details": [...zod issues]}`.
- **CORS** — only `WEB_ORIGIN` is allowed.

---

## Health & static metadata

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /health` | Public | Liveness probe. → `{ "ok": true }` |
| `GET /meta` | Public | The entire static lookup set, served from the in-memory cache (`Cache-Control: max-age=300`): `currencies`, `countries`, `cities`, `amenities`, `treatmentCategories`, `paymentModes`, `bookingStatuses`. |

## Auth

| Method & path | Access | Description |
| --- | --- | --- |
| `POST /auth/register` | Public | Body `{ name, email, password (≥8), username? }`. Creates a traveler. → `{ token, user }`. `409` if email/username taken. |
| `POST /auth/login` | Public | Body `{ email, password }`. → `{ token, user }`. `401` on bad credentials. |
| `POST /auth/oauth` | Public | Body `{ email, name, avatarUrl? }`. Upserts a user for a Google sign-in and returns `{ token, user }`. Called by the web app's Auth.js callback. |

`user` shape: `{ id, name, email, username, role, avatarUrl }`.

## Spa discovery

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /spas/slugs` | Public | All published slugs (used by Next.js `generateStaticParams`). |
| `GET /spas` | Public | Search. → `{ items: SpaSummary[], page, pageSize: 12, total }`. |
| `GET /spas/:slug` | Public | Full detail: summary + description, contact, hours, photos, treatments (with retreat slots), payment mode parameters. `404` if unpublished/unknown. |

`GET /spas` query parameters (all optional):

| Param | Type | Meaning |
| --- | --- | --- |
| `q` | string | Matches name / short & long description (`LIKE`) |
| `cityId`, `countryId` | number | Destination filter |
| `categoryId` | number | Spa must have an active treatment in this category |
| `amenityIds` | csv of numbers | Spa must have **all** listed amenities |
| `ratingMin` | 1–5 | Minimum average rating |
| `paymentMode` | code | e.g. `pay_at_spa` |
| `lat`, `lng`, `radiusKm` | numbers | Haversine geo filter (radius ≤ 500, default 200); adds `distanceKm` to results |
| `sort` | `rating` \| `price_asc` \| `price_desc` \| `distance` | Default `rating`; `distance` requires `lat`/`lng` |
| `page` | number ≥ 1 | 12 results per page |

## Reviews & Q&A

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /spas/:slug/reviews` | Public | Published reviews only (newest first), paginated, plus `summary` (overall average, distribution, recommend %, category averages). |
| `POST /spas/:slug/reviews` | Auth | Multipart or JSON. Overall rating 1.0–5.0 in 0.5 steps, title 5–120, body 30–5000, `recommends`, `confirmedGenuine: true`, optional visit month/year, category ratings or `null` (N/A), up to 5 photos. Max 3 reviews per user per spa (`409`). Published immediately. |
| `POST /reviews/:id/response` | Vendor | Body `{ body }`. Only the spa's owner; one response per review. |
| `GET /spas/:slug/questions` | Public | Questions with nested answers; owner answers flagged `isVendor`. |
| `POST /spas/:slug/questions` | Auth | Body `{ body }`. |
| `POST /questions/:id/answers` | Auth | Body `{ body }`. Anyone may answer; the spa owner's answers are badged. |

## Wishlist

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /wishlist` | Auth | Saved spas as full `SpaSummary` cards. |
| `GET /wishlist/ids` | Auth | Just the spa ids (used to hydrate heart buttons cheaply). |
| `PUT /wishlist/:spaId` | Auth | Add (idempotent). |
| `DELETE /wishlist/:spaId` | Auth | Remove (idempotent). |

## Public profiles

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /users/:username` | Public | Profile (name, avatar, bio, joined date) + their reviews with spa links. |

## Availability & bookings

| Method & path | Access | Description |
| --- | --- | --- |
| `GET /spas/:slug/availability?treatmentId&date` | Public | Free 30-min-grid start times for a session treatment on `date` (YYYY-MM-DD), from open hours minus closures minus existing bookings. → `{ date, slots: ["09:00", …] }`. |
| `GET /treatments/:id/retreat-slots` | Public | Upcoming departures: `{ id, startDate, capacity, remaining }[]`. |
| `POST /bookings` | Auth | Create a booking (below). |
| `GET /bookings/mine` | Auth | The caller's bookings, newest first. |
| `GET /bookings/:code` | Auth | One booking by public code (owner only). |

`POST /bookings` body:

```json
{
  "spaSlug": "ayur-veda-retreat-kochi",
  "treatmentId": 3,
  "startsAt": "2026-09-01T09:00:00.000Z",   // sessions: chosen slot (UTC)
  "retreatSlotId": 7,                        // retreats: chosen departure
  "partySize": 2,
  "notes": "optional"
}
```

Responses:

- `201 { booking, payment: null }` — nothing due online (pay-at-spa, or Stripe unconfigured →
  auto-confirmed dev mode).
- `201 { booking, payment: { clientSecret, amountMinor, currency } }` — confirm this
  PaymentIntent with Stripe Elements; the booking stays `pending_payment` until the webhook
  confirms it.
- `409` — slot taken, retreat full, vendor not approved, or spa can't take online payments yet.

Amount charged now, by the spa's payment mode: `full_prepay` → total; `deposit` →
`total × deposit_bps / 10000`; `booking_fee` → flat `booking_fee_minor`; `pay_at_spa` → 0.

## Vendor (role: vendor; all under `/vendor`)

| Method & path | Description |
| --- | --- |
| `POST /vendor/register` | Auth (any role). Body `{ businessName }`. Upgrades caller to vendor with status **pending**. |
| `GET /vendor/me` | Vendor profile: `{ id, businessName, status, stripeOnboarded, spas: [...] }`. |
| `POST /vendor/stripe/onboard` | Creates/reuses a Stripe Express account. → `{ url }` (hosted onboarding). `503` if Stripe unconfigured. |
| `GET /vendor/stripe/status` | Re-syncs `charges_enabled && payouts_enabled` from Stripe. → `{ onboarded }`. |
| `POST /vendor/spas` | Create a listing (starts unpublished). Body: name, descriptions, address, `cityId`, lat/lng, contact, `paymentModeCode`, `depositBps?`, `bookingFeeMinor?`, `currencyCode`, `amenityIds[]`, `shopifyCollectionHandle?`. |
| `PUT /vendor/spas/:id` | Update the same fields plus `isPublished`. Publishing while the vendor is not approved → `409 "awaiting approval"`. |
| `GET /vendor/spas/:id` | Full listing for the editor (incl. hours, photos, treatments, retreat slots). |
| `PUT /vendor/spas/:id/hours` | Replace weekly hours: `{ hours: [{ weekday: 0–6, opensAt: "09:00", closesAt: "18:00" }] }`. |
| `POST /vendor/spas/:id/photos` | Add photo `{ url, alt?, sortOrder? }`. |
| `DELETE /vendor/photos/:photoId` | Remove photo. |
| `POST /vendor/spas/:id/treatments` | Create treatment: `{ name, description, categoryId, kind: "session"\|"retreat", durationMinutes?, nights?, priceMinor, isActive }`. |
| `PUT /vendor/treatments/:id` | Update / deactivate a treatment. |
| `POST /vendor/treatments/:id/retreat-slots` | Add departure `{ startDate, capacity }` (retreats only). |
| `GET /vendor/bookings` | All bookings across the vendor's spas with guest contact info and amounts. |
| `PATCH /vendor/bookings/:id/status` | Body `{ status: "confirmed"\|"cancelled"\|"completed"\|"no_show" }`. |
| `GET /vendor/reviews` | All reviews of the vendor's spas (with any existing responses). |

Ownership is enforced in SQL — a vendor can never read or mutate another vendor's rows.

## Admin (role: admin; all under `/admin`)

| Method & path | Description |
| --- | --- |
| `GET /admin/stats` | Platform counters: users, vendors by status, spas published/total, bookings, gross booking value, platform fees, reviews. |
| `GET /admin/vendors` | All vendors (pending first) with owner contact, spa counts, Stripe status. |
| `PATCH /admin/vendors/:id/status` | Body `{ status: "pending"\|"approved"\|"suspended" }`. Non-approved statuses immediately unpublish all the vendor's spas. |
| `GET /admin/spas` | Every listing with vendor + publish state. |
| `PATCH /admin/spas/:id` | Body `{ isPublished: boolean }`. Publishing is refused (`409`) if the vendor isn't approved. |
| `GET /admin/reviews` | Latest 100 reviews with author emails and status (includes hidden). |
| `PATCH /admin/reviews/:id` | Body `{ status: "published"\|"hidden", reason? }`. Hide/restore. Reason is internal-only. |
| `DELETE /admin/reviews/:id` | Permanently remove a review (cascades response and photos). |
| `GET /admin/bookings` | Latest 100 bookings platform-wide with fee breakdown. |

## Stripe webhook

| Method & path | Access | Description |
| --- | --- | --- |
| `POST /webhooks/stripe` | Stripe only | Raw-body endpoint, signature-verified with `STRIPE_WEBHOOK_SECRET`. Handles `payment_intent.succeeded` (booking → `confirmed`, `paid_minor` updated) and `payment_intent.payment_failed`. Every event is recorded once in `payment_events` (idempotent by `stripe_event_id`). Bad signature → `400`; Stripe unconfigured → `503`. |

Point Stripe at `https://<your-api-domain>/webhooks/stripe` with those two event types enabled.
