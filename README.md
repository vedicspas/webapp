# VedaFinder — Ayurvedic spa discovery & booking

A mobile-first web application, like TripAdvisor but specifically for Ayurvedic spas and health
centers: search, reviews, Q&A, wishlists, public profiles, built-in reservations paid through
Stripe Connect, and per-spa herb/product shops powered by Shopify.

## Documentation

| Document | Contents |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full system & feature reference: every feature and how it works, database schema, payment engine, caching/performance strategy, security notes |
| [docs/API.md](docs/API.md) | Complete HTTP endpoint reference for the Fastify API |
| [docs/GUIDE_TRAVELERS.md](docs/GUIDE_TRAVELERS.md) | How to use the site as a guest: search, booking, payments, reviews |
| [docs/GUIDE_VENDORS.md](docs/GUIDE_VENDORS.md) | Running a spa: registration & approval, listings, Stripe payouts, bookings |
| [docs/GUIDE_ADMINS.md](docs/GUIDE_ADMINS.md) | Operating the platform: vendor approvals, moderation, revenue |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Configuration reference, Docker Compose deployment, and step-by-step **Railway** deployment (the repo is Railway-ready) |
| [SHOPIFY_SETUP.md](SHOPIFY_SETUP.md) | Setting up the Shopify store and per-spa collections |

## Stack

| Layer     | Choice                                                          |
| --------- | --------------------------------------------------------------- |
| Frontend  | Next.js (App Router, prerendered/ISR), Tailwind CSS, Zustand    |
| API       | Standalone Node.js server: Fastify + hand-written SQL (mysql2)  |
| Database  | MariaDB, fully normalized; static lookup tables cached as in-memory arrays at API startup |
| Auth      | Auth.js (credentials + Google) issuing a JWT shared with the API |
| Payments  | Stripe Connect **Express** (destination charges to vendors)     |
| Shop      | Shopify Storefront API (see `SHOPIFY_SETUP.md`)                 |
| Maps      | Leaflet + OpenStreetMap (no API key needed)                     |

## Repository layout

```
apps/api          Fastify API (port 4100)
  src/db          schema.sql, migrate, seed
  src/cache       staticCache.ts — lookup tables loaded into arrays at startup
  src/routes      auth, spas, reviews, questions, wishlist, users, bookings, vendor, webhooks
apps/web          Next.js app (port 3000)
  app/            routes (home, /spas, /spas/[slug], /vendor, ...)
  components/     UI components (booking widget, map, reviews, ...)
  stores/         Zustand stores (search filters, wishlist, static meta)
packages/shared   TypeScript types shared by both apps
```

## Getting started

### Option A: everything in Docker

Requirements: Docker only.

```bash
cp .env.example .env                 # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build         # MariaDB :3306, API :4100, web :3000
# First run only - create schema and demo data:
docker compose run --rm api node apps/api/dist/db/migrate.js
docker compose run --rm api node apps/api/dist/db/seed.js
```

Notes:
- `NEXT_PUBLIC_*` values are baked into the web image at build time (compose passes them as
  build args from `.env`) - rebuild the web image after changing them.
- Inside the compose network the web server reaches the API at `http://api:4100`
  (`API_URL_INTERNAL`); the browser uses `NEXT_PUBLIC_API_URL`.
- The web image builds without a running API; prerendered pages start empty and fill in via
  ISR within a minute of the stack coming up.

### Option B: local development (hot reload)

Requirements: Node 22 (`nvm use`), Docker for the database.

```bash
cp .env.example .env         # then set AUTH_SECRET (openssl rand -base64 32)
docker compose up -d mariadb # only the database
npm install
npm run db:migrate           # create schema
npm run db:seed              # demo data
npm run dev                  # API on :4100 + web on :3000, both with hot reload
```

Demo logins (password `password123` for all):

- Traveler: `asha@example.test`, `marco@example.test`
- Vendors: `vendor1@vedicspas.test` … `vendor3@vedicspas.test`
- Admin: `admin@vedicspas.test`

## Payments (Stripe Connect Express)

Each spa chooses one of four payment modes (stored per spa, changeable in the vendor dashboard):

| Mode          | Guest pays online at booking          | Money flow                                             |
| ------------- | ------------------------------------- | ------------------------------------------------------ |
| `full_prepay` | Full treatment price                  | Destination charge to vendor minus platform fee (`PLATFORM_FEE_BPS`) |
| `deposit`     | A percentage (vendor picks, e.g. 20%) | Destination charge to vendor minus platform fee; balance collected at the spa |
| `booking_fee` | Small fixed fee (e.g. $5)             | Kept by the platform; treatment paid at the spa        |
| `pay_at_spa`  | Nothing                               | Free reservation                                        |

Setup:

1. Create a Stripe account, enable **Connect → Express**.
2. Put `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` (+ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) in `.env`.
3. Forward webhooks locally: `stripe listen --forward-to localhost:4100/webhooks/stripe`
   and copy the printed secret into `STRIPE_WEBHOOK_SECRET`.
4. Vendors click **Connect Stripe** in the vendor dashboard and complete Stripe's hosted
   Express onboarding. Cards are entered in Stripe Elements / stored by Stripe only — card
   numbers never touch our servers.

If the Stripe keys are left empty (local development), bookings that would require payment are
confirmed immediately in "dev mode" without charging.

## Shopify product shops

Each spa can link a Shopify **collection**; its products render on the spa page and link to
Shopify checkout. Full store-side instructions: **`SHOPIFY_SETUP.md`**.

## Performance notes

- Home and spa detail pages are prerendered (`generateStaticParams`) and revalidated in the
  background every 5 minutes (ISR — the App Router equivalent of `getStaticProps`).
- Public API GETs are fetch-cached by Next with per-endpoint revalidate windows.
- The API keeps all static lookup tables (cities, countries, amenities, treatment categories,
  payment modes, booking statuses, currencies, roles) in memory as plain arrays, loaded once at
  startup (`GET /meta` serves them straight from RAM); the web app hydrates them into a Zustand
  store once per session.
- Images use `next/image` with responsive sizes; the map bundle loads only on demand
  (`dynamic(..., { ssr: false })`).

## V1 simplifications worth knowing

- Session availability assumes **one treatment room per spa** (no overlapping session bookings);
  add a `rooms`/capacity column to extend.
- Availability times are stored and displayed in the spa's local wall-clock time (UTC in DB).
- Refunds/cancellation fees are manual (vendor cancels, refund via Stripe dashboard).
