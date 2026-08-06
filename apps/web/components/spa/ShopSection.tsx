import Image from "next/image";
import type { ShopProduct } from "@/lib/shopify";

/**
 * Herbs & spa products for this spa, pulled from the matching Shopify
 * collection. Purchases go through Shopify checkout.
 */
export function ShopSection({
  products,
  spaName,
  handle,
}: {
  products: ShopProduct[] | null;
  spaName: string;
  handle: string | null;
}) {
  if (!handle) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-veda-900">Herbs &amp; spa products</h2>
      {products === null || products.length === 0 ? (
        <p className="mt-2 rounded-xl bg-veda-50 px-4 py-3 text-sm text-veda-700">
          {spaName}&rsquo;s product shop is being prepared. Check back soon.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {products.map((p) => (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-xl border border-veda-100 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="relative aspect-square bg-veda-50">
                {p.imageUrl ? (
                  <Image
                    src={p.imageUrl}
                    alt={p.imageAlt}
                    fill
                    sizes="(max-width: 640px) 50vw, 200px"
                    className="object-cover transition group-hover:scale-105"
                  />
                ) : null}
              </div>
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-veda-900">{p.title}</p>
                <p className="mt-1 text-sm text-veda-600">
                  {Number(p.priceAmount).toFixed(2)} {p.priceCurrency}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
