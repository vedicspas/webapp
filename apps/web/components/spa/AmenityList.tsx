"use client";

import { useMetaStore } from "@/stores/metaStore";
import { ChipClamp } from "@/components/spa/ChipClamp";

const chipClass = "rounded-full border border-veda-200 bg-white px-3 py-1 text-sm leading-5 text-veda-800";

export function AmenityList({
  amenityIds,
  extraNames = [],
}: {
  amenityIds: number[];
  extraNames?: string[];
}) {
  const amenities = useMetaStore((s) => s.meta.amenities);
  const list = amenities.filter((a) => amenityIds.includes(a.id));
  const extras = extraNames.map((name) => name.trim()).filter(Boolean);

  if (list.length === 0 && extras.length === 0) return null;

  return (
    <div className="mt-2">
      <ChipClamp>
        {list.map((a) => (
          <span key={a.id} className={chipClass}>
            {a.name}
          </span>
        ))}
        {extras.map((name) => (
          <span key={`other-${name.toLowerCase()}`} className={chipClass}>
            {name}
          </span>
        ))}
      </ChipClamp>
    </div>
  );
}
