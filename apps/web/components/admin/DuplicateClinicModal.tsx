"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";

export interface DuplicateClinicMatch {
  id: number;
  slug: string;
  name: string;
  addressLine: string;
  cityName: string;
  origin: "vendor" | "admin" | "imported";
  isUnclaimed: boolean;
  isPublished: boolean;
  reason: "phone" | "email" | "website" | "place";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function duplicateMatchesFromError(err: unknown): DuplicateClinicMatch[] | null {
  const obj = asRecord(err);
  if (!obj) return null;
  const body = asRecord(obj.body) ?? obj;
  const matches = body.matches;
  const isDuplicate =
    obj.status === 409 ||
    body.code === "duplicate_clinic" ||
    body.error === "Possible duplicate clinics";
  if (!isDuplicate || !Array.isArray(matches) || matches.length === 0) return null;
  return matches as DuplicateClinicMatch[];
}

const ORIGIN_LABEL: Record<DuplicateClinicMatch["origin"], string> = {
  admin: "Admin seed",
  vendor: "Vendor listing",
  imported: "Imported",
};

const REASON_LABEL: Record<DuplicateClinicMatch["reason"], string> = {
  phone: "Same phone",
  email: "Same email",
  website: "Same website",
  place: "Same name and place",
};

export function DuplicateClinicModal({
  matches,
  busy,
  onConfirmDifferent,
  onCancel,
}: {
  matches: DuplicateClinicMatch[] | null;
  busy: boolean;
  onConfirmDifferent: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const open = Boolean(matches?.length);
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!matches?.length || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        disabled={busy}
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
      >
        <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p id={titleId} className="text-lg font-semibold text-veda-900">
            Possible duplicate clinics
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground/75">
            This looks like a listing already on the site. Your form is unchanged. Cancel to keep editing, or confirm
            this is a different location.
          </p>
          <ul className="mt-4 space-y-3">
            {matches.map((match) => (
              <li key={match.id} className="rounded-2xl border border-veda-100 bg-veda-50/70 p-4">
                <p className="font-medium text-veda-900">{match.name}</p>
                <p className="mt-1 text-sm text-foreground/70">
                  {[match.addressLine, match.cityName].filter(Boolean).join(", ")}
                </p>
                <p className="mt-1 text-xs text-foreground/55">
                  {ORIGIN_LABEL[match.origin]}
                  {" · "}
                  {match.isUnclaimed ? "Unclaimed" : "Claimed"}
                  {" · "}
                  {match.isPublished ? "Published" : "Unpublished"}
                  {" · "}
                  {REASON_LABEL[match.reason]}
                </p>
                <a
                  href={`/spas/${match.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-veda-700 underline hover:text-veda-900"
                >
                  Open listing
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={onConfirmDifferent}
              className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
            >
              {busy ? "Saving…" : "This is a different location"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
