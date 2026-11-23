"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AttributionControl, MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { googleMapsDirectionsUrl } from "@/lib/format";
import type { SpaLocationData } from "./SpaLocation";

const pin = L.divIcon({
  className: "",
  html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="#2b533d"/><circle cx="15" cy="14" r="6" fill="#e6b136"/></svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
});

function InvalidateSize() {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white shadow-md">
      <button
        type="button"
        aria-label="Zoom in"
        className="grid h-10 w-10 place-items-center text-lg font-semibold text-veda-900 hover:bg-veda-50"
        onClick={() => map.zoomIn()}
      >
        +
      </button>
      <span className="h-px bg-black/10" />
      <button
        type="button"
        aria-label="Zoom out"
        className="grid h-10 w-10 place-items-center text-lg font-semibold text-veda-900 hover:bg-veda-50"
        onClick={() => map.zoomOut()}
      >
        &minus;
      </button>
    </div>
  );
}

function ClinicMap({ loc, interactive }: { loc: SpaLocationData; interactive: boolean }) {
  const center: [number, number] = [loc.lat, loc.lng];
  return (
    <MapContainer
      center={center}
      zoom={14}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      boxZoom={interactive}
    >
      <AttributionControl prefix={false} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center} icon={pin} />
      <InvalidateSize />
      {interactive ? <ZoomControls /> : null}
    </MapContainer>
  );
}

function GetDirectionsChip({ loc }: { loc: SpaLocationData }) {
  const href = googleMapsDirectionsUrl(loc);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Get directions to ${loc.name}`}
      className="absolute left-3 top-3 z-[1100] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-sm font-medium text-veda-900 shadow-md hover:bg-white"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M9 21V10a4 4 0 0 1 4-4h8" />
        <path d="m17 2 4 4-4 4" />
      </svg>
      Get directions
    </a>
  );
}

export default function SpaLocationMap({
  loc,
  mode,
  onOpen,
  onClose,
}: {
  loc: SpaLocationData;
  mode: "preview" | "lightbox";
  onOpen?: () => void;
  onClose?: () => void;
}) {
  if (mode === "preview") {
    return (
      <div className="relative isolate h-72 overflow-hidden rounded-2xl border border-veda-100 bg-veda-50 sm:h-80">
        <div className="h-full w-full">
          <ClinicMap loc={loc} interactive={false} />
        </div>
        <button
          type="button"
          className="absolute inset-x-0 top-0 z-10 cursor-pointer bg-transparent bottom-7"
          aria-label={`Open map of ${loc.name}`}
          onClick={onOpen}
        />
        <GetDirectionsChip loc={loc} />
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Close map"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Map of ${loc.name}`}
        className="relative z-10 h-[80vh] w-[80vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
      >
        <ClinicMap loc={loc} interactive />
        <GetDirectionsChip loc={loc} />
        <button
          type="button"
          aria-label="Close map"
          className="absolute right-3 top-3 z-[1100] grid h-10 w-10 place-items-center rounded-full bg-white/95 text-veda-900 shadow-md hover:bg-white"
          onClick={onClose}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>,
    document.body
  );
}
