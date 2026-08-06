# Deployment Guide — Docker & Railway

Three deployable pieces: **MariaDB/MySQL**, the **API** (`apps/api/Dockerfile`), and the **web
app** (`apps/web/Dockerfile`). Both Dockerfiles are multi-stage, build from the **repo root**
(the npm-workspaces context), and are what both Docker Compose and Railway use.

- [1. Configuration reference](#1-configuration-reference)
- [2. Local / single-server deployment with Docker Compose](#2-local--single-server-deployment-with-docker-compose)
- [3. Deploying on Railway](#3-deploying-on-railway)
- [4. Production checklist](#4-production-checklist)

---

## 1. Configuration reference

### API service (`apps/api`)

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | one of the two styles | Single connection string, e.g. `mysql://user:pass@host:3306/vedic_spas`. Takes precedence. (`MYSQL_URL` is also accepted — Railway's MySQL exposes that name.) |
| `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` | one of the two styles | Discrete equivalents, used when no URL is set. |
| `PORT` | no | Listen port; injected automatically by Railway/Render/Heroku. Falls back to `API_PORT` (default 4100). |
| `HOST` | no | Bind address, default `0.0.0.0`. Set `::` on platforms with IPv6 private networking (Railway). |
| `API_ORIGIN` | yes | Public URL of the API itself (used for Stripe onboarding return URLs). |
| `WEB_ORIGIN` | yes | Public URL of the web app — the **only** origin allowed by CORS. |
| `AUTH_SECRET` | yes | JWT signing secret, **must be identical on web and API**. `openssl rand -base64 32`. |
| `STRIPE_SECRET_KEY` | for real payments | Platform secret key (`sk_live_…`/`sk_test_…`). Empty = dev mode (bookings auto-confirm without charging). |
| `STRIPE_WEBHOOK_SECRET` | with Stripe | Signing secret of the `/webhooks/stripe` endpoint (`whsec_…`). |
| `PLATFORM_FEE_BPS` | no (750) | Platform commission on prepay/deposit charges, basis points. |
| `DEFAULT_BOOKING_FEE_MINOR` | no (500) | Default flat booking fee in minor units. |

### Web service (`apps/web`)

`NEXT_PUBLIC_*` values are **baked in at build time** (declared as `ARG`s in the Dockerfile) —
rebuild after changing them. The rest are runtime variables.

| Variable | When | Required | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | build | yes | Public API URL used by the browser. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | build | for payments | Stripe publishable key (`pk_…`). |
| `NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN` / `NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN` | build | for shop links | Storefront domain + public Storefront token. |
| `API_URL_INTERNAL` | runtime | no | API URL for **server-side** fetches (private network, e.g. `http://api:4100` in compose). Falls back to `NEXT_PUBLIC_API_URL`. |
| `AUTH_SECRET` | runtime | yes | Same value as the API. |
| `AUTH_TRUST_HOST` | runtime | yes in prod | Set `true` when running behind a proxy/platform (Auth.js requirement). |
| `AUTH_URL` | runtime | recommended | The web app's public URL, e.g. `https://app.example.com` — keeps Auth.js redirects correct. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | runtime | optional | Enables "Continue with Google". Add `<web-url>/api/auth/callback/google` as an authorized redirect URI in Google Cloud Console. |
| `SHOPIFY_STORE_DOMAIN` / `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | runtime | for shop | Server-side Storefront credentials (see `SHOPIFY_SETUP.md`). |

---

## 2. Local / single-server deployment with Docker Compose

`docker-compose.yml` at the repo root runs the full stack and reads variables from `.env`:

```bash
cp .env.example .env            # set AUTH_SECRET at minimum
docker compose up -d --build    # mariadb :3306, api :4100, web :3000

# First run only — create schema, then (optionally) demo data:
docker compose run --rm api node apps/api/dist/db/migrate.js
docker compose run --rm api node apps/api/dist/db/seed.js
```

Details worth knowing:

- The web container reaches the API through the compose network (`API_URL_INTERNAL=http://api:4100`);
  the browser uses `NEXT_PUBLIC_API_URL` (default `http://localhost:4100`).
- The web image builds without a running API — prerendered pages start empty and fill in via
  ISR within a minute of the stack coming up.
- `npm run db:migrate` **drops and recreates every table**. Never run it against a database
  with real data; evolve production schemas with explicit `ALTER TABLE`.
- Database data persists in the `mariadb_data` volume. Back up with
  `docker compose exec mariadb mariadb-dump -u vedic -pvedicpassword vedic_spas > backup.sql`.
- For a public VPS deployment, put a reverse proxy (Caddy/nginx/Traefik) with TLS in front of
  ports 3000 and 4100, then set `API_ORIGIN`, `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL`, `AUTH_URL`
  to the public HTTPS URLs and rebuild the web image (the `NEXT_PUBLIC_` value is baked in).

---

## 3. Deploying on Railway

The repo is Railway-ready: the API honors Railway's injected `PORT`, accepts a
`DATABASE_URL`/`MYSQL_URL` connection string, and can bind IPv6 (`HOST=::`) for Railway's
private network; the Next.js standalone server honors `PORT` natively; and both Dockerfiles
build with the repo root as context, which is Railway's default.

You'll create **one project with three services**: a MySQL database, the API, and the web app.

### 3.1 Database

1. In your Railway project: **Create → Database → MySQL**.
2. That's it. Railway exposes `MYSQL_URL` (private) and `MYSQL_PUBLIC_URL` (for connecting from
   your machine). The schema is MySQL 8–compatible; no MariaDB-specific features are used. (If
   you prefer real MariaDB, deploy the `mariadb:11.4` image as a custom service with a volume
   instead.)

### 3.2 API service

1. **Create → GitHub Repo** and select this repository (push it to GitHub first).
2. In the new service's **Settings**, leave *Root Directory* at the repo root, and in
   **Variables** add — the first one tells Railway which Dockerfile to use:

```
RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile
DATABASE_URL=${{MySQL.MYSQL_URL}}
HOST=::
AUTH_SECRET=<openssl rand -base64 32 — same value as the web service>
API_ORIGIN=<this service's public URL — add after step 4>
WEB_ORIGIN=<the web service's public URL — add after 3.3>
STRIPE_SECRET_KEY=sk_live_...            # optional at first
STRIPE_WEBHOOK_SECRET=whsec_...          # after 3.5
PLATFORM_FEE_BPS=750
DEFAULT_BOOKING_FEE_MINOR=500
```

   `${{MySQL.MYSQL_URL}}` is a Railway **reference variable** — it stays in sync with the
   database service automatically.

3. Deploy. In **Settings → Networking**, click **Generate Domain** (Railway detects the
   listening port automatically) — this gives you `https://<api>.up.railway.app`.
4. Set `API_ORIGIN` to that URL. Optionally set a healthcheck path of `/health` in
   Settings → Deploy.

### 3.3 Web service

1. **Create → GitHub Repo** again, same repository (a second service on the same repo).
2. **Variables**:

```
RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile
NEXT_PUBLIC_API_URL=<the API service's public URL>
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...           # optional at first
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com # optional
NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=...                  # optional
AUTH_SECRET=<same value as the API service>
AUTH_TRUST_HOST=true
AUTH_URL=<this service's public URL — add after generating the domain>
GOOGLE_CLIENT_ID=...                                      # optional
GOOGLE_CLIENT_SECRET=...                                  # optional
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com             # optional
SHOPIFY_STOREFRONT_ACCESS_TOKEN=...                       # optional
```

   Railway makes service variables available **as Docker build args**, and the web Dockerfile
   declares the matching `ARG`s — so the `NEXT_PUBLIC_` values set here are correctly baked
   into the client bundle. Changing any of them later requires a redeploy (Railway rebuilds).

3. Deploy, **Generate Domain**, then set `AUTH_URL` to it — and go back to the API service and
   set `WEB_ORIGIN` to it (this is the CORS allowlist; sign-in will fail until it's right).
4. Optional, cheaper server-side fetches: enable Private Networking and set
   `API_URL_INTERNAL=http://<api-service-name>.railway.internal:<api PORT>` on the web service
   (this is why the API sets `HOST=::` — Railway's private network is IPv6). Skipping this is
   fine; the web server then calls the API over its public URL.

### 3.4 Schema and seed data

The migration **drops and recreates all tables**, so it's run manually, once, from your
machine against the database's public endpoint:

```bash
npm install && npm run build --workspace=apps/api
# Copy MYSQL_PUBLIC_URL from the MySQL service's "Connect" tab:
DATABASE_URL='mysql://root:<password>@<host>.proxy.rlwy.net:<port>/railway' \
  node apps/api/dist/db/migrate.js
# Optional demo data:
DATABASE_URL='mysql://root:...' node apps/api/dist/db/seed.js
```

(Equivalently, `railway run` with the Railway CLI injects the variables for you.)

### 3.5 Stripe webhook

In the Stripe dashboard → Developers → Webhooks → **Add endpoint**:

- URL: `https://<api>.up.railway.app/webhooks/stripe`
- Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
- Copy the signing secret into the API service's `STRIPE_WEBHOOK_SECRET` and redeploy.

Without Stripe keys everything still works in dev mode (bookings auto-confirm, nothing is
charged) — you can launch the marketplace first and switch payments on later.

### 3.6 Post-deploy verification

1. `https://<api-domain>/health` → `{"ok":true}`; `/meta` returns cities/amenities.
2. Open the web domain: home page shows seeded spas (first visit may take ~1 min while ISR
   fills prerendered pages after a fresh deploy).
3. Sign in as `admin@vedicspas.test` / `password123` → `/admin` loads stats.
4. Make a pay-at-spa booking end-to-end as `asha@example.test`.
5. If Stripe is live: card-test a deposit booking (`4242 4242 4242 4242` with test keys) and
   confirm the booking flips to `confirmed` (webhook working).

Both services auto-redeploy on every push to the connected branch.

---

## 4. Production checklist

- [ ] Strong unique `AUTH_SECRET` (identical on web + API), strong DB password.
- [ ] `WEB_ORIGIN` (CORS), `API_ORIGIN`, `AUTH_URL`, `NEXT_PUBLIC_API_URL` all set to the real
      HTTPS domains.
- [ ] Live Stripe keys + webhook endpoint verified; `PLATFORM_FEE_BPS` set to your real
      commission.
- [ ] Google OAuth redirect URI updated to the production domain (if used).
- [ ] Don't run the seed in production (or wipe demo rows after testing); change/remove the
      seeded admin account.
- [ ] Database backups scheduled (Railway backups, or cron `mariadb-dump` elsewhere).
- [ ] Never run `db:migrate` against production data — it drops tables. Use `ALTER TABLE`.
- [ ] Custom domains added in Railway (Settings → Networking → Custom Domain) with the origin
      variables updated accordingly (requires a web rebuild for `NEXT_PUBLIC_API_URL`).
