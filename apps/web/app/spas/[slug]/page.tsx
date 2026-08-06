import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { ApiError, getQuestions, getReviews, getSpa, getSpaSlugs } from "@/lib/api";
import { getSpaProducts } from "@/lib/shopify";
import { RatingStars } from "@/components/RatingStars";
import { WishlistButton } from "@/components/WishlistButton";
import { AmenityList } from "@/components/spa/AmenityList";
import { BookingWidget } from "@/components/spa/BookingWidget";
import { ReviewsSection } from "@/components/spa/ReviewsSection";
import { QASection } from "@/components/spa/QASection";
import { ShopSection } from "@/components/spa/ShopSection";
import { WEEKDAYS } from "@/lib/format";

// Prerender every published spa at build time; refresh in background.
export const revalidate = 300;
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const slugs = await getSpaSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    // API not reachable at build time - pages render on demand instead.
    return [];
  }
}

async function loadSpa(slug: string) {
  try {
    return await getSpa(slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({
  params,
}: PageProps<"/spas/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const spa = await loadSpa(slug);
  return { title: spa.name, description: spa.shortDescription };
}

export default async function SpaPage({ params }: PageProps<"/spas/[slug]">) {
  const { slug } = await params;
  const spa = await loadSpa(slug);
  const [reviews, questions, products] = await Promise.all([
    getReviews(slug),
    getQuestions(slug),
    spa.shopifyCollectionHandle ? getSpaProducts(spa.shopifyCollectionHandle) : null,
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Photo gallery */}
      <div className="relative flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl">
        {spa.photos.map((photo, i) => (
          <div
            key={photo.id}
            className="relative aspect-[4/3] w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl sm:w-[45%] lg:w-[32%]"
          >
            <Image
              src={photo.url}
              alt={photo.alt || spa.name}
              fill
              sizes="(max-width: 640px) 85vw, 33vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
        <WishlistButton spaId={spa.id} className="absolute right-3 top-3 z-10" />
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-wide text-veda-500">
            {spa.cityName}, {spa.countryName}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-veda-900 sm:text-3xl">{spa.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
            <RatingStars rating={spa.ratingAvg} count={spa.ratingCount} size="lg" />
            <span className="text-foreground/60">{spa.addressLine}</span>
          </div>

          <p className="mt-5 whitespace-pre-line leading-relaxed text-foreground/85">
            {spa.description}
          </p>

          <h2 className="mt-8 text-lg font-semibold text-veda-900">Amenities</h2>
          <AmenityList amenityIds={spa.amenityIds} />

          <h2 className="mt-8 text-lg font-semibold text-veda-900">Opening hours</h2>
          <ul className="mt-2 grid max-w-md grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {spa.openHours.map((h) => (
              <li key={h.weekday} className="flex justify-between gap-4 rounded bg-veda-50 px-3 py-1.5">
                <span>{WEEKDAYS[h.weekday]}</span>
                <span className="tabular-nums">
                  {h.openTime} &ndash; {h.closeTime}
                </span>
              </li>
            ))}
          </ul>

          <ShopSection
            products={products}
            spaName={spa.name}
            handle={spa.shopifyCollectionHandle}
          />


          <ReviewsSection slug={spa.slug} initial={reviews} />
          <QASection slug={spa.slug} initial={questions} />
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <BookingWidget spa={spa} />
        </aside>
      </div>
    </div>
  );
}
