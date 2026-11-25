"use client";

import { ChipClamp } from "@/components/spa/ChipClamp";

export function ListedNameChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <ChipClamp>
      {names.map((name) => (
        <span
          key={name}
          className="rounded-full border border-veda-200 bg-white px-3 py-1 text-sm leading-5 text-veda-800"
        >
          {name}
        </span>
      ))}
    </ChipClamp>
  );
}
