"use client";

import { useCallback, useEffect, useState } from "react";
import type { SpaPhoto } from "@vedic/shared";
import { RemotePhoto, resolvePhotoSrc } from "@/components/RemotePhoto";
import { WishlistButton } from "@/components/WishlistButton";

function useVisibleCount() {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const sm = window.matchMedia("(min-width: 640px)");
    const update = () => setCount(lg.matches ? 3 : sm.matches ? 2 : 1);
    update();
    lg.addEventListener("change", update);
    sm.addEventListener("change", update);
    return () => {
      lg.removeEventListener("change", update);
      sm.removeEventListener("change", update);
    };
  }, []);
  return count;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      {dir === "left" ? <path d="M15 5l-7 7 7 7" /> : <path d="M9 5l7 7-7 7" />}
    </svg>
  );
}

const arrowBtn =
  "grid h-10 w-10 place-items-center rounded-full bg-white/90 text-veda-900 shadow-md hover:bg-white";

export function PhotoGallery({
  photos,
  spaName,
  spaId,
}: {
  photos: SpaPhoto[];
  spaName: string;
  spaId: number;
}) {
  const visible = useVisibleCount();
  const [start, setStart] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [hovering, setHovering] = useState(false);

  const maxStart = Math.max(0, photos.length - visible);
  const canSlide = photos.length > visible;

  const go = useCallback(
    (delta: number) => {
      setStart((current) => {
        if (!canSlide) return 0;
        const next = current + delta;
        if (next < 0) return maxStart;
        if (next > maxStart) return 0;
        return next;
      });
    },
    [canSlide, maxStart]
  );

  useEffect(() => {
    setStart((current) => Math.min(current, maxStart));
  }, [maxStart]);

  useEffect(() => {
    if (!canSlide || hovering || lightbox !== null) return;
    const timer = window.setInterval(() => go(1), 4500);
    return () => window.clearInterval(timer);
  }, [canSlide, hovering, lightbox, go]);

  useEffect(() => {
    if (lightbox === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
      if (e.key === "ArrowLeft")
        setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightbox, photos.length]);

  if (photos.length === 0) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-veda-100">
        <div className="aspect-[4/3] w-full" />
        <WishlistButton spaId={spaId} className="absolute right-3 top-3 z-10" />
      </div>
    );
  }

  const gap = 8;
  const slidePct = 100 / visible;
  const current = lightbox === null ? null : photos[lightbox];

  return (
    <>
      <div
        className="relative overflow-hidden rounded-2xl"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div
          className="flex w-full transition-transform duration-500 ease-out"
          style={{
            gap,
            transform: `translateX(calc(-${start} * ((100% - ${(visible - 1) * gap}px) / ${visible} + ${gap}px)))`,
          }}
        >
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightbox(i)}
              className="relative aspect-[4/3] shrink-0 overflow-hidden rounded-2xl"
              style={{ width: `calc((100% - ${(visible - 1) * gap}px) / ${visible})` }}
              aria-label={`View ${photo.title || photo.alt || spaName} full size`}
            >
              <RemotePhoto
                src={photo.url}
                alt={photo.title || photo.alt || spaName}
                className="h-full w-full object-cover"
              />
              {photo.title || photo.alt ? (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2.5 pt-8 text-left text-sm font-medium text-white">
                  {photo.title || photo.alt}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {canSlide ? (
          <>
            <button
              type="button"
              aria-label="Previous photos"
              className={`${arrowBtn} absolute left-3 top-1/2 z-10 -translate-y-1/2`}
              onClick={() => go(-1)}
            >
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              aria-label="Next photos"
              className={`${arrowBtn} absolute right-3 top-1/2 z-10 -translate-y-1/2`}
              onClick={() => go(1)}
            >
              <Chevron dir="right" />
            </button>
          </>
        ) : null}

        <WishlistButton spaId={spaId} className="absolute right-3 top-3 z-20" />
      </div>

      {current ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={() => setLightbox(null)}
        >
          <div className="flex items-center justify-between px-4 py-3 text-sm text-white">
            <p>
              {lightbox! + 1} / {photos.length}
              {current.title || current.alt ? (
                <span className="ml-3 text-white/80">{current.title || current.alt}</span>
              ) : null}
            </p>
            <button
              type="button"
              aria-label="Close"
              className="rounded-full px-3 py-1 hover:bg-white/10"
              onClick={() => setLightbox(null)}
            >
              Close
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 py-2" onClick={(e) => e.stopPropagation()}>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  className={`${arrowBtn} absolute left-3 top-1/2 z-10 -translate-y-1/2`}
                  onClick={() => setLightbox((i) => (i === null ? 0 : (i - 1 + photos.length) % photos.length))}
                >
                  <Chevron dir="left" />
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  className={`${arrowBtn} absolute right-3 top-1/2 z-10 -translate-y-1/2`}
                  onClick={() => setLightbox((i) => (i === null ? 0 : (i + 1) % photos.length))}
                >
                  <Chevron dir="right" />
                </button>
              </>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolvePhotoSrc(current.url)}
              alt={current.title || current.alt || spaName}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          {photos.length > 1 ? (
            <div
              className="flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  type="button"
                  onClick={() => setLightbox(i)}
                  className={`h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${
                    i === lightbox ? "border-turmeric-400" : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`Show photo ${i + 1}`}
                >
                  <RemotePhoto
                    src={photo.url}
                    alt={photo.title || photo.alt || spaName}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
