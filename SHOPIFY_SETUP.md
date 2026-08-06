# Shopify setup for VedaFinder

VedaFinder sells herbs and spa products **through Shopify**: the web app only *displays* each
spa's products and links shoppers to Shopify's hosted product pages and checkout. No product,
inventory, or payment data for the shop is stored in our database — the only link is one column:
`spas.shopify_collection_handle`.

## How the integration works

```
MariaDB spas table                Shopify store
+------------------------+       +--------------------------------+
| shopify_collection_    | ----> | Collection (handle matches)    |
| handle: "ganga-veda"   |       |   - Product: Triphala Churna   |
+------------------------+       |   - Product: Kansa Wand        |
                                 +--------------------------------+
```

1. Each spa's public page calls the **Storefront API** (`lib/shopify.ts` in `apps/web`) with the
   spa's collection handle.
2. The query returns up to 12 products (title, image, price) and is cached by Next.js for
   10 minutes (`revalidate: 600`), so Shopify is not hit on every page view.
3. Product cards link to `https://<your-store>.myshopify.com/products/<handle>` — the customer
   buys on Shopify with Shopify's checkout, taxes, and shipping.

## One-time store setup

### 1. Create the store and enable the Storefront API

1. Create a Shopify store (any plan; a development store works for testing).
2. In Shopify admin go to **Settings → Apps and sales channels → Develop apps → Create an app**
   (enable custom app development if prompted). Name it e.g. `VedaFinder Web`.
3. Under **Configuration → Storefront API**, enable at least these scopes:
   - `unauthenticated_read_product_listings`
   - `unauthenticated_read_collection_listings`
4. Click **Install app**, then copy the **Storefront API access token**
   (starts with `shpat_`... under "API credentials"; the *Storefront* token, not the Admin one).

### 2. Put the credentials in `.env`

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_ACCESS_TOKEN=<storefront token>
NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN=<storefront token>
```

The Storefront API token is designed to be public (it can only read published catalog data), so
exposing it with a `NEXT_PUBLIC_` prefix is safe.

### 3. Create one collection per spa

1. **Products → Collections → Create collection.**
2. Title it after the spa (e.g. "Ganga Veda Ayurveda Center").
3. Set the **handle** (URL slug, under "Search engine listing → Edit") to a short stable value,
   e.g. `ganga-veda`. **This handle is the link key.**
4. Choose *Manual* collection type and add that spa's products, or use *Automated* with a
   product tag per spa (tag products `spa:ganga-veda` and match on tag) — automated collections
   scale better once vendors have many products.
5. Make sure the collection and its products are **published to the app's sales channel**
   (Availability → your custom app / Online Store).

### 4. Link the collection to the spa

Either:

- **Vendor dashboard** (recommended): the vendor opens *Vendor dashboard → Edit spa → Shop* and
  enters the collection handle, or
- **SQL**: `UPDATE spas SET shopify_collection_handle = 'ganga-veda' WHERE slug = 'ganga-veda-rishikesh';`

The products appear on the spa page within 10 minutes (or immediately after a redeploy).

## Vendor payouts for product sales

Product revenue flows entirely inside Shopify. Two common ways to pay vendors:

1. **Single-merchant model (simplest):** you own the store and all inventory; you settle with
   vendors offline (monthly statements). Use product tags/vendor field to report per-vendor sales.
2. **Marketplace apps:** if vendors should ship their own products and be paid automatically,
   add a Shopify marketplace/multi-vendor app (e.g. "Multi Vendor Marketplace" by Webkul) — the
   web app does not need to change, since it only reads collections.

Note that this is separate from **treatment bookings**, which are paid through our own Stripe
Connect integration and paid out to the vendor's Stripe account directly.

## Testing without a real store

Leave the Shopify env vars empty (or as the `your-store` placeholders): spa pages then show a
"product shop is being prepared" note instead of the shop section, and everything else works.
