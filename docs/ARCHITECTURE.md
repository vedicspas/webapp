# VedaFinder — Architecture & Feature Reference

This document describes everything that exists in the codebase: the system architecture, every
feature and how it works internally, the database schema, the payment engine, and the caching
and performance strategy.

Companion documents:

- [`API.md`](./API.md) — complete HTTP endpoint reference
- [`GUIDE_TRAVELERS.md`](./GUIDE_TRAVELERS.md) / [`GUIDE_VENDORS.md`](./GUIDE_VENDORS.md) / [`GUIDE_ADMINS.md`](./GUIDE_ADMINS.md) — how to use the product in each role
- [`DEPLOYMENT.md`](./DEPLOYMENT.md) — Docker and Railway deployment
- [`../SHOPIFY_SETUP.md`](../SHOPIFY_SETUP.md) — Shopify store configuration

---

## 1. System overview

VedaFinder is a TripAdvisor-style marketplace specifically for Ayurvedic spas, panchakarma
hospitals, and wellness retreats. It combines:

1. **Discovery** — search, filters, maps, reviews, Q&A, wishlists, public traveler profiles.
2. **Commerce** — built-in reservations with four vendor-selectable payment modes, processed by
   Stripe Connect so card data never touches our servers and vendor payouts are automatic.
3. **Retail** — each spa can attach a Shopify collection of herbs/products; the app displays
   them and hands purchases to Shopify checkout.
4. **Operations** — a vendor dashboard for running a spa on the platform, and an admin dashboard
   for approving vendors and moderating the marketplace.

```
                 ┌──────────────────────────────┐
   Browser ────► │  Next.js (apps/web) :3000    │────► Shopify Storefront API
                 │  SSG/ISR pages + Zustand     │      (per-spa product collections)
                 │  Auth.js session (JWT)       │
                 └───────────────┬──────────────┘
                                 │ Bearer JWT (shared AUTH_SECRET)
                 ┌───────────────▼──────────────┐
                 │  Fastify API (apps/api) :4100│────► Stripe (Connect Express,
                 │  hand-written SQL (mysql2)   │      PaymentIntents, webhooks)
                 │  static-table cache in RAM   │
                 └───────────────┬──────────────┘
                                 │
                 ┌───────────────▼──────────────┐
                 │  MariaDB (fully normalized)  │
                 └──────────────────────────────┘
```

### Technology choices

| Layer      | Choice | Why |
| ---------- | ------ | --- |
| Frontend   | Next.js App Router | Prerendering (SSG + ISR) for speed and SEO; server components keep client JS small |
| CSS        | Tailwind CSS v4 | Utility-first, mobile-first; custom `veda`/`turmeric` palette in `globals.css` |
| Client state | Zustand | Small, no boilerplate; stores for search filters, wishlist, and static lookup data |
| API        | Standalone Node.js: Fastify | Deliberately **not** Next.js API routes; independent scaling & deployment; Fastify for speed |
| DB access  | mysql2 with hand-written SQL | Full control over normalized queries; no ORM overhead |
| Database   | MariaDB | Relational, fully normalized schema |
| Auth       | Auth.js (NextAuth v5) | Hosted session handling in the web app; issues an HS256 JWT the API verifies independently |
| Payments   | Stripe Connect Express | PCI burden stays with Stripe; automatic vendor payouts; hosted vendor onboarding |
| Shop       | Shopify Storefront API | Product/inventory/checkout entirely on Shopify; app links via one column |
| Maps       | Leaflet + OpenStreetMap | No API key, no cost, loads on demand |

### Repository layout

```
vedic-spas/
├── apps/
│   ├── api/                    Fastify API
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts        server bootstrap, error handler, route registration
│   │       ├── config.ts       env loading (root .env, DATABASE_URL, PORT)
│   │       ├── cache/staticCache.ts   in-memory lookup-table cache
│   │       ├── db/             pool.ts, schema.sql, migrate.ts, seed.ts
│   │       ├── lib/            stripe.ts, spaQueries.ts (shared SQL fragments)
│   │       ├── plugins/auth.ts JWT sign/verify, requireAuth/optionalAuth
│   │       └── routes/         meta, auth, spas, reviews, questions, wishlist,
│   │                           users, bookings, vendor, admin, webhooks
│   └── web/                    Next.js app
│       ├── Dockerfile
│       ├── auth.ts             Auth.js configuration
│       ├── app/                routes (see section 3)
│       ├── components/         UI components
│       ├── lib/                api.ts (server fetch), useApi.ts (client fetch),
│       │                       shopify.ts, format.ts
│       └── stores/             searchStore, wishlistStore, metaStore (Zustand)
├── packages/shared/            TypeScript types shared by both apps
├── docker-compose.yml          full stack: mariadb + api + web
├── .env.example                every configuration variable, documented
└── docs/                       this documentation
```

---

## 2. Database schema

Fully normalized (3NF); every enumerable value lives in a lookup table referenced by foreign
key. Schema source of truth: `apps/api/src/db/schema.sql`.

### Static lookup tables (cached in RAM — see section 4)

| Table | Contents |
| ----- | -------- |
| `roles` | `traveler`, `vendor`, `admin` |
| `currencies` | ISO code + symbol (USD, EUR, INR, LKR, IDR seeded) |
| `countries` | ISO-2 + name |
| `cities` | name, country FK, centroid lat/lng (used for destination filters and vendor listing defaults) |
| `amenities` | e.g. Steam room, Herbal pharmacy, Yoga shala, Doctor consultation… |
| `treatment_categories` | e.g. Abhyanga, Shirodhara, Panchakarma, Detox Retreat… |
| `payment_modes` | `full_prepay`, `deposit`, `booking_fee`, `pay_at_spa` (+ descriptions) |
| `booking_statuses` | `pending_payment`, `confirmed`, `cancelled`, `completed`, `no_show` |

### Core tables

| Table | Purpose / notable columns |
| ----- | ------------------------- |
| `users` | `role_id` FK, unique `email` + `username`, `password_hash` (NULL for OAuth-only accounts), avatar, bio |
| `vendors` | 1:1 with a user. `status` ENUM (`pending`/`approved`/`suspended`) drives the **approval workflow**; `stripe_account_id` + `stripe_onboarded` for Connect |
| `spas` | The listing. Address + `city_id` FK + exact lat/lng, `slug` (public URL), `payment_mode_id` FK + `deposit_bps` + `booking_fee_minor` (mode parameters), `currency_id`, `shopify_collection_handle` (the **only** Shopify link), `is_published` |
| `spa_amenities` | many-to-many join (composite PK) |
| `spa_photos` | URL, alt text, sort order |
| `spa_open_hours` | one row per weekday (0=Sun…6=Sat) with open/close times; drives slot generation |
| `spa_closures` | date ranges when the spa is closed (holidays etc.) |
| `treatments` | `kind` ENUM `session` (has `duration_minutes`) or `retreat` (has `nights`); `category_id` FK; `price_minor` (integer minor units — never floats for money) |
| `retreat_slots` | departure dates for retreats: `start_date` + `capacity`; remaining places computed from bookings |
| `bookings` | public `code`, guest/spa/treatment FKs, `status_id`, **snapshot** of `payment_mode_id` at booking time, `starts_at`/`ends_at` (UTC), `party_size`, `total_minor`, `paid_minor`, `platform_fee_minor`, `stripe_payment_intent_id` |
| `payment_events` | webhook audit log; unique `stripe_event_id` makes webhook processing idempotent |
| `reviews` | rating 1–5 (CHECK constraint), title, body, optional `visited_on`, optional `booking_id` link |
| `review_responses` | one vendor response per review (UNIQUE `review_id`) |
| `questions` / `answers` | Q&A; answers carry `is_vendor` so owner replies get badged |
| `wishlist_items` | composite PK (`user_id`,`spa_id`) |

Conventions:

- **Money** is always integer minor units (`price_minor`, `total_minor`…, e.g. 4500 = $45.00).
- **Percentages** are basis points (`deposit_bps`: 2000 = 20%, `PLATFORM_FEE_BPS`: 750 = 7.5%).
- **Datetimes** are stored and read as UTC (the mysql2 pool is pinned to `timezone: "Z"`).
- Migration (`npm run db:migrate`) **drops and recreates** all tables — initial setup and
  development only. Evolve production schemas with explicit `ALTER TABLE` statements.

---

## 3. Feature catalog

### 3.1 Discovery (public)

**Home page** (`/`) — hero search, destination chips (from cached cities), treatment-category
chips, top-rated spa cards. Fully prerendered, revalidated in the background.

**Search** (`/spas`) — client-side page driven by the `searchStore` (Zustand). Filters:

- free-text (name/description `LIKE`),
- destination city / country,
- treatment category (spa must have an active treatment in it),
- multiple amenities (spa must have **all** selected),
- minimum rating (aggregate `HAVING`),
- payment option,
- **"Near me"** — browser geolocation → Haversine distance in SQL, 200 km radius, distance
  shown on cards, "Nearest" sort unlocked.
- Sorts: top-rated (default), price asc/desc, distance. Paginated (12/page).

**Map view** — toggle on the search page; Leaflet + OpenStreetMap with custom SVG pins and
popups (name, city, from-price). Loaded lazily via `next/dynamic` so the map bundle never loads
unless requested.

**Spa detail** (`/spas/[slug]`) — prerendered per spa (SSG + ISR): photo gallery (scroll-snap),
rating summary, description, amenity chips, weekly opening hours, treatment list, the booking
widget (below), the Shopify shop section, reviews, and Q&A.

### 3.2 Community

- **Reviews** — 1–5 stars + title + body; shown with author profile links. One **vendor
  response** per review, rendered in a highlighted block ("Response from …").
- **Q&A** — any signed-in user can ask; anyone can answer; answers by the spa owner are badged
  "Spa owner".
- **Wishlists** — heart button on every card/page; optimistic updates in `wishlistStore`;
  `/wishlist` page lists saved spas.
- **Public profiles** (`/profile/[username]`) — avatar, bio, member-since, full review history.

### 3.3 Reservations & payments

Treatments come in two kinds, handled by one booking engine:

- **Sessions** (e.g. "Abhyanga, 60 min"): guest picks a date → API computes free slots
  (30-minute grid) from `spa_open_hours` minus `spa_closures` minus overlapping non-cancelled
  bookings. *V1 assumes one treatment room per spa* (no overlapping sessions).
- **Retreats** (e.g. "7-Night Panchakarma"): guest picks a departure from `retreat_slots`;
  remaining places = capacity − sum of booked party sizes. Overbooking is rejected at insert
  time.

**Payment modes** (chosen per spa by the vendor, snapshotted onto each booking):

| Mode | Charged online now | Money flow |
| ---- | ------------------ | ---------- |
| `full_prepay` | 100% of price × party size | Stripe **destination charge** to the vendor's Connect account; platform keeps `application_fee_amount` = `PLATFORM_FEE_BPS` of the charge |
| `deposit` | vendor-chosen % (`deposit_bps`) | Same destination-charge mechanics on the deposit; balance is collected at the spa |
| `booking_fee` | flat fee (`booking_fee_minor`) | Charged on the **platform** account — the fee *is* the platform's revenue; treatment paid at the spa |
| `pay_at_spa` | nothing | Booking confirmed immediately; everything settled on site |

Booking lifecycle:

1. `POST /bookings` validates availability again (slot clash → HTTP 409), computes amounts,
   inserts the booking as `pending_payment` (or `confirmed` if nothing is due), creates the
   PaymentIntent, and returns its `client_secret`.
2. The web app renders **Stripe Payment Element** with that secret; the card is confirmed
   browser→Stripe directly. **Card data never touches our servers.**
3. Stripe calls `POST /webhooks/stripe` (signature-verified, raw-body). On
   `payment_intent.succeeded` the booking flips to `confirmed` and `paid_minor` is recorded;
   every event is stored in `payment_events` exactly once (idempotent by `stripe_event_id`).
4. Vendors later mark bookings `completed` / `no_show` / `cancelled` from their dashboard.

**Vendor onboarding** — "Connect Stripe" in the vendor dashboard creates an **Express** account
and redirects to Stripe's hosted onboarding; `GET /vendor/stripe/status` syncs
`charges_enabled && payouts_enabled` back into `vendors.stripe_onboarded`. Spas whose vendor
isn't onboarded can't take prepay/deposit bookings (clear 409 message); booking-fee and
pay-at-spa modes still work.

**Dev mode** — when `STRIPE_SECRET_KEY` is empty, bookings that would require payment are
confirmed immediately without charging, so the whole product is testable without a Stripe
account.

### 3.4 Shopify product shops

One column (`spas.shopify_collection_handle`) links a spa to a Shopify **collection**. The spa
page queries the Storefront API (GraphQL, cached 10 min) for up to 12 products and renders
cards linking to Shopify's hosted product pages/checkout. Money, inventory, taxes, shipping all
live in Shopify. If Shopify isn't configured, the section shows a friendly "shop being
prepared" note. Full setup: [`../SHOPIFY_SETUP.md`](../SHOPIFY_SETUP.md).

### 3.5 Vendor dashboard (`/vendor`)

- Approval-status banner (pending / suspended).
- Stripe Connect onboarding block.
- Spa list with edit links; **listing editor** (`/vendor/spas/[id]`, `new` for creation):
  details, city + coordinates, contact info, payment mode + deposit % / booking fee, Shopify
  collection handle, publish toggle, weekly opening hours, treatment/retreat CRUD.
- **Bookings** (`/vendor/bookings`): every booking across the vendor's spas with guest contact,
  amounts, paid-online amount, and status actions.
- **Reviews** (`/vendor/reviews`): all reviews with a reply box (one response per review).

### 3.6 Admin dashboard (`/admin`)

- **Stats**: users, pending vendors, published/total listings, bookings, gross booking value,
  platform fees collected.
- **Vendors**: the approval queue. New vendors register as `pending` and cannot publish;
  approving unlocks publishing; suspending immediately unpublishes all their listings.
- **Listings**: publish/unpublish any spa (publish refused if the vendor isn't approved).
- **Reviews**: delete abusive reviews.
- **Bookings**: platform-wide recent bookings with per-booking platform-fee breakdown.

All enforcement is server-side (`/admin/*` requires the admin role; vendor publish attempts are
rejected while pending), not just hidden UI.

### 3.7 Authentication

- **Credentials** (email + password, bcrypt-hashed by the API) and **Google OAuth** (enabled
  when `GOOGLE_CLIENT_ID/SECRET` are set; first sign-in upserts a user via `/auth/oauth`).
- Auth.js manages the browser session (JWT strategy). On login, the API issues a separate
  **HS256 access token** (30-day expiry, signed with the shared `AUTH_SECRET`) which Auth.js
  stores in its token and exposes as `session.apiToken`; all API calls send it as
  `Authorization: Bearer …`. The Fastify API verifies it with `jose` — no session store, no
  API→web coupling.
- Roles: `traveler` (default), `vendor` (after vendor registration), `admin` (seeded).

---

## 4. The static-table cache

`apps/api/src/cache/staticCache.ts` loads all eight lookup tables into plain in-process arrays
**once at API startup**, before the server accepts traffic. Lookups used on every request
(city/currency/payment-mode/status by id) are additionally indexed in `Map`s.

- `GET /meta` serves the whole set straight from RAM (`Cache-Control: max-age=300`).
- The web app fetches `/meta` server-side in the root layout (ISR-cached 1 h) and hydrates it
  into the `metaStore` Zustand store once per browser session — filter dropdowns, amenity
  chips, and payment-mode labels never trigger extra queries.
- After editing lookup tables (admin/SQL), restart the API or call `staticCache.reload()`.

## 5. Performance strategy

- **Prerendering**: home and every published spa page are generated at build time
  (`generateStaticParams`) and revalidated in the background (ISR, 5 min) — the App Router
  equivalent of `getStaticProps`. New spas appear without a rebuild (`dynamicParams`).
- **Fetch caching**: public API GETs from server components use per-endpoint `revalidate`
  windows (meta 1 h, spa detail 5 min, search/reviews/questions 60 s).
- **Client bundle discipline**: pages are server components; interactivity is isolated in
  client islands (booking widget, filters, wishlist button). The Leaflet map loads only on
  demand. `next/image` serves responsive, lazy images.
- **API**: single round-trip search query with rating/price aggregation via derived tables;
  lookup joins replaced by the RAM cache; connection pooling.
- Docker images are multi-stage; the web image uses Next.js `standalone` output.

## 6. Security notes

- Card data: Stripe Elements only; the API sees PaymentIntent ids, never PANs.
- Webhooks: signature verification against the raw body; idempotent event handling.
- AuthZ: role checks server-side on every vendor/admin route; vendors can only touch their own
  spas/treatments/photos/bookings (ownership enforced in SQL joins).
- SQL: parameterized queries everywhere; zod validation on every write endpoint.
- Passwords: bcrypt (cost 10); OAuth accounts have no password hash.
- Secrets: server-only env vars; the only `NEXT_PUBLIC_` values are the API URL, the Stripe
  *publishable* key, and the Shopify *Storefront* token — all designed to be public.

## 7. Known V1 simplifications

| Area | Simplification | Extension path |
| ---- | -------------- | -------------- |
| Session capacity | One concurrent session booking per spa | Add `rooms`/`therapists` capacity column; check `COUNT(overlapping) < capacity` |
| Cancellations & refunds | Manual (vendor cancels; refund via Stripe dashboard) | Add refund policy fields + `stripe.refunds.create` flow |
| Timezones | Slot times are the spa's local wall-clock, stored as UTC | Store IANA timezone per spa; convert in UI |
| Notifications | None (no email/SMS) | Transactional email (Resend/SES) on booking/approval events |
| Photo uploads | Vendors paste image URLs | S3/R2 presigned upload |
| Search text | SQL `LIKE` | FULLTEXT index or Meilisearch/Typesense |
| Cities | Fixed seeded list | Admin CRUD or geocoding API |
