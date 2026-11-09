"use client";

import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { shortDate } from "@/lib/format";
import { toast } from "@/stores/toastStore";

export interface FeaturedClinicTarget {
  id: number;
  name: string;
  isPublished: boolean;
  featuredOrder: number | null;
}

interface FeaturedAdminResponse {
  spaId: number;
  name: string;
  isPublished: boolean;
  placement: {
    displayOrder: number;
    adminNotes: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  listLength: number;
  summary: Array<{
    featuredAt: string;
    removedAt: string | null;
    position: number | null;
  }>;
}

export function FeaturedClinicModal({
  spa,
  onClose,
  onSaved,
  call,
}: {
  spa: FeaturedClinicTarget | null;
  onClose: () => void;
  onSaved: () => void;
  call: <T>(path: string, options?: { method?: string; body?: unknown }) => Promise<T>;
}) {
  const titleId = useId();
  const [data, setData] = useState<FeaturedAdminResponse | null>(null);
  const [position, setPosition] = useState("1");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const isFeatured = Boolean(data?.placement);

  useEffect(() => {
    if (!spa) {
      setData(null);
      return;
    }
    let cancelled = false;
    setError(null);
    call<FeaturedAdminResponse>(`/admin/spas/${spa.id}/featured`)
      .then((next) => {
        if (cancelled) return;
        setData(next);
        const defaultPosition = next.placement
          ? next.placement.displayOrder
          : next.listLength + 1;
        setPosition(String(defaultPosition));
        setNotes(next.placement?.adminNotes ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load featured details");
      });
    return () => {
      cancelled = true;
    };
  }, [spa, call]);

  useEffect(() => {
    if (!spa) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !confirmRemove) onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [spa, busy, confirmRemove, onClose]);

  if (!spa) return null;
  const clinic = spa;

  async function save() {
    const parsed = Number(position.trim());
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Position must be a positive whole number.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/spas/${clinic.id}/featured`, {
        method: "PUT",
        body: { displayOrder: parsed, adminNotes: notes },
      });
      toast(isFeatured ? "Featured placement updated." : "Clinic added to featured.");
      await fetch("/api/revalidate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(
        () => {}
      );
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save featured placement");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/spas/${clinic.id}/featured`, { method: "DELETE" });
      toast("Clinic removed from featured.");
      await fetch("/api/revalidate", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(
        () => {}
      );
      setConfirmRemove(false);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove featured placement");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-veda-950/55 backdrop-blur-sm"
        disabled={busy}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-[0_24px_80px_rgba(16,31,23,0.35)]"
      >
        <div className="h-1.5 bg-gradient-to-r from-turmeric-400 via-veda-500 to-veda-800" />
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p id={titleId} className="text-lg font-semibold text-veda-900">
            {isFeatured ? "Manage featured" : "Make featured"}
          </p>
          <div className="mt-5 grid gap-6 md:grid-cols-[1.2fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Clinic name</p>
                <p className="mt-1 text-veda-900">{data?.name ?? spa.name}</p>
              </div>
              <p className="text-sm text-foreground/70">
                Current status:{" "}
                <span className="font-medium text-veda-900">
                  {isFeatured ? `Featured #${data?.placement?.displayOrder}` : "Not featured"}
                </span>
              </p>
              <label className="block text-sm font-medium">
                Display position
                <input
                  className="mt-1 w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
                  inputMode="numeric"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                />
              </label>
              <p className="text-xs text-foreground/55">
                {isFeatured
                  ? "Position 1 appears first. A number larger than the list length is placed at the end."
                  : "Defaults to the end of the current featured list. Position 1 appears first."}
              </p>
              <label className="block text-sm font-medium">
                Internal notes
                <textarea
                  className="mt-1 min-h-[6rem] w-full rounded-lg border border-veda-200 px-3 py-2 text-sm"
                  maxLength={1000}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </label>
              <p className="text-xs text-foreground/55">
                Optional notes about this featured placement. These notes are visible only to administrators.
              </p>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy || !data}
                  onClick={() => void save()}
                  className="rounded-full bg-veda-700 px-5 py-2 text-sm font-semibold text-white hover:bg-veda-600 disabled:opacity-50"
                >
                  {busy ? "Saving…" : isFeatured ? "Update" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="rounded-full bg-gray-200 px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              {isFeatured ? (
                <div className="border-t border-veda-100 pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemove(true)}
                    className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
                  >
                    Remove from featured
                  </button>
                </div>
              ) : null}
            </div>
            <aside className="rounded-2xl border border-veda-100 bg-veda-50/60 p-4">
              <h3 className="text-sm font-semibold text-veda-900">Placement history</h3>
              {data && data.summary.length === 0 ? (
                <p className="mt-3 text-sm text-foreground/55">No previous featured placements.</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {(data?.summary ?? []).map((item, i) => (
                    <li key={`${item.featuredAt}-${i}`} className="text-sm text-foreground/75">
                      <p>
                        Featured {shortDate(item.featuredAt)}
                        {item.position ? ` · #${item.position}` : ""}
                      </p>
                      <p className="text-foreground/55">
                        {item.removedAt ? `Taken down ${shortDate(item.removedAt)}` : "Currently featured"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${spa.name} from Featured Clinics?`}
        message="It will no longer appear in the featured section on the homepage."
        confirmLabel="Remove from featured"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
