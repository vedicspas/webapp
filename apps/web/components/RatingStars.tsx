"use client";

import { useId, useState } from "react";
import { ratingLabel } from "@vedic/shared";

function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-6;
}

function circleFill(value: number, index: number): number {
  if (value <= 0) return 0;
  if (isHalfStep(value)) {
    const threshold = index + 1;
    if (value >= threshold) return 1;
    if (value >= threshold - 0.5) return 0.5;
    return 0;
  }
  const remainder = value - index;
  if (remainder >= 1) return 1;
  if (remainder <= 0) return 0;
  return remainder;
}

function valueFromPointer(circleIndex: number, clientX: number, target: HTMLElement): number {
  const rect = target.getBoundingClientRect();
  const leftHalf = clientX < rect.left + rect.width / 2;
  if (circleIndex === 0) return 1;
  return leftHalf ? circleIndex + 0.5 : circleIndex + 1;
}

function Circle({ fill, size }: { fill: number; size: number }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="#c4b5a5" strokeWidth="1.75" />
      <defs>
        <clipPath id={clipId}>
          <rect x="0" y="0" width={Math.max(0, Math.min(1, fill)) * 24} height="24" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="9" fill="#d97706" clipPath={`url(#${clipId})`} />
    </svg>
  );
}

export function RatingDisplay({
  rating,
  count,
  size = "sm",
  showValue = true,
}: {
  rating: number;
  count?: number;
  size?: "sm" | "lg";
  showValue?: boolean;
}) {
  const px = size === "lg" ? 22 : 16;
  const label = rating > 0 ? `${rating.toFixed(1)} out of 5` : "No rating yet";
  return (
    <span className={`inline-flex items-center gap-1 ${size === "lg" ? "text-base" : "text-sm"}`}>
      <span className="inline-flex" aria-label={label} role="img">
        {Array.from({ length: 5 }, (_, i) => (
          <Circle key={i} fill={circleFill(rating, i)} size={px} />
        ))}
      </span>
      {showValue ? (
        <span className="font-medium tabular-nums">{rating > 0 ? rating.toFixed(1) : "New"}</span>
      ) : null}
      {count !== undefined && count > 0 ? (
        <span className="text-foreground/60">({count})</span>
      ) : null}
    </span>
  );
}

export function RatingControl({
  value,
  onChange,
  labelledBy,
  allowEmpty = false,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  labelledBy?: string;
  allowEmpty?: boolean;
}) {
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? value ?? 0;
  const text =
    (preview ?? value) != null
      ? `${(preview ?? value)!.toFixed(1)} out of 5 — ${ratingLabel(preview ?? value!)}`
      : "No rating selected";

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      const base = value ?? 0.5;
      onChange(Math.min(5, Math.round((base + 0.5) * 2) / 2));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      const base = value ?? 1.5;
      const next = Math.round((base - 0.5) * 2) / 2;
      onChange(next < 1 ? (allowEmpty ? null : 1) : next);
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(1);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(5);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value ?? undefined}
        aria-valuetext={text}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : "Rating"}
        className="inline-flex cursor-pointer rounded-lg outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-veda-700"
        onKeyDown={onKeyDown}
        onMouseLeave={() => setPreview(null)}
      >
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="p-0.5"
            onMouseMove={(e) => setPreview(valueFromPointer(i, e.clientX, e.currentTarget))}
            onClick={(e) => {
              onChange(valueFromPointer(i, e.clientX, e.currentTarget));
              setPreview(null);
            }}
          >
            <Circle fill={circleFill(shown, i)} size={28} />
          </span>
        ))}
      </div>
      <span className="text-sm text-foreground/70">{text}</span>
    </div>
  );
}

export function RatingStars({
  rating,
  count,
  size = "sm",
}: {
  rating: number;
  count?: number;
  size?: "sm" | "lg";
}) {
  return <RatingDisplay rating={rating} count={count} size={size} />;
}
