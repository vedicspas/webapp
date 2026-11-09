"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import type { FeaturedSpaSummary } from "@vedic/shared";
import { money } from "@/lib/format";
import { RatingStars } from "./RatingStars";
import { RemotePhoto } from "./RemotePhoto";
import { WishlistButton } from "./WishlistButton";

const AUTOPLAY_MS = 5500;
const SLIDE_MS = 480;
const SWIPE_PX = 48;
const GAP_PX = 20;
const EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)";

function cityCountry(spa: FeaturedSpaSummary): string {
  return [spa.cityName, spa.countryName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-turmeric-600" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z"
      />
    </svg>
  );
}

function FeaturedClinicCard({
  spa,
  eager,
}: {
  spa: FeaturedSpaSummary;
  eager: boolean;
}) {
  const place = cityCountry(spa);
  return (
    <article className="featured-clinic-card min-h-full w-full flex-1 overflow-hidden rounded-2xl border border-[#829186] bg-white shadow-sm">
      <Link href={`/spas/${spa.slug}`} className="featured-clinic-card__media">
        {spa.coverPhotoUrl ? (
          <>
            <span className="featured-clinic-card__bleed" aria-hidden>
              <RemotePhoto
                src={spa.coverPhotoUrl}
                alt=""
                loading={eager ? "eager" : "lazy"}
                fetchPriority={eager ? "high" : "low"}
              />
            </span>
            <span className="featured-clinic-card__photo">
              <RemotePhoto
                src={spa.coverPhotoUrl}
                alt={spa.name}
                loading={eager ? "eager" : "lazy"}
                fetchPriority={eager ? "high" : "low"}
              />
            </span>
          </>
        ) : null}
      </Link>
      <div className="relative flex min-w-0 flex-1 flex-col p-4 sm:p-5">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-turmeric-600">
          Featured
        </span>
        <WishlistButton spaId={spa.id} className="absolute right-3 top-3" />
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.75rem] pr-10 font-semibold leading-snug text-veda-900">
          <Link href={`/spas/${spa.slug}`} className="hover:underline">
            {spa.name}
          </Link>
        </h3>
        {place ? (
          <p className="mt-1 flex min-h-[1.25rem] items-center gap-1 text-sm text-foreground/60">
            <PinIcon />
            <span className="truncate">{place}</span>
          </p>
        ) : (
          <p className="mt-1 min-h-[1.25rem]" aria-hidden />
        )}
        <div className="mt-1 min-h-[1.25rem]">
          <RatingStars rating={spa.ratingAvg} count={spa.ratingCount} />
        </div>
        <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm leading-relaxed text-foreground/70">
          {spa.shortDescription}
        </p>
        <div className="mt-3 min-h-[1.5rem]">
          {spa.tags.length > 0 ? (
            <span className="inline-block rounded-full bg-turmeric-100 px-2.5 py-0.5 text-xs text-turmeric-800">
              {spa.tags.join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {spa.priceFromMinor !== null ? (
            <p className="text-sm text-foreground/70">
              from <span className="font-semibold text-veda-900">{money(spa.priceFromMinor, spa.currencyCode)}</span>
            </p>
          ) : (
            <span />
          )}
          <Link
            href={`/spas/${spa.slug}`}
            className="rounded-full border border-veda-300 px-3.5 py-1.5 text-sm text-veda-800 hover:bg-veda-50"
          >
            View clinic
          </Link>
        </div>
      </div>
    </article>
  );
}

export function FeaturedClinics({
  spas,
  className = "",
}: {
  spas: FeaturedSpaSummary[];
  className?: string;
}) {
  const headingId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const shiftRef = useRef(0);
  const pointer = useRef<{ x: number; id: number } | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [cardWidth, setCardWidth] = useState(0);
  const [shift, setShift] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);

  const count = spas.length;
  const visibleCount = desktop ? Math.min(2, count) : 1;
  const canSlide = count > visibleCount;
  const trackSpas = canSlide ? [...spas, ...spas, ...spas] : spas;
  const step = cardWidth + GAP_PX;
  const logicalIndex = count === 0 ? 0 : ((shift % count) + count) % count;

  const goBy = useCallback(
    (delta: number) => {
      if (!canSlide || delta === 0) return;
      setAnimate(!reduceMotion);
      setShift((current) => current + delta);
    },
    [canSlide, reduceMotion]
  );

  const goTo = useCallback(
    (target: number) => {
      if (!canSlide) return;
      const from = ((shiftRef.current % count) + count) % count;
      let delta = target - from;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      goBy(delta);
    },
    [canSlide, count, goBy]
  );

  useEffect(() => {
    shiftRef.current = shift;
  }, [shift]);

  useEffect(() => {
    const widthMq = window.matchMedia("(min-width: 1024px)");
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyWidth = () => setDesktop(widthMq.matches);
    const applyMotion = () => setReduceMotion(motionMq.matches);
    applyWidth();
    applyMotion();
    widthMq.addEventListener("change", applyWidth);
    motionMq.addEventListener("change", applyMotion);
    return () => {
      widthMq.removeEventListener("change", applyWidth);
      motionMq.removeEventListener("change", applyMotion);
    };
  }, []);

  useEffect(() => {
    function onVisibility() {
      setTabHidden(document.visibilityState !== "visible");
    }
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const viewport = el;
    function measure() {
      const width = viewport.clientWidth;
      const nextVisible = desktop ? Math.min(2, count) : 1;
      const nextWidth = nextVisible > 1 ? (width - GAP_PX) / nextVisible : width;
      setCardWidth(nextWidth);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [desktop, count]);

  useEffect(() => {
    setAnimate(false);
    setDrag(0);
    const next = canSlide ? count : 0;
    shiftRef.current = next;
    setShift(next);
  }, [canSlide, count, visibleCount]);

  useEffect(() => {
    if (!canSlide || hovering || reduceMotion || tabHidden || dragging) return;
    const timer = window.setTimeout(() => goBy(1), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [canSlide, hovering, reduceMotion, tabHidden, dragging, shift, goBy]);

  function settleLoop() {
    if (!canSlide || count === 0) return;
    let next = shiftRef.current;
    if (next >= count * 2) next -= count;
    else if (next < count) next += count;
    else return;
    setAnimate(false);
    shiftRef.current = next;
    setShift(next);
  }

  if (spas.length === 0) return null;

  const arrowClass =
    spas.length > 2
      ? "hidden sm:grid"
      : spas.length > 1
        ? "hidden sm:grid lg:hidden"
        : "hidden";
  const dotsClass = spas.length > 2 ? "" : spas.length > 1 ? "lg:hidden" : "hidden";

  function onPointerDown(e: React.PointerEvent) {
    if (!canSlide) return;
    if ((e.target as HTMLElement).closest("a, button")) return;
    pointer.current = { x: e.clientX, id: e.pointerId };
    setDragging(true);
    setAnimate(false);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointer.current || pointer.current.id !== e.pointerId) return;
    setDrag(e.clientX - pointer.current.x);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointer.current || pointer.current.id !== e.pointerId) return;
    const dx = e.clientX - pointer.current.x;
    pointer.current = null;
    setDragging(false);
    setDrag(0);
    if (dx <= -SWIPE_PX) goBy(1);
    else if (dx >= SWIPE_PX) goBy(-1);
  }

  const offset = cardWidth > 0 ? -(shift * step) + drag : 0;

  return (
    <section className={`bg-background px-4 py-8 lg:py-10 ${className}`.trim()} aria-labelledby={headingId}>
      <div
        className="relative mx-auto max-w-6xl"
        aria-roledescription="carousel"
        aria-labelledby={headingId}
        tabIndex={canSlide ? 0 : undefined}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovering(false);
        }}
        onKeyDown={(e) => {
          if (!canSlide) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            goBy(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            goBy(-1);
          }
        }}
      >
        <div className="flex items-center gap-3">
          <h2 id={headingId} className="text-xl font-semibold text-veda-900 sm:text-2xl">
            Featured Ayurvedic Clinics
          </h2>
          <span className="h-[3px] w-10 rounded-full bg-turmeric-400 sm:w-14" aria-hidden />
          <Link href="/spas" className="ml-auto text-sm text-veda-600 hover:underline">
            View all
          </Link>
        </div>
        <p className="mt-1 text-sm text-foreground/65 sm:text-base">
          Handpicked destinations for authentic Ayurvedic care
        </p>

        <div className="relative mt-6 sm:px-12">
          <button
            type="button"
            aria-label="Previous featured clinics"
            className={`absolute left-0 top-1/2 z-10 h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-veda-200 bg-white text-lg text-foreground/55 shadow-sm hover:bg-veda-50 ${arrowClass}`}
            onClick={() => goBy(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next featured clinics"
            className={`absolute right-0 top-1/2 z-10 h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-veda-200 bg-white text-lg text-foreground/55 shadow-sm hover:bg-veda-50 ${arrowClass}`}
            onClick={() => goBy(1)}
          >
            ›
          </button>

          <div
            ref={viewportRef}
            className="overflow-hidden"
            style={{ minHeight: "16.5rem", opacity: cardWidth ? 1 : 0 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              pointer.current = null;
              setDragging(false);
              setDrag(0);
            }}
          >
            <div
              ref={trackRef}
              className="flex items-stretch"
              style={{
                gap: GAP_PX,
                transform: `translate3d(${offset}px, 0, 0)`,
                transition:
                  animate && !dragging && !reduceMotion ? `transform ${SLIDE_MS}ms ${EASE}` : "none",
                willChange: "transform",
              }}
              onTransitionEnd={(e) => {
                if (e.target !== trackRef.current || e.propertyName !== "transform") return;
                settleLoop();
              }}
            >
              {trackSpas.map((spa, i) => {
                const visible = i >= shift && i < shift + visibleCount;
                return (
                  <div
                    key={`${spa.id}-${i}`}
                    className="flex shrink-0 self-stretch"
                    style={{ width: cardWidth || undefined, flexBasis: cardWidth || undefined }}
                    aria-hidden={!visible}
                  >
                    <FeaturedClinicCard spa={spa} eager={visible} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`mt-5 flex justify-center gap-2 ${dotsClass}`} role="tablist" aria-label="Featured clinics">
          {spas.map((spa, i) => {
            const selected = i === logicalIndex;
            return (
              <button
                key={spa.id}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Show ${spa.name}`}
                className={`h-2.5 rounded-full transition ${
                  selected ? "w-2.5 bg-turmeric-500" : "w-2.5 bg-veda-200 hover:bg-veda-300"
                }`}
                onClick={() => goTo(i)}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
