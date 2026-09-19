# Vendor Guide — Running Your Spa on VedaFinder

Everything a spa/health-center owner needs: registration, approval, building a listing, getting
paid, and day-to-day operations. Demo accounts (seeded data): `vendor1@vedicspas.test`,
`vendor2@vedicspas.test`, or `vendor3@vedicspas.test`, password `password123` — each owns
approved, published spas.

## 1. Becoming a vendor

1. Create a normal account (or sign in) — every vendor account is also a user account.
2. Go to **List your spa** in the header (`/vendor/register`), enter your business name, and
   submit. Your account is upgraded to the vendor role immediately.
3. Your vendor account starts as **pending**. You can prepare everything — listing, photos,
   treatments, opening hours, even Stripe onboarding — but you cannot *publish* until a
   platform admin approves you. Your dashboard shows an amber "awaiting approval" banner until
   then; if you're ever **suspended**, a red banner appears and all your listings are taken off
   the marketplace automatically.

## 2. The vendor dashboard (`/vendor`)

The dashboard shows your approval status, your Stripe payout status, and your listings. From
here you reach the three work areas: **Listings**, **Bookings** (`/vendor/bookings`), and
**Reviews** (`/vendor/reviews`).

## 3. Getting paid — Stripe onboarding

To accept prepayments or deposits online you need a Stripe Express account:

1. On the dashboard, click **Connect Stripe** — you're sent to Stripe's hosted onboarding to
   enter identity and bank details. VedaFinder never sees this information.
2. When Stripe reports charges + payouts enabled, your dashboard shows **Payouts active**.
   (The status re-syncs when you return; click the status to refresh if needed.)

How money flows: for *full prepayment* and *deposit* bookings, the guest's charge is routed
directly to **your** Stripe account minus the platform's commission (default 7.5%, set by the
platform operator); Stripe pays out to your bank on its normal schedule. For *booking fee*
mode, the small fee is the platform's revenue and the guest pays you the full treatment price
in person — so booking-fee and pay-at-spa modes work even **without** Stripe onboarding.

## 4. Building your listing

**Listings → Add spa** (`/vendor/spas/new`), or edit an existing one:

- **Essentials** — name, short description (search cards), full description, address, city
  (from the platform's destination list), and exact latitude/longitude (right-click your
  location in Google Maps → the coordinates are shown). Coordinates power the map and "near
  me" search.
- **Contact** — phone, email, website.
- **Payment policy** — choose one of the four modes and its parameter:
  - *Pay at the spa* — no online payment; lowest friction, no protection against no-shows.
  - *Booking fee* — guest pays a small flat fee online (you set the amount, e.g. $5) which is
    kept by the platform; deters no-shows without you needing Stripe.
  - *Deposit* — guest pays a percentage you choose (e.g. 20%) online, straight to your Stripe
    account; balance in person. Good for expensive treatments.
  - *Full prepayment* — the entire amount online at booking. Best for retreats.
  You can change the mode at any time; existing bookings keep the terms they were made under.
- **Currency** — the currency all your prices are in.
- **Amenities** — check everything you offer; each is a search filter, so accuracy wins
  bookings.
- **Shopify collection handle** — if the platform sells your herbs/products through its Shopify
  store, put your collection's handle here (e.g. `kerala-ayurveda-herbs`) and a shop section
  appears on your spa page. See [`../SHOPIFY_SETUP.md`](../SHOPIFY_SETUP.md).
- **Photos** — choose one or more JPEG/PNG/WebP/GIF files (max 8 MB each) and give each a
  short title. Titles appear on the public spa gallery. Files are stored on the platform
  server disk; the first photo is your search card image.
- **Opening hours** — set open/close per weekday; leave a day empty to be closed. These hours
  generate your bookable session slots, so keep them accurate.

### Treatments & retreats

Add any number of each:

- **Session** — a timed appointment (name, category, duration in minutes, price per person).
  Guests book specific start times on a 30-minute grid inside your opening hours. *V1 assumes
  one session at a time* — a booked slot blocks overlapping times.
- **Retreat** — a multi-night program (name, category, nights, price per person). After you save
  the retreat, add **start dates** and a capacity for each date. Guests pick one of those dates
  on your listing; the platform stops selling a date when it is full. Seeded demo retreats already
  have monthly departures — retreats you add yourself start with none until you add dates.

Deactivate (rather than delete) a treatment to stop new bookings while keeping history intact.

### Publishing

Toggle **Published** in the listing editor. Requirements: your vendor account must be
*approved* (otherwise you get "awaiting approval"). Unpublished listings are invisible to
guests but fully editable. Once published, your page appears in search within a few minutes
(prerendered pages refresh on a ~5-minute cycle).

## 5. Managing bookings (`/vendor/bookings`)

Every booking across all your spas, newest first, with: booking code, guest name/email/phone,
treatment, date/time, party size, total, **paid online** amount, and payment mode. Use the
status actions:

- **Confirm** — for anything pending that you've verified.
- **Completed** — after the visit (keeps your records clean).
- **No-show** — guest didn't arrive.
- **Cancelled** — booking called off. For prepaid/deposit bookings, issue any refund from your
  own Stripe dashboard in V1 (an automated refund flow is a planned extension).

Amounts due at the spa = total − paid online; collect these on arrival.

## 6. Reviews & community (`/vendor/reviews`)

All reviews across your spas, with a reply box under each. You get **one public response per
review** — thank positive reviewers, address criticism factually. Responses appear on your spa
page as "Response from <your business>". Also watch your spa page's **Q&A** section: answer
signed in with your vendor account and your replies are badged "Spa owner". If a review is
abusive, contact the platform admin, who can remove it.

## 7. Vendor FAQ

- **Why can't I publish?** Your vendor account is pending or suspended — see the banner on your
  dashboard. An admin has to approve you.
- **Why can't guests prepay?** Prepay/deposit modes need completed Stripe onboarding. Until
  then, use pay-at-spa or booking-fee mode.
- **What does the platform charge?** A commission (default 7.5%) on money collected online for
  prepay/deposit bookings, and the flat booking fee in booking-fee mode. Payments settled
  in person at your spa are never touched.
- **Can I have multiple locations?** Yes — each location is its own listing under one vendor
  account, with its own hours, treatments, payment mode, and Shopify collection.
