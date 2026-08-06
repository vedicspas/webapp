/**
 * Shopify Storefront API client.
 * Each spa maps to one Shopify collection via spas.shopify_collection_handle;
 * see SHOPIFY_SETUP.md at the repo root for the store-side setup.
 */

export interface ShopProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  imageUrl: string | null;
  imageAlt: string;
  priceAmount: string;
  priceCurrency: string;
  url: string;
}

const QUERY = /* GraphQL */ `
  query CollectionProducts($handle: String!) {
    collection(handle: $handle) {
      title
      products(first: 12) {
        nodes {
          id
          title
          handle
          description(truncateAt: 160)
          featuredImage {
            url(transform: { maxWidth: 600, maxHeight: 600 })
            altText
          }
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

export async function getSpaProducts(collectionHandle: string): Promise<ShopProduct[] | null> {
  const domain = process.env.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN;
  const token = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_TOKEN;
  if (!domain || !token || domain.startsWith("your-store")) return null;

  try {
    const res = await fetch(`https://${domain}/api/2025-07/graphql.json`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Shopify-Storefront-Access-Token": token,
      },
      body: JSON.stringify({ query: QUERY, variables: { handle: collectionHandle } }),
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;

    const json = await res.json();
    const nodes = json?.data?.collection?.products?.nodes;
    if (!Array.isArray(nodes)) return null;

    return nodes.map(
      (p: {
        id: string;
        title: string;
        handle: string;
        description: string;
        featuredImage: { url: string; altText: string | null } | null;
        priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
      }): ShopProduct => ({
        id: p.id,
        title: p.title,
        handle: p.handle,
        description: p.description,
        imageUrl: p.featuredImage?.url ?? null,
        imageAlt: p.featuredImage?.altText ?? p.title,
        priceAmount: p.priceRange.minVariantPrice.amount,
        priceCurrency: p.priceRange.minVariantPrice.currencyCode,
        url: `https://${domain}/products/${p.handle}`,
      })
    );
  } catch {
    return null;
  }
}
