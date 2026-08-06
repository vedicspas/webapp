import Link from "next/link";
import Image from "next/image";
import type { SpaSummary } from "@vedic/shared";
import { money, PAYMENT_MODE_LABELS } from "@/lib/format";
import { RatingStars } from "./RatingStars";
import { WishlistButton } from "./WishlistButton";

export function SpaCard({ spa }: { spa: SpaSummary & { distanceKm?: number } }) {
  return (
    <Link
      href={`/spas/${spa.slug}`}
      className="group overflow-hidden rounded-2xl border border-veda-100 bg-white shadow-sm transition hover:shadow-lg"
    >
      <div className="relative aspect-[4/3]">
        {spa.coverPhotoUrl ? (
          <Image
            src={spa.coverPhotoUrl}
            alt={spa.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-veda-100" />
        )}
        <WishlistButton spaId={spa.id} className="absolute right-3 top-3" />
        {spa.distanceKm !== undefined ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {spa.distanceKm.toFixed(1)} km away
          </span>
        ) : null}
      </div>
      <div className="space-y-1.5 p-4">
        <p className="text-xs uppercase tracking-wide text-veda-500">
          {spa.cityName}, {spa.countryName}
        </p>
        <h3 className="font-semibold leading-snug text-veda-900">{spa.name}</h3>
        <RatingStars rating={spa.ratingAvg} count={spa.ratingCount} />
        <p className="line-clamp-2 text-sm text-foreground/70">{spa.shortDescription}</p>
        <div className="flex items-center justify-between pt-1 text-sm">
          {spa.priceFromMinor !== null ? (
            <span>
              from <span className="font-semibold">{money(spa.priceFromMinor, spa.currencyCode)}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="rounded-full bg-veda-50 px-2 py-0.5 text-xs text-veda-700">
            {PAYMENT_MODE_LABELS[spa.paymentModeCode]}
          </span>
        </div>
      </div>
    </Link>
  );
}
