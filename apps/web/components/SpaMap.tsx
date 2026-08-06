"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import Link from "next/link";
import type { SpaSummary } from "@vedic/shared";
import { money } from "@/lib/format";

// Leaflet's default marker images don't survive bundling; use an inline SVG pin.
const pin = L.divIcon({
  className: "",
  html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill="#2b533d"/><circle cx="15" cy="14" r="6" fill="#e6b136"/></svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 40],
  popupAnchor: [0, -36],
});

export default function SpaMap({ spas }: { spas: SpaSummary[] }) {
  const center: [number, number] =
    spas.length > 0 ? [spas[0].lat, spas[0].lng] : [20, 78];

  return (
    <MapContainer
      center={center}
      zoom={spas.length === 1 ? 12 : 3}
      className="h-full w-full rounded-2xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {spas.map((spa) => (
        <Marker key={spa.id} position={[spa.lat, spa.lng]} icon={pin}>
          <Popup>
            <Link href={`/spas/${spa.slug}`} className="font-medium text-veda-800 underline">
              {spa.name}
            </Link>
            <br />
            {spa.cityName}
            {spa.priceFromMinor !== null ? (
              <>
                {" "}
                &middot; from {money(spa.priceFromMinor, spa.currencyCode)}
              </>
            ) : null}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
