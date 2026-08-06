# Admin Guide — Operating the VedaFinder Platform

For platform operators: moderating the marketplace, approving vendors, and understanding the
money. Demo account (seeded data): `admin@vedicspas.test` / `password123`.

## 1. Access

Sign in with an admin account and open **`/admin`** (an "Admin" link also appears in the header
for admin users). Every admin API endpoint independently verifies the admin role — the
dashboard is a convenience, not the security boundary.

There is no self-service path to the admin role. Create additional admins directly in the
database:

```sql
UPDATE users SET role_id = (SELECT id FROM roles WHERE code = 'admin')
WHERE email = 'newadmin@example.com';
```

(The person registers a normal account first; run this against production with your DB client
or `docker compose exec mariadb mariadb -u vedic -p vedic_spas` locally.)

## 2. The dashboard

**Stats row** — total users, vendors awaiting approval, published/total listings, total
bookings, gross booking value (excludes cancelled/no-show), and platform fees collected. Fee
figures only accumulate from bookings paid online.

### Vendors tab — the approval queue

Pending vendors sort to the top with owner name/email, spa counts, and Stripe status.

- **Approve** — the vendor can now publish listings; anything they prepared while pending goes
  live as soon as *they* toggle publish.
- **Suspend** — instant kill switch: all of that vendor's listings are unpublished immediately
  and they cannot re-publish; guests can no longer book them. Existing bookings are untouched —
  coordinate with the vendor about honoring or cancelling them.
- **Set pending** — reverts an approved vendor to the review state (also unpublishes).

Suggested review checklist before approving: business name looks legitimate, owner email is
plausible, and (optionally) their draft listing has a real address/coordinates and coherent
descriptions. In V1 there is no email notification on approval — vendors see their dashboard
banner clear. Telling them yourself by email is good practice.

### Listings tab

Every spa on the platform with its vendor and status. You can **unpublish** any listing
instantly (bad content, complaints) and **publish** it back. Publishing is refused if the
owning vendor isn't approved — approve the vendor first. Note that publish/unpublish decisions
normally belong to vendors; use this for moderation.

### Reviews tab

The 100 most recent reviews with author emails. **Delete** removes a review permanently
(including the vendor's response and its effect on the spa's average rating). There is no
undo — reserve it for spam, harassment, or fake reviews, not negative-but-genuine feedback.

### Bookings tab

The 100 most recent bookings platform-wide: code, guest, spa, treatment, date, status, payment
mode, total / paid-online / platform-fee amounts. Use it to audit revenue and investigate
disputes (e.g. confirm what a guest actually paid online).

## 3. How the platform earns

| Booking's payment mode | Platform revenue |
| --- | --- |
| Full prepayment / Deposit | `PLATFORM_FEE_BPS` (default 750 = 7.5%) of the amount charged online, taken as a Stripe application fee on the destination charge to the vendor |
| Booking fee | The entire flat fee (charged on the platform's own Stripe account) |
| Pay at the spa | Nothing |

Change the commission by setting `PLATFORM_FEE_BPS` on the API and restarting; it applies to
new bookings only (each booking snapshots its fee). Product (herb) sales revenue lives entirely
in Shopify and doesn't appear here.

## 4. Operational tasks outside the dashboard

- **Static data** (cities, amenities, treatment categories, currencies): insert rows in the
  database, then restart the API — these tables are cached in memory at startup. Example:

```sql
INSERT INTO cities (country_id, name, latitude, longitude)
VALUES ((SELECT id FROM countries WHERE iso2 = 'IN'), 'Rishikesh', 30.0869, 78.2676);
```

- **Stripe**: monitor charges, refunds, disputes, and vendor Connect accounts in the Stripe
  dashboard. Refunds in V1 are issued there, not in the app.
- **Shopify**: product catalog, orders, and fulfillment are all managed in Shopify admin
  (see [`../SHOPIFY_SETUP.md`](../SHOPIFY_SETUP.md)).
- **Database backups**: standard MariaDB dumps (`mariadb-dump vedic_spas > backup.sql`); on
  Railway, enable the database service's backup feature.

## 5. Admin FAQ

- **A vendor says they can't publish.** Check the Vendors tab — they're almost certainly
  pending or suspended.
- **A vendor says guests can't prepay.** Their Stripe onboarding isn't complete (Stripe column
  in the Vendors tab). Booking-fee / pay-at-spa modes still work for them.
- **Can I edit a listing's content?** Not from the dashboard in V1 — unpublish it and ask the
  vendor to fix it, or edit the database directly.
- **How do I feature a spa on the home page?** The home page shows top-rated spas
  automatically; there's no manual featuring in V1.
