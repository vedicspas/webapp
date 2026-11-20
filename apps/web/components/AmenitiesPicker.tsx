"use client";

import { useMetaStore } from "@/stores/metaStore";

const input = "mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm";

export function AmenitiesPicker({
  amenityIds,
  onAmenityIdsChange,
  otherEnabled,
  onOtherEnabledChange,
  otherText,
  onOtherTextChange,
}: {
  amenityIds: number[];
  onAmenityIdsChange: (ids: number[]) => void;
  otherEnabled: boolean;
  onOtherEnabledChange: (on: boolean) => void;
  otherText: string;
  onOtherTextChange: (value: string) => void;
}) {
  const amenities = useMetaStore((s) => s.meta.amenities);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {amenities.map((a) => {
          const on = amenityIds.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() =>
                onAmenityIdsChange(on ? amenityIds.filter((id) => id !== a.id) : [...amenityIds, a.id])
              }
              className={`rounded-full px-3 py-1.5 text-sm ${
                on ? "bg-veda-600 text-white" : "border border-veda-200 text-veda-800 hover:bg-veda-50"
              }`}
            >
              {a.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onOtherEnabledChange(!otherEnabled)}
          className={`rounded-full px-3 py-1.5 text-sm ${
            otherEnabled ? "bg-veda-600 text-white" : "border border-veda-200 text-veda-800 hover:bg-veda-50"
          }`}
        >
          Other
        </button>
      </div>
      {otherEnabled ? (
        <label className="block text-sm font-medium">
          Other amenities
          <textarea
            className={input}
            rows={3}
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            placeholder="Comma-separated, e.g. Laundry, Library, Yoga centre"
          />
        </label>
      ) : null}
    </div>
  );
}
