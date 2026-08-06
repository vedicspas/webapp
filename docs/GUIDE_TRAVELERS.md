# Traveler Guide — Finding & Booking Ayurvedic Care

This guide walks through everything a guest can do on VedaFinder, from browsing anonymously to
managing bookings. Demo accounts (seeded data): `asha@example.test` or `marco@example.test`,
password `password123`.

## 1. Accounts

You can browse, search, read reviews, and view Q&A **without an account**. You need to sign in
to book, review, ask/answer questions, or save spas.

- **Register** (`/auth/register`): name, email, password (8+ characters). A username is
  generated from your email for your public profile; travelers is the default role.
- **Sign in** (`/auth/signin`): email + password, or **Continue with Google** if the platform
  has Google OAuth configured (first Google sign-in creates your account automatically).
- Your name in the header opens your account menu; **Sign out** is there too.

## 2. Finding a spa

**From the home page**: use the big search bar (free text + optional destination), tap a
destination chip (e.g. Kochi, Colombo, Ubud), or tap a treatment-category chip (e.g.
Panchakarma, Shirodhara).

**On the search page** (`/spas`), the filter panel offers:

- **Text search** — spa name or description.
- **Destination** — country or specific city.
- **Treatment category** — only spas that actually offer an active treatment in that category.
- **Amenities** — select several; results must have *all* of them.
- **Minimum rating** — 3+, 4+, 4.5+ stars.
- **Payment option** — e.g. only spas where you can pay on arrival.
- **Near me** — allow the browser location prompt; results are limited to 200 km, each card
  shows its distance, and a "Nearest" sort appears.
- **Sort** — Top rated (default), price low→high, high→low, nearest.

Toggle **Map** to see results as pins on a map; tap a pin for a mini-card linking to the spa.
On mobile the filters collapse behind a "Filters" button — the whole app is designed
phone-first.

Every card shows the spa's photo, star rating and review count, city, top amenities, its
payment policy ("Pay at the spa", "20% deposit", …), and its from-price. The heart in the
corner saves it to your wishlist.

## 3. The spa page

Each spa page (`/spas/<name>`) contains, top to bottom: a swipeable photo gallery; name,
rating, address and contact links; description; amenities; weekly opening hours; **Treatments &
Retreats** with prices; **Book your visit** (next section); **Herbs & products** (the spa's
Shopify shop, if it has one — purchases happen on Shopify's secure checkout); **Reviews**; and
**Questions & Answers**.

## 4. Booking

In **Book your visit**:

1. **Pick a treatment.** There are two kinds:
   - *Sessions* (e.g. "Abhyanga — 60 min"): pick a date, then pick one of the available start
     times. Times shown are the spa's local opening hours; already-booked and closure times
     never appear.
   - *Retreats* (e.g. "7-Night Panchakarma"): pick a departure date; each departure shows how
     many places remain.
2. **Party size** — total price scales with the number of guests.
3. **Reserve.** What happens next depends on the spa's payment policy, which is always stated
   in the widget before you commit:

| Policy | What you pay online now | What you pay at the spa |
| --- | --- | --- |
| Pay at the spa | Nothing — instant confirmation | Everything |
| Booking fee | A small flat fee (e.g. $5) | The treatment price |
| Deposit | A percentage (e.g. 20%) | The balance |
| Full prepayment | The full amount | Nothing |

4. **Payment** (when something is due) — a secure Stripe card form appears. Card details go
   directly from your browser to Stripe; VedaFinder never sees or stores your card number.
   On success you land on the confirmation screen with your **booking code** (e.g. `BK-7F3A2C`).

Keep the code — it's your reference with the spa. If a slot gets taken while you're checking
out, you'll get a clear "no longer available" message instead of a double booking.

## 5. Your bookings

**Account → My bookings** (`/account/bookings`) lists every booking with the spa, treatment,
date/time, party size, amount paid online vs. due at the spa, and status:

- `confirmed` — you're booked.
- `pending_payment` — payment not completed; re-book if you abandoned checkout.
- `completed` / `cancelled` / `no_show` — set by the spa after your visit date.

To cancel or reschedule in V1, contact the spa directly (phone/email are on the spa page and
your booking); refunds for prepaid amounts are handled by the spa.

## 6. Reviews, Q&A, wishlist, profile

- **Review** a spa from its page (sign in, choose 1–5 stars, title, your experience, optional
  visit date). One review per spa per person; the owner may post a public response.
- **Ask a question** on any spa page; the owner's answers carry a "Spa owner" badge, but other
  travelers can answer too.
- **Wishlist**: tap the heart anywhere; view the collection at `/wishlist`.
- **Public profile** (`/profile/<username>`): your avatar, bio, member-since date, and review
  history — other users see this when they tap your name on a review.
