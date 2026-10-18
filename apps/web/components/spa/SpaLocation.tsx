"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

export type SpaLocationData = {
  name: string;
  address: string;
  lat: number;
  lng: number;
};

const SpaLocationMap = dynamic(() => import("./SpaLocationMap"), { ssr: false });

const LocationCtx = createContext<{
  loc: SpaLocationData;
  open: () => void;
  lightbox: boolean;
} | null>(null);

export function SpaLocationProvider({
  loc,
  children,
}: {
  loc: SpaLocationData | null;
  children: ReactNode;
}) {
  const [lightbox, setLightbox] = useState(false);
  const open = useCallback(() => setLightbox(true), []);
  const close = useCallback(() => setLightbox(false), []);
  const value = useMemo(() => (loc ? { loc, open, lightbox } : null), [loc, open, lightbox]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [lightbox, close]);

  return (
    <LocationCtx.Provider value={value}>
      {children}
      {loc && lightbox ? <SpaLocationMap loc={loc} mode="lightbox" onClose={close} /> : null}
    </LocationCtx.Provider>
  );
}

export function SpaLocationLink() {
  const ctx = useContext(LocationCtx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.open}
      className="inline-flex shrink-0 items-center gap-1 font-medium text-veda-700 hover:text-veda-900 hover:underline"
    >
      <MapPinIcon />
      Location
    </button>
  );
}

export function SpaLocationPreview() {
  const ctx = useContext(LocationCtx);
  if (!ctx) return null;
  return (
    <section id="listing-location" className="mt-10 scroll-mt-16">
      <h2 className="text-lg font-semibold text-veda-900">Location</h2>
      <p className="mt-1 text-sm text-foreground/60">{ctx.loc.address}</p>
      <div className="mt-3">
        {ctx.lightbox ? (
          <div className="h-72 rounded-2xl border border-veda-100 bg-veda-50 sm:h-80" />
        ) : (
          <SpaLocationMap loc={ctx.loc} mode="preview" onOpen={ctx.open} />
        )}
      </div>
    </section>
  );
}

function MapPinIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
