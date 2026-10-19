import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, getQuestions, getReviews, getSpa, getSpaSlugs } from "@/lib/api";
import { getSpaProducts } from "@/lib/shopify";
import { RatingStars } from "@/components/RatingStars";
import { AmenityList } from "@/components/spa/AmenityList";
import { StayDetails } from "@/components/spa/StayDetails";
import { PhotoGallery } from "@/components/spa/PhotoGallery";
import { BookingWidget } from "@/components/spa/BookingWidget";
import { ReviewsSection } from "@/components/spa/ReviewsSection";
import { QASection } from "@/components/spa/QASection";
import { ShopSection } from "@/components/spa/ShopSection";
import { WEEKDAYS, formatSpaAddress, formatSpaLocality, money } from "@/lib/format";
import { TreatmentCaption } from "@/components/TreatmentCaption";
import { SpaLocationLink, SpaLocationPreview, SpaLocationProvider } from "@/components/spa/SpaLocation";
import { ShareListing } from "@/components/spa/ShareListing";
import { ClaimClinicControl, ClaimUiProvider } from "@/components/spa/ClaimClinicLightbox";
import { UnclaimedListingAside } from "@/components/spa/ExpressInterestCard";
import { WishlistButton } from "@/components/WishlistButton";
import { ListingStickyNav } from "@/components/spa/ListingStickyNav";

// Booking inventory (treatments) must not stay stale after a vendor deletes one.
export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  const address = formatSpaAddress(spa);
  const loc =
    spa.lat != null &&
    spa.lng != null &&
    Number.isFinite(spa.lat) &&
    Number.isFinite(spa.lng)
      ? { name: spa.name, address, lat: spa.lat, lng: spa.lng }
      : null;

  const hasStay = Boolean(
    (spa.languages?.length ?? 0) > 0 ||
      (spa.dietaryOptions?.length ?? 0) > 0 ||
      spa.airportPickup ||
      spa.familyAccommodation ||
      spa.accessibility ||
      spa.accommodationOther?.trim() ||
      (spa.accommodationTypes?.length ?? 0) > 0
  );
  const showAmenities = spa.amenityIds.length > 0 || hasStay;

  const inner = (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <ListingStickyNav
        clinicName={spa.name}
        showAmenities={showAmenities}
        showLocation={Boolean(loc)}
        showBooking={!spa.isUnclaimed}
      >
        <div>
          <p className="text-sm uppercase tracking-wide text-veda-500">
            {formatSpaLocality(spa)}
          </p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-2xl font-bold text-veda-900 sm:text-3xl">{spa.name}</h1>
            <div className="flex shrink-0 items-center gap-1">
              {spa.photos.length === 0 ? <WishlistButton spaId={spa.id} className="shadow-none" /> : null}
              <ShareListing title={spa.name} text={spa.shortDescription} path={`/spas/${spa.slug}`} />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <RatingStars rating={spa.ratingAvg} count={spa.ratingCount} size="lg" />
            {address ? (
              <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-foreground/60">
                <span>{address}</span>
                <SpaLocationLink />
              </span>
            ) : null}
          </div>
          {spa.isUnclaimed ? <ClaimClinicControl /> : null}
        </div>
      </ListingStickyNav>

      {spa.photos.length > 0 ? (
        <div className="mt-5">
          <PhotoGallery photos={spa.photos} spaName={spa.name} spaId={spa.id} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <section id="listing-about" className="scroll-mt-16">
            <h2 className="text-lg font-semibold text-veda-900">About this clinic</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-foreground/85">
              {spa.description}
            </p>
          </section>

          {showAmenities ? (
            <div id="listing-amenities" className="scroll-mt-16">
              {spa.amenityIds.length > 0 ? (
                <>
                  <h2 className="mt-8 text-lg font-semibold text-veda-900">Amenities</h2>
                  <AmenityList amenityIds={spa.amenityIds} />
                </>
              ) : null}
              <StayDetails spa={spa} />
            </div>
          ) : null}

          <section id="listing-treatments" className="scroll-mt-16">
            <h2 className="mt-8 text-lg font-semibold text-veda-900">Treatments</h2>
            <ul className="mt-2 space-y-2">
              {spa.treatments.map((t) => (
                <li key={t.id} className="rounded-xl border border-veda-100 bg-white px-4 py-3">
                  <p className="font-medium text-veda-900">
                    <TreatmentCaption name={t.name} categoryName={t.categoryName} />
                  </p>
                  <p className="mt-0.5 text-sm text-foreground/60">
                    {money(t.priceMinor, spa.currencyCode)}
                    {t.kind === "session" && t.durationMinutes ? ` · ${t.durationMinutes} min` : null}
                    {t.kind === "retreat" && t.nights ? ` · ${t.nights} nights` : null}
                  </p>
                </li>
              ))}
              {spa.treatments.length === 0 ? (
                <li className="text-sm text-foreground/60">No treatments listed yet.</li>
              ) : null}
            </ul>
          </section>

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
          <SpaLocationPreview />
        </div>

        {spa.isUnclaimed ? (
          <UnclaimedListingAside slug={spa.slug} />
        ) : (
          <aside
            id="listing-booking"
            className="no-scrollbar scroll-mt-16 lg:sticky lg:top-[var(--listing-sticky-top,5rem)] lg:max-h-[calc(100vh-var(--listing-sticky-top,5rem)-0.75rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain"
          >
            <BookingWidget spa={spa} />
          </aside>
        )}
      </div>
    </div>
  );

  return (
    <SpaLocationProvider loc={loc}>
      {spa.isUnclaimed ? (
        <ClaimUiProvider slug={spa.slug} clinicName={spa.name} clinicAddress={address}>
          {inner}
        </ClaimUiProvider>
      ) : (
        inner
      )}
    </SpaLocationProvider>
  );
}
