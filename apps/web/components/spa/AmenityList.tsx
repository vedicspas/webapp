"use client";

import { useMetaStore } from "@/stores/metaStore";

export function AmenityList({ amenityIds }: { amenityIds: number[] }) {
  const amenities = useMetaStore((s) => s.meta.amenities);
  const list = amenities.filter((a) => amenityIds.includes(a.id));

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {list.map((a) => (
        <span
          key={a.id}
          className="rounded-full border border-veda-200 bg-white px-3 py-1 text-sm text-veda-800"
        >
          {a.name}
        </span>
      ))}
    </div>
  );
}
