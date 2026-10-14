"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
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
      attributionControl
      dragging={interactive}
      scrollWheelZoom={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      boxZoom={interactive}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={center} icon={pin} />
      <InvalidateSize />
      {interactive ? <ZoomControls /> : null}
    </MapContainer>
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
        <div className="pointer-events-none h-full w-full">
          <ClinicMap loc={loc} interactive={false} />
        </div>
        <button
          type="button"
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          aria-label={`Open map of ${loc.name}`}
          onClick={onOpen}
        />
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
